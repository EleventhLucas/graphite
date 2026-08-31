// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../lib/bridge", () => ({
  bridge: {
    resolveLink: async () => ({
      status: "resolved",
      path: "Attachments/pixel.png",
      kind: "image",
    }),
    readAsset: async () => ({
      status: "error",
      message: "Fixture attachment preview",
    }),
    openAttachment: async () => true,
  },
}));

import { MarkdownEditor } from "./MarkdownEditor";

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
});

afterEach(cleanup);

describe("MarkdownEditor", () => {
  it("renders Inline as a live document without inactive wikilink syntax", () => {
    const { container } = render(
      <MarkdownEditor
        value={"Intro\n\nSee [[Notes/Target|friendly label]]."}
        onChange={vi.fn()}
        dark
        mode="wysiwyg"
        vaultId="vault"
        sourcePath="Note.md"
        onOpenNote={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Inline Markdown editor")).toBeInTheDocument();
    expect(container.querySelector(".cm-live-editor")).not.toBeNull();
    expect(container.querySelector(".cm-gutters")).toBeNull();
    expect(container.querySelector(".cm-content")?.textContent).toContain("friendly label");
    expect(container.querySelector(".cm-content")?.textContent).not.toContain("[[");
  });

  it("keeps raw syntax and line numbers in Code mode", () => {
    const { container } = render(
      <MarkdownEditor
        value={"Intro\n\nSee [[Notes/Target|friendly label]]."}
        onChange={vi.fn()}
        dark={false}
        mode="source"
        vaultId="vault"
        sourcePath="Note.md"
        onOpenNote={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Markdown code editor")).toBeInTheDocument();
    expect(container.querySelector(".cm-live-editor")).toBeNull();
    expect(container.querySelector(".cm-gutters")).not.toBeNull();
    expect(container.querySelector(".cm-content")?.textContent).toContain("[[Notes/Target|");
  });

  it("conceals both an inactive heading marker and its separator space", () => {
    const { container } = render(
      <MarkdownEditor
        value={"intro\n# Hello"}
        onChange={vi.fn()}
        dark={false}
        mode="wysiwyg"
        vaultId="vault"
        sourcePath="Note.md"
        onOpenNote={vi.fn()}
      />,
    );

    expect(container.querySelector(".cm-content")?.textContent).toContain("Hello");
    expect(container.querySelector(".cm-content")?.textContent).not.toContain("# Hello");
  });

  it("mounts Preview's attachment renderer for a standalone Inline embed", async () => {
    const { container } = render(
      <MarkdownEditor
        value={"Intro\n\n![[Attachments/pixel.png]]"}
        onChange={vi.fn()}
        dark={false}
        mode="wysiwyg"
        vaultId="vault"
        sourcePath="Note.md"
        onOpenNote={vi.fn()}
      />,
    );

    expect(container.querySelector(".cm-live-embed-widget")).not.toBeNull();
    expect(await screen.findByText("Fixture attachment preview")).toBeInTheDocument();
  });

  it("keeps a rendered embed mounted while exposing its Markdown source", () => {
    const { container } = render(
      <MarkdownEditor
        value={"Intro\n\n![[Attachments/pixel.png]]"}
        onChange={vi.fn()}
        dark={false}
        mode="wysiwyg"
        vaultId="vault"
        sourcePath="Note.md"
        onOpenNote={vi.fn()}
      />,
    );

    expect(container.querySelector(".cm-content")?.textContent).not.toContain("![[");
    const edit = screen.getByRole("button", { name: "Edit embed" });
    edit.click();
    expect(container.querySelector(".cm-content")?.textContent).toContain(
      "![[Attachments/pixel.png]]",
    );
    expect(container.querySelector(".cm-live-embed-widget")).not.toBeNull();
  });
});
