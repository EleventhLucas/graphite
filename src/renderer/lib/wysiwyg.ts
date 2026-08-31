import { syntaxTree } from "@codemirror/language";
import { StateField, type EditorState, type Range } from "@codemirror/state";
import {
  BlockWrapper,
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MarkdownEmbed } from "../components/MarkdownPreview";

export interface WysiwygOptions {
  vaultId: string;
  sourcePath: string;
  onOpenNote(path: string): void;
}

const STYLED_NODES: Record<string, string> = {
  ATXHeading1: "cm-live-heading cm-live-heading-1",
  ATXHeading2: "cm-live-heading cm-live-heading-2",
  ATXHeading3: "cm-live-heading cm-live-heading-3",
  ATXHeading4: "cm-live-heading cm-live-heading-4",
  ATXHeading5: "cm-live-heading cm-live-heading-5",
  ATXHeading6: "cm-live-heading cm-live-heading-6",
  Autolink: "cm-live-link",
  Blockquote: "cm-live-blockquote",
  CodeBlock: "cm-live-code-block",
  Emphasis: "cm-live-emphasis",
  FencedCode: "cm-live-code-block",
  InlineCode: "cm-live-inline-code",
  Link: "cm-live-link",
  SetextHeading1: "cm-live-heading cm-live-heading-1",
  SetextHeading2: "cm-live-heading cm-live-heading-2",
  StrongEmphasis: "cm-live-strong",
  Strikethrough: "cm-live-strikethrough",
};

const HIDDEN_MARKERS = new Set([
  "CodeMark",
  "EmphasisMark",
  "HeaderMark",
  "LinkMark",
  "QuoteMark",
  "StrikethroughMark",
  "URL",
]);

interface FrontmatterRange {
  from: number;
  to: number;
  entries: FrontmatterEntry[];
}

interface FrontmatterEntry {
  key: string;
  value: string;
  valueFrom: number;
  valueTo: number;
  listIndent?: string;
}

interface TableData {
  headers: string[];
  alignments: Array<"left" | "center" | "right">;
  rows: string[][];
}

function selectionInside(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((selection) => selection.from <= to && selection.to >= from);
}

function splitTableRow(value: string): string[] {
  const trimmed = value.trim();
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const character of trimmed) {
    if (character === "|" && !escaped) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
    escaped = character === "\\" && !escaped;
    if (character !== "\\") escaped = false;
  }
  cells.push(cell.trim());
  if (trimmed.startsWith("|")) cells.shift();
  if (trimmed.endsWith("|")) cells.pop();
  return cells;
}

function parseTable(value: string): TableData | null {
  const lines = value.split("\n");
  if (lines.length < 2) return null;
  const headers = splitTableRow(lines[0]);
  const delimiters = splitTableRow(lines[1]);
  if (
    headers.length === 0 ||
    headers.length !== delimiters.length ||
    !delimiters.every((cell) => /^:?-{3,}:?$/.test(cell))
  ) {
    return null;
  }
  return {
    headers,
    alignments: delimiters.map((cell) => {
      if (cell.startsWith(":") && cell.endsWith(":")) return "center";
      if (cell.endsWith(":")) return "right";
      return "left";
    }),
    rows: lines.slice(2).map(splitTableRow),
  };
}

function tablePipeOffsets(value: string): number[] {
  const offsets: number[] = [];
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "|" && !escaped) offsets.push(index);
    escaped = character === "\\" && !escaped;
    if (character !== "\\") escaped = false;
  }
  return offsets;
}

function tableCellOffsets(value: string): Array<{ from: number; to: number }> {
  const pipes = tablePipeOffsets(value);
  const firstContent = value.search(/\S/);
  const lastContent = value.search(/\s*$/) - 1;
  const leadingPipe = firstContent >= 0 && pipes[0] === firstContent;
  const trailingPipe = lastContent >= 0 && pipes.at(-1) === lastContent;
  const separators = pipes.slice(leadingPipe ? 1 : 0, trailingPipe ? -1 : undefined);
  const cells: Array<{ from: number; to: number }> = [];
  let from = leadingPipe ? (pipes[0] ?? -1) + 1 : 0;
  for (const separator of separators) {
    cells.push({ from, to: separator });
    from = separator + 1;
  }
  cells.push({ from, to: trailingPipe ? (pipes.at(-1) ?? value.length) : value.length });
  return cells;
}

