// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/bridge", () => ({
  bridge: {
    openExternal: async () => true,
    resolveLink: async () => ({ status: "invalid" }),
  },
}));

import { MarkdownPreview } from "./MarkdownPreview";

describe("MarkdownPreview", () => {
  it("sanitizes raw HTML and blocks remote preview assets", () => {
    const { container } = render(
      <MarkdownPreview
        vaultId="vault"
        sourcePath="Note.md"
        markdown={
          '# Safe\n<script>window.compromised = true</script><iframe src="https://example.test"></iframe><img src="https://example.test/pixel.png" onerror="alert(1)" />'
        }
        onOpenNote={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "Safe" })).toBeInTheDocument();
    expect(container.querySelector("script, iframe")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(screen.getByText(/Remote or unsafe image blocked/)).toBeInTheDocument();
  });
});
