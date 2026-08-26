// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "../shared/contracts";

vi.mock("../renderer/lib/bridge", () => ({
  bridge: {
    capabilities: {
      runtime: "demo",
      canAccessVaults: true,
      canTrash: true,
    },
    bootstrap: async () => ({
      recentVaults: [{ id: "smoke", name: "Smoke Vault", displayPath: "fixture", lastOpenedAt: 1 }],
      preferences: {
        ...DEFAULT_PREFERENCES,
        lastVaultId: "smoke",
        lastNoteByVault: { smoke: "Welcome.md" },
      },
    }),
    openRecentVault: async () => ({
      id: "smoke",
      name: "Smoke Vault",
      displayPath: "fixture",
      lastOpenedAt: 1,
    }),
    scanVault: async () => [
      { name: "Welcome.md", path: "Welcome.md", kind: "markdown", modifiedAt: 1, size: 20 },
    ],
    readDocument: async () => ({
      path: "Welcome.md",
      text: "# Welcome to Graphite",
      newline: "lf",
      hasBom: false,
      revision: { hash: "smoke", modifiedAt: 1, size: 20 },
    }),
    completeSmoke: async () => true,
    updatePreferences: async (preferences: unknown) => preferences,
    onVaultChanged: () => () => undefined,
    setCloseHandler: () => () => undefined,
  },
}));

vi.mock("../renderer/components/MarkdownEditor", () => ({
  MarkdownEditor: ({ value }: { value: string }) => (
    <textarea aria-label="Markdown source" value={value} readOnly />
  ),
}));

vi.mock("../renderer/components/MarkdownPreview", () => ({
  MarkdownPreview: ({ markdown }: { markdown: string }) => (
    <article>{markdown.replace(/^# /, "")}</article>
  ),
}));

import App from "../renderer/App";

describe("Graphite renderer smoke", () => {
  it("boots the workspace and renders the sample note", async () => {
    render(<App />);
    expect(await screen.findByText("Smoke Vault")).toBeInTheDocument();
    expect(await screen.findByText("Welcome to Graphite")).toBeInTheDocument();
  });
});