function tableCanRenderInPlace(state: EditorState, from: number, to: number): TableData | null {
  const table = parseTable(state.doc.sliceString(from, to));
  if (!table) return null;
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(Math.max(from, to - 1)).number;
  for (let number = first; number <= last; number += 1) {
    if (number === first + 1) continue;
    const line = state.doc.line(number);
    if (tableCellOffsets(line.text).length !== table.headers.length) return null;
  }
  return table;
}

function frontmatterIsActive(state: EditorState, range: FrontmatterRange): boolean {
  return state.selection.ranges.some(
    (selection) => selection.head > range.from && selection.head < range.to,
  );
}

function parseFrontmatter(state: EditorState): FrontmatterRange | null {
  if (state.doc.lines < 2 || state.doc.line(1).text.trim() !== "---") return null;
  let closingLine = 0;
  for (let number = 2; number <= state.doc.lines; number += 1) {
    if (state.doc.line(number).text.trim() === "---") {
      closingLine = number;
      break;
    }
  }
  if (!closingLine) return null;

  const entries: FrontmatterEntry[] = [];
  for (let number = 2; number < closingLine; number += 1) {
    const line = state.doc.line(number);
    const property = /^([\w-]+):(\s*)(.*)$/.exec(line.text);
    if (!property) continue;

    const values: string[] = [];
    if (property[3]) values.push(property[3]);
    let valueTo = line.to;
    let listIndent: string | undefined;
    while (number + 1 < closingLine) {
      const nextLine = state.doc.line(number + 1);
      const listItem = /^(\s*)-\s+(.+)$/.exec(nextLine.text);
      if (!listItem) break;
      listIndent ??= listItem[1];
      values.push(listItem[2]);
      valueTo = nextLine.to;
      number += 1;
    }

    entries.push({
      key: property[1],
      value: values.join(", "),
      valueFrom: line.from + property[1].length + 1 + property[2].length,
      valueTo,
      ...(listIndent === undefined ? {} : { listIndent }),
    });
  }

  return { from: 0, to: state.doc.line(closingLine).to, entries };
}

class FrontmatterWidget extends WidgetType {
  constructor(private readonly range: FrontmatterRange) {
    super();
  }

  eq(other: FrontmatterWidget) {
    return JSON.stringify(other.range.entries) === JSON.stringify(this.range.entries);
  }

  toDOM(view: EditorView) {
    const block = document.createElement("div");
    block.className = "cm-live-properties-block";
    const properties = document.createElement("div");
    properties.className = "cm-live-properties";
    properties.setAttribute("role", "group");
    properties.setAttribute("aria-label", "Document properties");

    const header = document.createElement("div");
    header.className = "cm-live-properties-header";
    const heading = document.createElement("span");
    heading.className = "cm-live-properties-heading";
    heading.textContent = "Properties";
    const editSource = document.createElement("button");
    editSource.type = "button";
    editSource.className = "cm-live-properties-source-button";
    editSource.textContent = "Edit YAML";
    editSource.addEventListener("click", () => {
      view.dispatch({
        selection: { anchor: Math.min(this.range.from + 4, this.range.to) },
        scrollIntoView: true,
      });
      view.focus();
    });
    header.append(heading, editSource);
    properties.append(header);

    const rows = document.createElement("div");
    rows.className = "cm-live-properties-rows";
    for (const entry of this.range.entries) {
      const label = document.createElement("label");
      const key = document.createElement("span");
      key.className = "cm-live-property-key";
      key.textContent = entry.key;
      const input = document.createElement("input");
      input.type = "text";
      input.value = entry.value;
      input.setAttribute("aria-label", `Property: ${entry.key}`);
      input.addEventListener("change", () => {
        const insert =
          entry.listIndent === undefined
            ? input.value
            : input.value
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
                .map((value) => `\n${entry.listIndent}- ${value}`)
                .join("");
        view.dispatch({ changes: { from: entry.valueFrom, to: entry.valueTo, insert } });
      });
      label.append(key, input);
      rows.append(label);
    }
    properties.append(rows);
    block.append(properties);
    return block;
  }

