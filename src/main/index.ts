import Electrobun, { app, BrowserView, BrowserWindow, Utils } from "electrobun/main";
import type {
  AppPreferences,
  GraphiteRPC,
  VaultChangeEvent,
  VaultSummary,
} from "../shared/contracts";
import { PreferencesStore } from "./preferences";
import { ensureSandboxVault } from "./sandbox-vault";
import { VaultService } from "./vault-service";

const preferences = new PreferencesStore();
await preferences.load();

let rpc: ReturnType<typeof BrowserView.defineRPC<GraphiteRPC>>;

const vaults = new VaultService({
  moveToTrash: (path) => Utils.moveToTrash(path),
  openPath: (path) => Utils.openPath(path),
  onChange: (event: VaultChangeEvent) => rpc.send.vaultChanged(event),
});
const smokeVaultPath = process.env.GRAPHITE_SMOKE_VAULT;
let smokeVault: VaultSummary | null = null;

async function activateVault(summary: VaultSummary): Promise<VaultSummary> {
  await preferences.touchVault(summary);
  return summary;
}

rpc = BrowserView.defineRPC<GraphiteRPC>({
  maxRequestTime: 15_000,
  handlers: {
    requests: {
      bootstrap: async () => {
        if (!smokeVaultPath) return preferences.snapshot();
        smokeVault ??= await vaults.openRoot(smokeVaultPath);
        return {
          recentVaults: [smokeVault],
          preferences: {
            ...preferences.snapshot().preferences,
            lastVaultId: smokeVault.id,
          },
        };
      },
      chooseVault: async () => {
        const [selected] = await Utils.openFileDialog({
          startingFolder: "~/",
          canChooseDirectory: true,
          canChooseFiles: false,
          allowsMultipleSelection: false,
        });
        if (!selected) return null;
        return activateVault(await vaults.openRoot(selected));
      },
      createVault: async ({ name }) => {
        const [parent] = await Utils.openFileDialog({
          startingFolder: "~/",
          canChooseDirectory: true,
          canChooseFiles: false,
          allowsMultipleSelection: false,
        });
        if (!parent) return null;
        return activateVault(await vaults.createRoot(parent, name));
      },
      openSandboxVault: async ({ reset }) => {
        const root = await ensureSandboxVault(Utils.paths.userData, reset);
        const summary = { ...(await vaults.openRoot(root)), sandbox: true };
        return activateVault(summary);
      },
      openRecentVault: async ({ vaultId }) => {
        if (smokeVault?.id === vaultId) return smokeVault;
        const recent = preferences.snapshot().recentVaults.find((vault) => vault.id === vaultId);
        if (!recent) return null;
        try {
          const reopened = await vaults.openRoot(recent.displayPath);
          return activateVault(recent.sandbox ? { ...reopened, sandbox: true } : reopened);
        } catch {
          await preferences.removeRecent(vaultId);
          return null;
        }
      },
      scanVault: ({ vaultId }) => vaults.scan(vaultId),
      readDocument: ({ vaultId, path }) => vaults.readDocument(vaultId, path),
      saveDocument: ({ vaultId, path, text, baseRevision, force }) =>
        vaults.saveDocument(vaultId, path, text, baseRevision, force),
      saveCopy: ({ vaultId, sourcePath, text }) => vaults.saveCopy(vaultId, sourcePath, text),
      createNote: ({ vaultId, folder }) => vaults.createNote(vaultId, folder),
      createFolder: ({ vaultId, folder }) => vaults.createFolder(vaultId, folder),
      renameEntry: ({ vaultId, path, name }) => vaults.renameEntry(vaultId, path, name),
      moveEntry: ({ vaultId, path, destinationFolder }) =>
        vaults.moveEntry(vaultId, path, destinationFolder),
      trashEntry: ({ vaultId, path }) => vaults.trashEntry(vaultId, path),
      resolveLink: ({ vaultId, sourcePath, target }) =>
        vaults.resolveLink(vaultId, sourcePath, target),
      createLinkedNote: ({ vaultId, sourcePath, target }) =>
        vaults.createLinkedNote(vaultId, sourcePath, target),
      readAsset: ({ vaultId, path }) => vaults.readAsset(vaultId, path),
      openAttachment: ({ vaultId, path }) => vaults.openAttachment(vaultId, path),
      openExternal: ({ url }) => {
        try {
          const parsed = new URL(url);
          return ["http:", "https:"].includes(parsed.protocol) && Utils.openExternal(parsed.href);
        } catch {
          return false;
        }
      },
      completeSmoke: async ({ vaultId, path }) => {
        if (!smokeVaultPath || smokeVault?.id !== vaultId) return false;
        await vaults.readDocument(vaultId, path);
        console.log("[graphite-smoke] Renderer/main handshake completed.");
        setTimeout(() => app.quit(), 50);
        return true;
      },
      updatePreferences: ({ preferences: next }: { preferences: AppPreferences }) =>
        preferences.updatePreferences(next),
    },
    messages: {},
  },
});

const mainWindow = new BrowserWindow({
  title: "Graphite",
  url: "views://mainview/index.html",
  rpc,
  frame: {
    width: 1280,
    height: 820,
  },
  titleBarStyle: "default",
  spellCheck: true,
  navigationRules: JSON.stringify(["views://mainview/*"]),
});

let closeApproved = false;
let closeCheckPending = false;
Electrobun.events.on(`will-close-${mainWindow.id}`, (event) => {
  if (closeApproved) return;
  event.response = { allow: false };
  if (closeCheckPending) return;
  closeCheckPending = true;
  void rpc.request
    .prepareToClose({}, { maxRequestTime: Infinity })
    .then((allow) => {
      if (!allow) return;
      closeApproved = true;
      mainWindow.close();
    })
    .catch(() => undefined)
    .finally(() => {
      closeCheckPending = false;
    });
});

void mainWindow;
