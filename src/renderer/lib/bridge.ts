import { Electroview } from "electrobun/view";
import type {
  GraphiteRPC,
  VaultChangeEvent,
  VaultSummary,
  VaultTreeNode,
} from "../../shared/contracts";
import { DEFAULT_PREFERENCES } from "../../shared/contracts";
import type { ChangeListener, GraphiteBridge } from "./bridge-contract";
import { createWebFileSystemBridge } from "./web-file-system-bridge";

const changeListeners = new Set<ChangeListener>();
let closeHandler: () => Promise<boolean> = async () => true;

const rpc = Electroview.defineRPC<GraphiteRPC>({
  maxRequestTime: 15_000,
  handlers: {
    requests: {
      prepareToClose: () => closeHandler(),
    },
    messages: {
      vaultChanged: (event: VaultChangeEvent) => {
        for (const listener of changeListeners) listener(event);
      },
    },
  },
});

const isElectrobun = "__electrobunWebviewId" in window;
const isDemo =
  import.meta.env.VITE_GRAPHITE_DEMO === "true" ||
  new URLSearchParams(window.location.search).has("demo");
if (isElectrobun) new Electroview({ rpc });

const nativeBridge: GraphiteBridge = {
  capabilities: { runtime: "desktop", canAccessVaults: true, canTrash: true },
  bootstrap: () => rpc.request.bootstrap({}),
  chooseVault: () => rpc.request.chooseVault({}, { maxRequestTime: Infinity }),
  createVault: (name) => rpc.request.createVault({ name }, { maxRequestTime: Infinity }),
  openSandboxVault: (reset) => rpc.request.openSandboxVault({ reset }),
  openRecentVault: (vaultId) => rpc.request.openRecentVault({ vaultId }),
  scanVault: (vaultId) => rpc.request.scanVault({ vaultId }),
  readDocument: (vaultId, path) => rpc.request.readDocument({ vaultId, path }),
  saveDocument: (vaultId, path, text, baseRevision, force) =>
    rpc.request.saveDocument({ vaultId, path, text, baseRevision, force }),
  saveCopy: (vaultId, sourcePath, text) => rpc.request.saveCopy({ vaultId, sourcePath, text }),
  createNote: (vaultId, folder) => rpc.request.createNote({ vaultId, folder }),
  createFolder: (vaultId, folder) => rpc.request.createFolder({ vaultId, folder }),
  renameEntry: (vaultId, path, name) => rpc.request.renameEntry({ vaultId, path, name }),
  moveEntry: (vaultId, path, destinationFolder) =>
    rpc.request.moveEntry({ vaultId, path, destinationFolder }),
  trashEntry: (vaultId, path) => rpc.request.trashEntry({ vaultId, path }),
  resolveLink: (vaultId, sourcePath, target) =>
    rpc.request.resolveLink({ vaultId, sourcePath, target }),
  createLinkedNote: (vaultId, sourcePath, target) =>
    rpc.request.createLinkedNote({ vaultId, sourcePath, target }),
  readAsset: (vaultId, path) => rpc.request.readAsset({ vaultId, path }),
  openAttachment: (vaultId, path) => rpc.request.openAttachment({ vaultId, path }),
  openExternal: (url) => rpc.request.openExternal({ url }),
  completeSmoke: (vaultId, path) => rpc.request.completeSmoke({ vaultId, path }),
  updatePreferences: (preferences) => rpc.request.updatePreferences({ preferences }),
  onVaultChanged: (listener) => {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
  },
  setCloseHandler: (handler) => {
    closeHandler = handler;
    return () => {
      if (closeHandler === handler) closeHandler = async () => true;
    };
  },
};

const demoRevision = { hash: "demo", modifiedAt: Date.now(), size: 220 };
let demoText = `---
tags: [graphite, demo]
---

# Welcome to Graphite

Graphite is a focused, local-first Markdown editor for your Obsidian vault.

- Edit in Inline or Code mode
- See the preview update instantly
- Follow [[Getting Started]] links
- Keep every note on your own machine

> The browser-only renderer uses this sample vault. Launch the Electrobun app to open real folders.
`;

const demoVault: VaultSummary = {
  id: "demo",
  name: "Graphite Demo",
  displayPath: "Renderer preview",
  lastOpenedAt: Date.now(),
};

const demoTree: VaultTreeNode[] = [
  {
    name: "Welcome.md",
    path: "Welcome.md",
    kind: "markdown",
    modifiedAt: Date.now(),
    size: demoText.length,
  },
  {
    name: "Getting Started.md",
    path: "Getting Started.md",
    kind: "markdown",
    modifiedAt: Date.now(),
    size: 56,
  },
];

const demoBridge: GraphiteBridge = {
  capabilities: { runtime: "demo", canAccessVaults: true, canTrash: true },
  bootstrap: async () => ({
    recentVaults: [demoVault],
    preferences: {
      ...DEFAULT_PREFERENCES,
      lastVaultId: "demo",
      lastNoteByVault: { demo: "Welcome.md" },
    },
  }),
  chooseVault: async () => demoVault,
  createVault: async () => demoVault,
  openSandboxVault: async () => demoVault,
  openRecentVault: async () => demoVault,
  scanVault: async () => demoTree,
  readDocument: async (_vaultId, path) => ({
    path,
    text: path === "Welcome.md" ? demoText : "# Getting Started\n\nReturn to [[Welcome]].\n",
    newline: "lf",
    hasBom: false,
    revision: demoRevision,
  }),
  saveDocument: async (_vaultId, _path, text) => {
    demoText = text;
    return {
      status: "saved",
      revision: { ...demoRevision, hash: String(text.length), size: text.length },
    };
  },
  saveCopy: async () => "Welcome (conflict copy).md",
  createNote: async () => "Untitled.md",
  createFolder: async () => "New folder",
  renameEntry: async (_vaultId, _path, name) => ({ path: name, updatedLinks: 0, failures: [] }),
  moveEntry: async (_vaultId, path, folder) => ({
    path: `${folder}/${path}`,
    updatedLinks: 0,
    failures: [],
  }),
  trashEntry: async () => true,
  resolveLink: async (_vaultId, _source, target) => {
    const path = `${target.replace(/\.md$/i, "")}.md`;
    return demoTree.some((item) => item.path.toLowerCase() === path.toLowerCase())
      ? { status: "resolved", path, kind: "markdown" }
      : { status: "missing", proposedPath: path };
  },
  createLinkedNote: async (_vaultId, _source, target) => `${target}.md`,
  readAsset: async () => ({ status: "error", message: "No demo attachment." }),
  openAttachment: async () => false,
  openExternal: async (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  },
  completeSmoke: async () => false,
  updatePreferences: async (preferences) => preferences,
  onVaultChanged: () => () => undefined,
  setCloseHandler: () => () => undefined,
};

export type { GraphiteBridge } from "./bridge-contract";
export const bridge = isElectrobun
  ? nativeBridge
  : isDemo
    ? demoBridge
    : createWebFileSystemBridge();