  ignoreEvent() {
    return true;
  }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly from: number,
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget) {
    return other.checked === this.checked && other.from === this.from;
  }

  toDOM(view: EditorView) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "cm-live-task";
    checkbox.checked = this.checked;
    checkbox.setAttribute(
      "aria-label",
      this.checked ? "Mark task incomplete" : "Mark task complete",
    );
    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
      view.dispatch({
        changes: {
          from: this.from + 1,
          to: this.from + 2,
          insert: checkbox.checked ? "x" : " ",
        },
      });
    });
    return checkbox;
  }

  ignoreEvent() {
    return true;
  }
}

class ListMarkerWidget extends WidgetType {
  constructor(private readonly marker: string) {
    super();
  }

  eq(other: ListMarkerWidget) {
    return other.marker === this.marker;
  }

  toDOM() {
    const marker = document.createElement("span");
    marker.className = "cm-live-list-marker";
    marker.textContent = /^\d/.test(this.marker) ? this.marker : "•";
    return marker;
  }
}

class EmbedWidget extends WidgetType {
  private root?: Root;
  private resizeObserver?: ResizeObserver;

  constructor(
    private readonly target: string,
    private readonly source: string,
    private readonly options: WysiwygOptions,
  ) {
    super();
  }

  eq(other: EmbedWidget) {
    return (
      other.target === this.target &&
      other.source === this.source &&
      other.options.vaultId === this.options.vaultId &&
      other.options.sourcePath === this.options.sourcePath
    );
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("div");
    wrapper.className = "markdown-preview cm-live-embed-widget";
    const toolbar = document.createElement("div");
    toolbar.className = "cm-live-embed-toolbar";
    const editSource = document.createElement("button");
    editSource.type = "button";
    editSource.className = "cm-live-embed-source-button";
    editSource.textContent = "Edit embed";
    editSource.addEventListener("click", () => {
      const to = view.posAtDOM(wrapper);
      const from = Math.max(0, to - this.source.length);
      if (view.state.doc.sliceString(from, to) !== this.source) return;
      view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
      view.focus();
    });
    toolbar.append(editSource);
    const content = document.createElement("div");
    content.className = "cm-live-embed-content";
    wrapper.append(toolbar, content);
    this.root = createRoot(content);
    this.root.render(
      createElement(MarkdownEmbed, {
        vaultId: this.options.vaultId,
        sourcePath: this.options.sourcePath,
        target: this.target,
        onOpenNote: this.options.onOpenNote,
      }),
    );
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => view.requestMeasure());
      this.resizeObserver.observe(wrapper);
    }
    queueMicrotask(() => view.requestMeasure());
    return wrapper;
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    const root = this.root;
    this.root = undefined;
    if (root) queueMicrotask(() => root.unmount());
  }

  ignoreEvent() {
    return true;
  }
}

function markerShouldRemainVisible(state: EditorState, parentFrom: number, parentTo: number) {
  return selectionInside(state, parentFrom, parentTo);
}

const tableWrapper = BlockWrapper.create({
  tagName: "div",
  attributes: { class: "cm-live-table-wrapper" },
});

