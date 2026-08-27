// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    openSandboxVault: async () => ({
      id: "sandbox",
      name: "Graphite Sandbox",
      displayPath: "Built-in safe working copy",
      lastOpenedAt: 1,
      sandbox: true,
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

afterEach(cleanup);

describe("Graphite renderer smoke", () => {
  it("boots the workspace and renders the sample note", async () => {
    render(<App />);
    expect(await screen.findByText("Smoke Vault")).toBeInTheDocument();
    expect(await screen.findByText("Welcome to Graphite")).toBeInTheDocument();
  });

  it("keeps the primary mode independent from the side preview", async () => {
    render(<App />);
    const mode = await screen.findByRole("button", { name: "Mode: Inline. Switch to Code" });
    const sidePreview = screen.getByRole("button", { name: "Hide side preview" });

    expect(screen.getAllByRole("button", { name: /^Mode:/ })).toHaveLength(1);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.click(mode);
    expect(mode).toHaveAccessibleName("Mode: Code. Switch to Preview");
    fireEvent.click(mode);
    expect(mode).toHaveAccessibleName("Mode: Preview. Switch to Inline");
    expect(screen.getAllByRole("article")).toHaveLength(2);

    fireEvent.click(sidePreview);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(mode).toHaveAccessibleName("Mode: Preview. Switch to Inline");
  });

  it("switches between light and dark with one click", async () => {
    render(<App />);
    const theme = await screen.findByRole("button", { name: "Switch to dark theme" });
    fireEvent.click(theme);
    expect(theme).toHaveAccessibleName("Switch to light theme");
    expect(document.documentElement).toHaveClass("dark");
    fireEvent.click(theme);
    expect(theme).toHaveAccessibleName("Switch to dark theme");
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
