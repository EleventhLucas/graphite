import { syntaxTree } from "@codemirror/language";
import { StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

const STYLED_NODES: Record<string, string> = {
  ATXHeading1: "cm-live-heading cm-live-heading-1",
  ATXHeading2: "cm-live-heading cm-live-heading-2",
  ATXHeading3: "cm-live-heading cm-live-heading-3",
  ATXHeading4: "cm-live-heading cm-live-heading-4",
  ATXHeading5: "cm-live-heading cm-live-heading-5",
  ATXHeading6: "cm-live-heading cm-live-heading-6",
  Blockquote: "cm-live-blockquote",
  Emphasis: "cm-live-emphasis",
  FencedCode: "cm-live-code-block",
  InlineCode: "cm-live-inline-code",
  Link: "cm-live-link",
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
  entries: Array<[string, string]>;
}

function selectionInside(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((selection) => selection.head >= from && selection.head <= to);
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

  const entries: Array<[string, string]> = [];
  for (let number = 2; number < closingLine; number += 1) {
    const value = state.doc.line(number).text;
    const property = /^([\w-]+):\s*(.*)$/.exec(value);
    if (property) {
      entries.push([property[1], property[2]]);
      continue;
    }
    const listItem = /^\s*-\s+(.+)$/.exec(value);
    if (listItem && entries.length) {
      const previous = entries.at(-1);
      if (previous) previous[1] = previous[1] ? `${previous[1]}, ${listItem[1]}` : listItem[1];
    }
  }

  return { from: 0, to: state.doc.line(closingLine).to, entries };
}

class FrontmatterWidget extends WidgetType {
  constructor(private readonly range: FrontmatterRange) {
    super();
  }

  eq(other: FrontmatterWidget) {
    return (
      other.range.from === this.range.from &&
      other.range.to === this.range.to &&
      JSON.stringify(other.range.entries) === JSON.stringify(this.range.entries)
    );
  }

  toDOM(view: EditorView) {
    const properties = document.createElement("div");
    properties.className = "cm-live-properties";
    properties.tabIndex = 0;
    properties.setAttribute("role", "button");
    properties.setAttribute("aria-label", "Document properties. Activate to edit YAML source.");

    const heading = document.createElement("span");
    heading.className = "cm-live-properties-heading";
    heading.textContent = "Properties";
    properties.append(heading);

    const rows = document.createElement("dl");
    for (const [key, value] of this.range.entries) {
      const term = document.createElement("dt");
      term.textContent = key;
      const description = document.createElement("dd");
      description.textContent = value || "—";
      rows.append(term, description);
    }
    properties.append(rows);

    const edit = () => {
      view.dispatch({ selection: { anchor: Math.min(this.range.from + 4, this.range.to) } });
      view.focus();
    };
    properties.addEventListener("mousedown", (event) => event.preventDefault());
    properties.addEventListener("click", edit);
    properties.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      edit();
    });
    return properties;
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

function markerShouldRemainVisible(
  state: EditorState,
  name: string,
  parentFrom: number,
  parentTo: number,
) {
  if (["CodeMark", "HeaderMark", "QuoteMark"].includes(name)) return false;
  return selectionInside(state, parentFrom, parentTo);
}

export function buildWysiwygDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const taskMarkers = new Set<number>();
  const listMarkers = new Set<number>();
  const decoratedLines = new Set<string>();
  const frontmatter = parseFrontmatter(state);

  if (frontmatter) {
    if (frontmatterIsActive(state, frontmatter)) {
      decorations.push(
        Decoration.mark({ class: "cm-live-frontmatter-source" }).range(
          frontmatter.from,
          frontmatter.to,
        ),
      );
    } else {
      decorations.push(
        Decoration.replace({ widget: new FrontmatterWidget(frontmatter), block: true }).range(
          frontmatter.from,
          frontmatter.to,
        ),
      );
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

      const className = STYLED_NODES[node.name];
      if (className) {
        decorations.push(Decoration.mark({ class: className }).range(node.from, node.to));
      }

      const lineClass = node.name.startsWith("ATXHeading")
        ? "cm-live-heading-line"
        : node.name === "FencedCode"
          ? "cm-live-code-line"
          : node.name === "Blockquote"
            ? "cm-live-blockquote-line"
            : undefined;
      if (lineClass) {
        const first = state.doc.lineAt(node.from).number;
        const last = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
        for (let number = first; number <= last; number += 1) {
          const line = state.doc.line(number);
          const key = `${line.from}:${lineClass}`;
          if (decoratedLines.has(key)) continue;
          decoratedLines.add(key);
          decorations.push(Decoration.line({ attributes: { class: lineClass } }).range(line.from));
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
        if (!parent || !markerShouldRemainVisible(state, node.name, parent.from, parent.to)) {
          decorations.push(Decoration.replace({}).range(node.from, node.to));
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
      if (selectionInside(state, start, end)) continue;
      if (wikiLink[1]) decorations.push(Decoration.replace({}).range(start, start + 1));
      const alias = wikiLink[2].indexOf("|");
      if (alias >= 0) {
        const contentStart = start + wikiLink[1].length + 2;
        decorations.push(Decoration.replace({}).range(contentStart, contentStart + alias + 1));
      }
    }
  }

  return Decoration.set(decorations, true);
}

const wysiwygDecorations = StateField.define<DecorationSet>({
  create: buildWysiwygDecorations,
  update(decorations, transaction) {
    if (transaction.docChanged || transaction.selection) {
      return buildWysiwygDecorations(transaction.state);
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const wysiwygExtension = [
  wysiwygDecorations,
  EditorView.editorAttributes.of({ class: "cm-live-editor" }),
];