function tableCellClass(
  header: boolean,
  alignment: "left" | "center" | "right",
  last: boolean,
): string {
  return [
    "cm-live-table-cell",
    header ? "cm-live-table-heading-cell" : "",
    alignment === "center" ? "cm-live-table-cell-center" : "",
    alignment === "right" ? "cm-live-table-cell-right" : "",
    last ? "cm-live-table-cell-last" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function decorateTableInPlace(
  state: EditorState,
  from: number,
  to: number,
  table: TableData,
  decorations: Range<Decoration>[],
): void {
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(Math.max(from, to - 1)).number;
  for (let number = first; number <= last; number += 1) {
    const line = state.doc.line(number);
    if (number === first + 1) {
      decorations.push(
        Decoration.line({ attributes: { class: "cm-live-table-delimiter" } }).range(line.from),
      );
      decorations.push(Decoration.replace({}).range(line.from, line.to));
      continue;
    }

    const header = number === first;
    const bodyIndex = number - first - 2;
    const rowClass = [
      "cm-live-table-row",
      header ? "cm-live-table-header" : "cm-live-table-body",
      !header && bodyIndex % 2 === 1 ? "cm-live-table-row-even" : "",
      number === last ? "cm-live-table-row-last" : "",
    ]
      .filter(Boolean)
      .join(" ");
    decorations.push(Decoration.line({ attributes: { class: rowClass } }).range(line.from));

    for (const pipe of tablePipeOffsets(line.text)) {
      decorations.push(Decoration.replace({}).range(line.from + pipe, line.from + pipe + 1));
    }
    const cells = tableCellOffsets(line.text);
    for (let column = 0; column < cells.length; column += 1) {
      const cellFrom = line.from + cells[column].from;
      const cellTo = line.from + cells[column].to;
      if (cellFrom >= cellTo) continue;
      decorations.push(
        Decoration.mark({
          class: tableCellClass(
            header,
            table.alignments[column] ?? "left",
            column === table.headers.length - 1,
          ),
        }).range(cellFrom, cellTo),
      );
    }
  }
}

function buildTableWrappers(view: EditorView) {
  const wrappers: Range<BlockWrapper>[] = [];
  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name !== "Table") return;
      if (tableCanRenderInPlace(view.state, node.from, node.to)) {
        wrappers.push(tableWrapper.range(node.from, node.to));
      }
      return false;
    },
  });
  return BlockWrapper.set(wrappers, true);
}

function buildTableAtomicRanges(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name !== "Table") return;
      const table = tableCanRenderInPlace(view.state, node.from, node.to);
      if (!table) return false;
      const first = view.state.doc.lineAt(node.from).number;
      const last = view.state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
      for (let number = first; number <= last; number += 1) {
        const line = view.state.doc.line(number);
        if (number === first + 1) {
          ranges.push(Decoration.replace({}).range(line.from, line.to));
          continue;
        }
        for (const pipe of tablePipeOffsets(line.text)) {
          ranges.push(Decoration.replace({}).range(line.from + pipe, line.from + pipe + 1));
        }
      }
      return false;
    },
  });
  return Decoration.set(ranges, true);
}

