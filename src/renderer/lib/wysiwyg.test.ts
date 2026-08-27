// @vitest-environment jsdom

import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { buildWysiwygDecorations, wysiwygExtension } from "./wysiwyg";

function decorationSpecs(doc: string, cursor = 0) {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown()],
  });
  const found: Array<{
    from: number;
    to: number;
    className?: string;
    widget?: { ignoreEvent?(): boolean };
    block?: boolean;
  }> = [];
  buildWysiwygDecorations(state).between(0, doc.length, (from, to, value) => {
    found.push({
      from,
      to,
      className: value.spec.class as string | undefined,
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
    expect(decorations.some((item) => item.from === 6 && item.to === 7)).toBe(true);
  });

  it("keeps heading syntax concealed while its text is edited", () => {
    const doc = "intro\n# Heading";
    const decorations = decorationSpecs(doc, doc.indexOf("Heading"));
    expect(decorations.some((item) => item.className?.includes("cm-live-heading-1"))).toBe(true);
    expect(decorations.some((item) => item.from === 6 && item.to === 7)).toBe(true);
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
    const targetStart = doc.indexOf("Notes/Target");
    expect(
      decorations.some(
        (item) => item.from === targetStart && item.to === targetStart + "Notes/Target|".length,
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
        extensions: [markdown(), wysiwygExtension],
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
        extensions: [markdown(), wysiwygExtension],
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
