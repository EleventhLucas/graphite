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

  it("uses GFM nodes for strikethrough and inactive table rendering", () => {
    const doc = "~~removed~~\n\n| Mode | Purpose |\n| --- | --- |\n| Inline | Live formatting |";
    const decorations = decorationSpecs(doc);
    expect(decorations.some((item) => item.className?.includes("cm-live-strikethrough"))).toBe(
      true,
    );
    expect(decorations.some((item) => item.widget && item.block)).toBe(true);
  });

  it("reveals a table source when its cells are active", () => {
    const doc = "intro\n\n| Mode | Purpose |\n| --- | --- |\n| Inline | Live formatting |";
    const decorations = decorationSpecs(doc, doc.indexOf("Inline"));
    expect(decorations.some((item) => item.widget && item.block)).toBe(false);
    expect(decorations.some((item) => item.className === "cm-live-table-cell")).toBe(true);
  });

  it("activates an inactive table for source editing", () => {
    const doc = "intro\n\n| Mode | Purpose |\n| --- | --- |\n| Inline | Live formatting |";
    const parent = document.createElement("div");
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [markdown({ extensions: GFM }), wysiwygExtension],
      }),
    });

    const table = parent.querySelector<HTMLElement>(".cm-live-table-widget");
    expect(table).not.toBeNull();
    table?.click();
    expect(parent.querySelector(".cm-live-table-widget")).toBeNull();
    expect(view.state.selection.main.head).toBeGreaterThan(doc.indexOf("| Mode"));
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

  it("collapses source-only blank lines until the cursor enters them", () => {
    const doc = "First paragraph\n\nSecond paragraph";
    const blankLine = doc.indexOf("\n") + 1;
    expect(
      decorationSpecs(doc).some(
        (item) => item.from === blankLine && item.className === "cm-live-blank-line",
      ),
    ).toBe(true);
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

    expect(
      decorations.some(
        (item) => item.from === embedStart && item.widget !== undefined && item.block,
      ),
    ).toBe(true);
  });

  it("renders a standalone Markdown image through the same Preview content path", () => {
    const doc = "Intro\n\n![Pixel](Attachments/pixel.png)";
    const imageStart = doc.indexOf("![");
    const decorations = decorationSpecs(doc, 0, {
      vaultId: "vault",
      sourcePath: "Note.md",
      onOpenNote: () => undefined,
    });

    expect(
      decorations.some(
        (item) => item.from === imageStart && item.widget !== undefined && item.block,
      ),
    ).toBe(true);
  });

  it("renders frontmatter as a properties block until it is activated", () => {
    const doc = "---\ntitle: Example\ntags:\n  - test\n---\n# Note";
    const decorations = decorationSpecs(doc, doc.indexOf("Note"));
    expect(decorationSpecs(doc).some((item) => item.widget && item.block)).toBe(true);
    expect(decorations.some((item) => item.widget && item.block)).toBe(true);
    expect(decorations.some((item) => item.from === 0 && item.to === doc.indexOf("\n#"))).toBe(
      true,
    );
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

    const properties = parent.querySelector<HTMLElement>(".cm-live-properties");
    expect(properties).not.toBeNull();
    properties?.click();
    expect(view.state.selection.main.head).toBeLessThan(doc.indexOf("\n#"));
    expect(parent.querySelector(".cm-live-properties")).toBeNull();
    view.destroy();
  });
});