export function buildWysiwygDecorations(
  state: EditorState,
  options?: WysiwygOptions,
): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const taskMarkers = new Set<number>();
  const listMarkers = new Set<number>();
  const decoratedLines = new Set<string>();
  const frontmatter = parseFrontmatter(state);

  if (frontmatter) {
    decorations.push(
      Decoration.widget({
        widget: new FrontmatterWidget(frontmatter),
        block: true,
        side: 1,
      }).range(frontmatter.to),
    );
    if (frontmatterIsActive(state, frontmatter)) {
      decorations.push(
        Decoration.mark({ class: "cm-live-frontmatter-source" }).range(
          frontmatter.from,
          frontmatter.to,
        ),
      );
    } else {
      decorations.push(Decoration.replace({ block: true }).range(frontmatter.from, frontmatter.to));
    }
  }

  syntaxTree(state).iterate({
    enter(node) {
      if (
        frontmatter &&
        node.from >= frontmatter.from &&
        node.to <= frontmatter.to &&
        node.name !== "Document"
      ) {
        return false;
      }

      if (node.name === "Table") {
        const table = tableCanRenderInPlace(state, node.from, node.to);
        if (table) {
          decorateTableInPlace(state, node.from, node.to, table, decorations);
          return false;
        }
      }

      if (node.name === "Image" && options) {
        const line = state.doc.lineAt(node.from);
        const url = node.node.getChild("URL");
        if (url && line.text.trim() === state.doc.sliceString(node.from, node.to)) {
          const source = state.doc.sliceString(node.from, node.to);
          decorations.push(
            Decoration.line({ attributes: { class: "cm-live-embed-source-line" } }).range(
              line.from,
            ),
          );
          decorations.push(
            Decoration.widget({
              widget: new EmbedWidget(state.doc.sliceString(url.from, url.to), source, options),
              block: true,
              side: 1,
            }).range(node.to),
          );
          if (selectionInside(state, node.from, node.to)) {
            decorations.push(
              Decoration.mark({ class: "cm-live-wikilink-source" }).range(node.from, node.to),
            );
          } else {
            decorations.push(Decoration.replace({}).range(node.from, node.to));
          }
          return false;
        }
      }

      if (node.name === "HorizontalRule") {
        const line = state.doc.lineAt(node.from);
        decorations.push(
          Decoration.line({ attributes: { class: "cm-live-hr-line" } }).range(line.from),
        );
        if (!selectionInside(state, node.from, node.to)) {
          decorations.push(Decoration.replace({}).range(node.from, node.to));
        }
        return false;
      }

      const className = STYLED_NODES[node.name];
      if (className) {
        decorations.push(Decoration.mark({ class: className }).range(node.from, node.to));
      }

      if (node.name === "Paragraph") {
        const parentName = node.node.parent?.name;
        if (parentName !== "ListItem") {
          const first = state.doc.lineAt(node.from);
          const last = state.doc.lineAt(Math.max(node.from, node.to - 1));
          decorations.push(
            Decoration.line({ attributes: { class: "cm-live-paragraph-start" } }).range(first.from),
          );
          decorations.push(
            Decoration.line({ attributes: { class: "cm-live-paragraph-end" } }).range(last.from),
          );
        }
      }

      const headingLevel =
        node.name.startsWith("ATXHeading") || node.name.startsWith("SetextHeading")
          ? node.name.at(-1)
          : undefined;
      if (node.name.startsWith("SetextHeading") && !selectionInside(state, node.from, node.to)) {
        const markerLine = state.doc.lineAt(Math.max(node.from, node.to - 1));
        decorations.push(
          Decoration.line({ attributes: { class: "cm-live-hidden-line" } }).range(markerLine.from),
        );
      }
      const lineClass = headingLevel
        ? `cm-live-heading-line cm-live-heading-line-${headingLevel}`
        : node.name === "FencedCode" || node.name === "CodeBlock"
          ? "cm-live-code-line"
          : node.name === "Blockquote"
            ? "cm-live-blockquote-line"
            : undefined;
      if (lineClass) {
        const first = state.doc.lineAt(node.from).number;
        const last = node.name.startsWith("SetextHeading")
          ? first
          : state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
        for (let number = first; number <= last; number += 1) {
          const line = state.doc.line(number);
          const key = `${line.from}:${lineClass}`;
          if (decoratedLines.has(key)) continue;
          decoratedLines.add(key);
          const edges =
            node.name === "FencedCode" || node.name === "CodeBlock"
              ? `${number === first ? " cm-live-code-start" : ""}${number === last ? " cm-live-code-end" : ""}`
              : "";
          decorations.push(
            Decoration.line({ attributes: { class: `${lineClass}${edges}` } }).range(line.from),
          );
        }
      }

      if (node.name === "TaskMarker") {
        taskMarkers.add(node.from);
        const checked = state.doc.sliceString(node.from, node.to).toLowerCase() !== "[ ]";
        decorations.push(
          Decoration.replace({ widget: new TaskCheckboxWidget(checked, node.from) }).range(
            node.from,
            node.to,
          ),
        );
        return;
      }

      if (node.name === "ListMark") {
        listMarkers.add(node.from);
        const line = state.doc.lineAt(node.from);
        const task = /^\s*\[[ xX]\]/.test(state.doc.sliceString(node.to, line.to));
        const marker = state.doc.sliceString(node.from, node.to).trim();
        if (!task && selectionInside(state, line.from, line.to)) return;
        decorations.push(
          Decoration.replace(task ? {} : { widget: new ListMarkerWidget(marker) }).range(
            node.from,
            node.to,
          ),
        );
        return;
      }

      if (HIDDEN_MARKERS.has(node.name)) {
        const parent = node.node.parent;
        if (!parent || !markerShouldRemainVisible(state, parent.from, parent.to)) {
          const line = state.doc.lineAt(node.from);
          const markerEnd =
            node.name === "HeaderMark" &&
            node.to < line.to &&
            /\s/.test(state.doc.sliceString(node.to, node.to + 1))
              ? node.to + 1
              : node.to;
          decorations.push(Decoration.replace({}).range(node.from, markerEnd));
        }
      }
    },
  });

  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);
    if (frontmatter && line.from >= frontmatter.from && line.to <= frontmatter.to) continue;
    const task = /^(\s*[-+*]\s+)(\[[ xX]\])/.exec(line.text);
    if (task) {
      const listFrom = line.from + task[1].search(/[-+*]/);
      const taskFrom = line.from + task[1].length;
      if (!taskMarkers.has(taskFrom)) {
        if (!listMarkers.has(listFrom)) {
          decorations.push(Decoration.replace({}).range(listFrom, listFrom + 1));
        }
        const checked = task[2].toLowerCase() !== "[ ]";
        decorations.push(
          Decoration.replace({ widget: new TaskCheckboxWidget(checked, taskFrom) }).range(
            taskFrom,
            taskFrom + 3,
          ),
        );
      }
    }

    for (const wikiLink of line.text.matchAll(/(!?)\[\[([^\]\n]+)\]\]/g)) {
      const start = line.from + (wikiLink.index ?? 0);
      const end = start + wikiLink[0].length;
      const embedded = wikiLink[1] === "!";
      if (embedded && options && line.text.trim() === wikiLink[0]) {
        decorations.push(
          Decoration.line({ attributes: { class: "cm-live-embed-source-line" } }).range(line.from),
        );
        decorations.push(
          Decoration.widget({
            widget: new EmbedWidget(wikiLink[2], wikiLink[0], options),
            block: true,
            side: 1,
          }).range(end),
        );
        if (selectionInside(state, start, end)) {
          decorations.push(Decoration.mark({ class: "cm-live-wikilink-source" }).range(start, end));
        } else {
          decorations.push(Decoration.replace({}).range(start, end));
        }
        continue;
      }

      if (selectionInside(state, start, end)) {
        decorations.push(Decoration.mark({ class: "cm-live-wikilink-source" }).range(start, end));
        continue;
      }

      const contentStart = start + (embedded ? 3 : 2);
      const contentEnd = end - 2;
      const alias = wikiLink[2].indexOf("|");
      const labelStart = alias >= 0 ? contentStart + alias + 1 : contentStart;
      decorations.push(Decoration.replace({}).range(start, labelStart));
      decorations.push(Decoration.replace({}).range(contentEnd, end));
      if (labelStart < contentEnd) {
        decorations.push(
          Decoration.mark({
            class: embedded ? "cm-live-wikilink cm-live-embed-link" : "cm-live-wikilink",
          }).range(labelStart, contentEnd),
        );
      }
    }
  }

  return Decoration.set(decorations, true);
}

export function createWysiwygExtension(options?: WysiwygOptions) {
  const wysiwygDecorations = StateField.define<DecorationSet>({
    create: (state) => buildWysiwygDecorations(state, options),
    update(decorations, transaction) {
      if (transaction.docChanged || transaction.selection) {
        return buildWysiwygDecorations(transaction.state, options);
      }
      return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  return [
    wysiwygDecorations,
    EditorView.blockWrappers.of(buildTableWrappers),
    EditorView.atomicRanges.of(buildTableAtomicRanges),
    EditorView.editorAttributes.of({ class: "cm-live-editor" }),
  ];
}

export const wysiwygExtension = createWysiwygExtension();
