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

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
  delete document.documentElement.dataset.theme;
});

describe("Graphite renderer smoke", () => {
  it("boots the workspace and renders the sample note", async () => {
    render(<App />);
    expect(await screen.findByText("Smoke Vault")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
    const settings = screen.getByRole("button", { name: "Open settings" });
    expect(settings).not.toHaveTextContent("Settings");
    expect(settings.closest(".sidebar-vault-row")).not.toBeNull();
    expect(screen.getAllByText("Welcome.md")).toHaveLength(2);
    expect(await screen.findByRole("textbox", { name: "Markdown source" })).toHaveValue(
      "# Welcome to Graphite",
    );
  });

  it("cycles Inline, Code, and Preview in the primary document surface", async () => {
    render(<App />);
    const mode = await screen.findByRole("button", { name: "Mode: Inline. Switch to Code" });

    expect(screen.getAllByRole("button", { name: /^Mode:/ })).toHaveLength(1);
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    fireEvent.click(mode);
    expect(mode).toHaveAccessibleName("Mode: Code. Switch to Preview");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    fireEvent.click(mode);
    expect(mode).toHaveAccessibleName("Mode: Preview. Switch to Inline");
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("keeps the sidebar toggle in the document toolbar while navigation is collapsed", async () => {
    render(<App />);
    await screen.findByText("Smoke Vault");

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(
      screen.queryByRole("complementary", { name: "Vault navigation" }),
    ).not.toBeInTheDocument();

    const restore = screen.getByRole("button", { name: "Show sidebar" });
    expect(restore).toBeInTheDocument();
    fireEvent.click(restore);
    expect(screen.getByRole("complementary", { name: "Vault navigation" })).toBeInTheDocument();
  });

  it("changes color mode and theme from Settings", async () => {
    render(<App />);
    await screen.findByText("Smoke Vault");
    const settings = screen.getByRole("button", { name: "Open settings" });
    fireEvent.click(settings);

    expect(await screen.findByRole("tab", { name: "Appearance" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.queryByText("The selected theme includes coordinated light and dark palettes."),
    ).not.toBeInTheDocument();
    const dark = await screen.findByRole("button", { name: "Dark" });
    const light = screen.getByRole("button", { name: "Light" });
    expect(screen.getAllByRole("radio")).toHaveLength(9);
    fireEvent.click(dark);
    expect(dark).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).toHaveClass("dark");
    fireEvent.click(light);
    expect(light).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).not.toHaveClass("dark");

    const solarized = screen.getByRole("radio", { name: /Solarized/ });
    fireEvent.click(solarized);
    expect(solarized).toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-theme", "solarized");
  });
});
