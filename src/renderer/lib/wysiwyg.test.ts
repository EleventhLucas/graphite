// @vitest-environment jsdom

import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { GFM } from "@lezer/markdown";
import { describe, expect, it } from "vitest";
import { buildWysiwygDecorations, type WysiwygOptions, wysiwygExtension } from "./wysiwyg";

function decorationSpecs(doc: string, cursor = 0, options?: WysiwygOptions) {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown({ extensions: GFM })],
  });
  const found: Array<{
    from: number;
    to: number;
    className?: string;
    widget?: { ignoreEvent?(): boolean };
    block?: boolean;
  }> = [];
  buildWysiwygDecorations(state, options).between(0, doc.length, (from, to, value) => {
    found.push({
      from,
      to,
      className:
        (value.spec.class as string | undefined) ??
        (value.spec.attributes as { class?: string } | undefined)?.class ??
        undefined,
      widget: value.spec.widget as { ignoreEvent?(): boolean } | undefined,
      block: value.spec.block as boolean | undefined,
    });
  });
  return found;
}

describe("Inline mode decorations", () => {
  it("styles headings and conceals their marker away from the cursor", () => {
    const doc = "intro\n# Heading";
    const decorations = decorationSpecs(doc);
    expect(decorations.some((item) => item.className?.includes("cm-live-heading-1"))).toBe(true);
    expect(decorations.some((item) => item.from === 6 && item.to === 8)).toBe(true);
  });

  it("reveals heading syntax while its text is edited", () => {
    const doc = "intro\n# Heading";
    const decorations = decorationSpecs(doc, doc.indexOf("Heading"));
    expect(decorations.some((item) => item.className?.includes("cm-live-heading-1"))).toBe(true);
    expect(decorations.some((item) => item.from === 6 && item.to === 8)).toBe(false);
  });

  it("renders an inactive Setext heading without leaving its marker line visible", () => {
    const doc = "Intro\n\nSetext heading\n==============";
    const markerLine = doc.indexOf("===");
    const decorations = decorationSpecs(doc);
    expect(decorations.some((item) => item.className?.includes("cm-live-heading-1"))).toBe(true);
    expect(
      decorations.some(
        (item) => item.from === markerLine && item.className === "cm-live-hidden-line",
      ),
    ).toBe(true);
  });

  it("uses GFM nodes for strikethrough and in-place table cells", () => {
    const doc = "~~removed~~\n\n| Mode | Purpose |\n| --- | --- |\n| Inline | Live formatting |";
    const decorations = decorationSpecs(doc);
    expect(decorations.some((item) => item.className?.includes("cm-live-strikethrough"))).toBe(
      true,
    );
    expect(decorations.some((item) => item.className?.includes("cm-live-table-cell"))).toBe(true);
    expect(decorations.some((item) => item.widget && item.block)).toBe(false);
  });

  it("keeps a table visually formatted when one of its cells is active", () => {
    const doc = "intro\n\n| Mode | Purpose |\n| --- | --- |\n| Inline | Live formatting |";
    const decorations = decorationSpecs(doc, doc.indexOf("Inline"));
    expect(decorations.some((item) => item.widget && item.block)).toBe(false);
    expect(decorations.some((item) => item.className === "cm-live-table-cell")).toBe(true);
  });

  it("formats GFM tables that omit outer pipes", () => {
    const doc = "Mode | Purpose\n--- | ---\nInline | Live formatting";
    const decorations = decorationSpecs(doc, doc.indexOf("Inline"));
    expect(
      decorations.filter((item) => item.className?.includes("cm-live-table-cell")),
    ).toHaveLength(4);
    expect(decorations.some((item) => item.className === "cm-live-table-delimiter")).toBe(true);
  });

  it("keeps the same table wrapper while selection moves into an editable cell", () => {
    const doc = "intro\n\n| Mode | Purpose |\n| --- | --- |\n| Inline | Live formatting |";
    const parent = document.createElement("div");
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [markdown({ extensions: GFM }), wysiwygExtension],
      }),
    });

    const table = parent.querySelector<HTMLElement>(".cm-live-table-wrapper");
    expect(table).not.toBeNull();
    view.dispatch({ selection: { anchor: doc.indexOf("Mode") + 1 } });
    expect(parent.querySelector(".cm-live-table-wrapper")).toBe(table);
    expect(parent.querySelector(".cm-live-table-cell")).not.toBeNull();
    expect(view.state.selection.main.head).toBe(doc.indexOf("Mode") + 1);
    view.dispatch({
      changes: { from: doc.indexOf("Mode"), to: doc.indexOf("Mode") + 4, insert: "View" },
    });
    expect(parent.querySelector(".cm-live-table-wrapper")).toBe(table);
    expect(parent.querySelector(".cm-live-table-header")?.textContent).toContain("View");
    view.destroy();
  });

  it("renders an inactive horizontal rule and reveals its source when active", () => {
    const doc = "intro\n\n---\n\noutro";
    const marker = doc.indexOf("---");
    expect(
      decorationSpecs(doc).some((item) => item.from === marker && item.to === marker + 3),
    ).toBe(true);
    expect(
      decorationSpecs(doc, marker + 1).some(
        (item) => item.from === marker && item.to === marker + 3,
      ),
    ).toBe(false);
  });

  it("keeps a task as a clickable checkbox even when its line is active", () => {
    const doc = "intro\n- [ ] Test task";
    const decorations = decorationSpecs(doc, doc.indexOf("Test"));
    const checkbox = decorations.find((item) => item.widget)?.widget;
    expect(checkbox).toBeDefined();
    expect(checkbox?.ignoreEvent?.()).toBe(true);
  });

  it("keeps a bullet marker rendered while its list item is active", () => {
    const doc = "intro\n- First item\n- Second item";
    const marker = doc.indexOf("- Second");
    const decorations = decorationSpecs(doc, doc.indexOf("Second"));

    expect(
      decorations.some((item) => item.from === marker && item.to === marker + 1 && item.widget),
    ).toBe(true);
  });

  it("conceals wikilink targets when a display label is present", () => {
    const doc = "intro\nSee [[Notes/Target|friendly label]].";
    const decorations = decorationSpecs(doc);
    const opening = doc.indexOf("[[");
    const labelStart = doc.indexOf("friendly label");
    expect(decorations.some((item) => item.from === opening && item.to === labelStart)).toBe(true);
    expect(
      decorations.some((item) => item.from === labelStart && item.className === "cm-live-wikilink"),
    ).toBe(true);
    expect(decorations.some((item) => item.from === doc.indexOf("]]"))).toBe(true);
  });

  it("leaves blank lines at CodeMirror's stable document height", () => {
    const doc = "First paragraph\n\nSecond paragraph";
    const blankLine = doc.indexOf("\n") + 1;
    expect(
      decorationSpecs(doc).some(
        (item) => item.from === blankLine && item.className === "cm-live-blank-line",
      ),
    ).toBe(false);
    expect(
      decorationSpecs(doc, blankLine).some(
        (item) => item.from === blankLine && item.className === "cm-live-blank-line",
      ),
    ).toBe(false);
  });

  it("renders a standalone embed as Preview content when vault context is available", () => {
    const doc = "Intro\n\n![[Attachments/pixel.png]]";
    const embedStart = doc.indexOf("![[");
    const decorations = decorationSpecs(doc, 0, {
      vaultId: "vault",
      sourcePath: "Note.md",
      onOpenNote: () => undefined,
    });

    expect(decorations.some((item) => item.widget !== undefined && item.block)).toBe(true);
    expect(decorations.some((item) => item.from === embedStart && item.to > item.from)).toBe(true);

    const active = decorationSpecs(doc, embedStart + 2, {
      vaultId: "vault",
      sourcePath: "Note.md",
      onOpenNote: () => undefined,
    });
    expect(active.some((item) => item.widget !== undefined && item.block)).toBe(true);
  });

  it("renders a standalone Markdown image through the same Preview content path", () => {
    const doc = "Intro\n\n![Pixel](Attachments/pixel.png)";
    const imageStart = doc.indexOf("![");
    const decorations = decorationSpecs(doc, 0, {
      vaultId: "vault",
      sourcePath: "Note.md",
      onOpenNote: () => undefined,
    });

    expect(decorations.some((item) => item.widget !== undefined && item.block)).toBe(true);
    expect(decorations.some((item) => item.from === imageStart && item.to > item.from)).toBe(true);
  });

  it("renders frontmatter as a properties block until it is activated", () => {
    const doc = "---\ntitle: Example\ntags:\n  - test\n---\n# Note";
    const decorations = decorationSpecs(doc, doc.indexOf("Note"));
    expect(decorationSpecs(doc).some((item) => item.widget && item.block)).toBe(true);
    expect(decorations.some((item) => item.widget && item.block)).toBe(true);
    expect(
      decorations.some((item) => item.from === 0 && item.to === doc.indexOf("\n#") && item.block),
    ).toBe(true);
  });

  it("toggles a task without moving the editing selection into its line", () => {
    const doc = "# Note\n\n- [ ] Test task";
    const cursor = doc.indexOf("Note");
    const parent = document.createElement("div");
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: { anchor: cursor },
        extensions: [markdown({ extensions: GFM }), wysiwygExtension],
      }),
    });

    const checkbox = parent.querySelector<HTMLInputElement>(".cm-live-task");
    expect(checkbox).not.toBeNull();
    checkbox?.click();
    expect(view.state.doc.toString()).toContain("- [x] Test task");
    expect(view.state.selection.main.head).toBe(cursor);
    view.destroy();
  });

  it("reveals frontmatter source only when the properties block is activated", () => {
    const doc = "---\ntitle: Example\n---\n# Note";
    const parent = document.createElement("div");
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: { anchor: doc.indexOf("Note") },
        extensions: [markdown({ extensions: GFM }), wysiwygExtension],
      }),
    });

    const editYaml = parent.querySelector<HTMLButtonElement>(".cm-live-properties-source-button");
    expect(editYaml).not.toBeNull();
    editYaml?.click();
    expect(view.state.selection.main.head).toBeLessThan(doc.indexOf("\n#"));
    expect(parent.querySelector(".cm-live-properties")).not.toBeNull();
    view.destroy();
  });

  it("edits scalar and list properties without exposing YAML", () => {
    const doc = "---\ntitle: Example\ntags:\n  - old\n---\n# Note";
    const parent = document.createElement("div");
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: { anchor: doc.indexOf("Note") },
        extensions: [markdown({ extensions: GFM }), wysiwygExtension],
      }),
    });

    const title = parent.querySelector<HTMLInputElement>('input[aria-label="Property: title"]');
    const tags = parent.querySelector<HTMLInputElement>('input[aria-label="Property: tags"]');
    expect(title).not.toBeNull();
    expect(tags).not.toBeNull();
    if (title && tags) {
      title.value = "Updated";
      title.dispatchEvent(new Event("change", { bubbles: true }));
      const currentTags = parent.querySelector<HTMLInputElement>(
        'input[aria-label="Property: tags"]',
      );
      if (!currentTags) throw new Error("Expected tags input after title update.");
      currentTags.value = "one, two";
      currentTags.dispatchEvent(new Event("change", { bubbles: true }));
    }
    expect(view.state.doc.toString()).toContain("title: Updated");
    expect(view.state.doc.toString()).toContain("tags:\n  - one\n  - two");
    view.destroy();
  });
});
