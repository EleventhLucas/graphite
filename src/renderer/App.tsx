import {
  Check,
  CircleAlert,
  CodeXml,
  Eye,
  FilePenLine,
  FilePlus2,
  FlaskConical,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Search,
  Settings,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import graphiteIcon from "../../graphite_vector.svg";
import type {
  AppPreferences,
  DocumentSnapshot,
  SaveResult,
  SaveStatus,
  VaultSummary,
  VaultTreeNode,
} from "../shared/contracts";
import { DEFAULT_PREFERENCES } from "../shared/contracts";
import { SANDBOX_START_NOTE } from "../shared/sandbox-vault";
import { AttachmentDialog } from "./components/AttachmentDialog";
import { Button } from "./components/Button";
import { ConflictDialog } from "./components/ConflictDialog";
import { MarkdownEditor } from "./components/MarkdownEditor";
import { MarkdownPreview } from "./components/MarkdownPreview";
import { QuickOpen } from "./components/QuickOpen";
import { SettingsDialog } from "./components/SettingsDialog";
import { VaultTree } from "./components/VaultTree";
import { bridge } from "./lib/bridge";

function containsPath(nodes: VaultTreeNode[], path: string): boolean {
  return nodes.some((node) => node.path === path || containsPath(node.children ?? [], path));
}

function folderOf(path?: string): string {
  if (!path?.includes("/")) return "";
  return path.slice(0, path.lastIndexOf("/"));
}

function mapMoved(path: string, from: string, to: string): string {
  if (path === from) return to;
  return path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : path;
}

const VIEW_MODES = [
  { value: "wysiwyg" as const, label: "Inline", icon: FilePenLine },
  { value: "source" as const, label: "Code", icon: CodeXml },
  { value: "preview" as const, label: "Preview", icon: Eye },
];

function documentName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export default function App() {
  const capabilities = bridge.capabilities;
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [recentVaults, setRecentVaults] = useState<VaultSummary[]>([]);
  const [vault, setVault] = useState<VaultSummary | null>(null);
  const [tree, setTree] = useState<VaultTreeNode[]>([]);
  const [snapshot, setSnapshot] = useState<DocumentSnapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [conflict, setConflict] = useState<DocumentSnapshot | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Pick<
    VaultTreeNode,
    "path" | "kind"
  > | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dark = preferences.theme === "dark";

  const vaultRef = useRef(vault);
  const snapshotRef = useRef(snapshot);
  const draftRef = useRef(draft);
  const preferencesRef = useRef(preferences);
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  vaultRef.current = vault;
  snapshotRef.current = snapshot;
  draftRef.current = draft;
  preferencesRef.current = preferences;

  const refreshTree = useCallback(async (activeVault = vaultRef.current) => {
    if (!activeVault) return [];
    const next = await bridge.scanVault(activeVault.id);
    setTree(next);
    return next;
  }, []);

  const performSave = useCallback(async (force = false): Promise<boolean> => {
    const activeVault = vaultRef.current;
    const current = snapshotRef.current;
    if (!activeVault || !current || draftRef.current === current.text) return true;
    const text = draftRef.current;
    setSaveStatus("saving");
    let result: SaveResult;
    try {
      result = await bridge.saveDocument(
        activeVault.id,
        current.path,
        text,
        current.revision,
        force,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed.");
      setSaveStatus("error");
      return false;
    }
    if (result.status === "saved") {
      const saved = { ...current, text, revision: result.revision };
      snapshotRef.current = saved;
      setSnapshot(saved);
      setConflict(null);
      setDeleted(false);
      setSaveStatus(draftRef.current === text ? "saved" : "idle");
      return true;
    }
    if (result.status === "conflict") {
      setConflict(result.disk);
      setSaveStatus("conflict");
      return false;
    }
    setError(result.message);
    setSaveStatus("error");
    return false;
  }, []);

  const saveNow = useCallback(
    (force = false): Promise<boolean> => {
      const queued = saveQueueRef.current.then(
        () => performSave(force),
        () => performSave(force),
      );
      saveQueueRef.current = queued;
      return queued;
    },
    [performSave],
  );

  const openDocument = useCallback(
    async (path: string) => {
      const activeVault = vaultRef.current;
      if (!activeVault || path === snapshotRef.current?.path) return;
      if (!(await saveNow())) return;
      try {
        const next = await bridge.readDocument(activeVault.id, path);
        snapshotRef.current = next;
        draftRef.current = next.text;
        setSnapshot(next);
        setDraft(next.text);
        setConflict(null);
        setDeleted(false);
        setSaveStatus("idle");
        setPreferences((current) => ({
          ...current,
          lastNoteByVault: { ...current.lastNoteByVault, [activeVault.id]: path },
        }));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not open the note.");
      }
    },
    [saveNow],
  );

  const activateVault = useCallback(
    async (nextVault: VaultSummary, preferredNote?: string) => {
      if (!(await saveNow())) return;
      setBusy(true);
      setPreviewAttachment(null);
      setVault(nextVault);
      vaultRef.current = nextVault;
      snapshotRef.current = null;
      draftRef.current = "";
      setSnapshot(null);
      setDraft("");
      setSaveStatus("idle");
      try {
        const nextTree = await refreshTree(nextVault);
        const preferred = preferredNote ?? preferencesRef.current.lastNoteByVault[nextVault.id];
        const fallback = (() => {
          const stack = [...nextTree];
          while (stack.length) {
            const node = stack.shift();
            if (!node) break;
            if (node.kind === "markdown") return node.path;
            stack.unshift(...(node.children ?? []));
          }
          return undefined;
        })();
        const target = preferred && containsPath(nextTree, preferred) ? preferred : fallback;
        if (target) await openDocument(target);
      } finally {
        setBusy(false);
      }
    },
    [openDocument, refreshTree, saveNow],
  );

  useEffect(() => {
    return bridge.setCloseHandler(() => saveNow());
  }, [saveNow]);

  useEffect(() => {
    if (!vault || !snapshot) return;
    const frame = requestAnimationFrame(() => void bridge.completeSmoke(vault.id, snapshot.path));
    return () => cancelAnimationFrame(frame);
  }, [snapshot, vault]);

  useEffect(() => {
    let live = true;
    void bridge
      .bootstrap()
      .then(async ({ recentVaults: recent, preferences: stored }) => {
        if (!live) return;
        setRecentVaults(recent);
        setPreferences(stored);
        setPreferencesReady(true);
        const last = stored.lastVaultId && recent.find((item) => item.id === stored.lastVaultId);
        if (last) {
          const opened = await bridge.openRecentVault(last.id);
          if (opened && live) await activateVault(opened, stored.lastNoteByVault[opened.id]);
        }
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Graphite could not start."),
      )
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [activateVault]);

  useEffect(() => {
    if (!preferencesReady) return;
    const timeout = setTimeout(() => void bridge.updatePreferences(preferences), 250);
    return () => clearTimeout(timeout);
  }, [preferences, preferencesReady]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.theme = preferences.colorTheme;
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark, preferences.colorTheme]);

  useEffect(() => {
    if (!snapshot || draft === snapshot.text || conflict || deleted) return;
    const timeout = setTimeout(() => void saveNow(), 500);
    return () => clearTimeout(timeout);
  }, [conflict, deleted, draft, saveNow, snapshot]);

  useEffect(() => {
    return bridge.onVaultChanged(async (event) => {
      const activeVault = vaultRef.current;
      if (!activeVault || event.vaultId !== activeVault.id) return;
      const nextTree = await refreshTree(activeVault);
      const current = snapshotRef.current;
      if (!current) return;
      if (!containsPath(nextTree, current.path)) {
        setDeleted(true);
        setSaveStatus("conflict");
        return;
      }
      try {
        const disk = await bridge.readDocument(activeVault.id, current.path);
        if (disk.revision.hash === current.revision.hash) return;
        const diskMatchesDraft = disk.text === draftRef.current;
        if (diskMatchesDraft || draftRef.current === current.text) {
          snapshotRef.current = disk;
          draftRef.current = disk.text;
          setSnapshot(disk);
          setDraft(disk.text);
          setSaveStatus(diskMatchesDraft ? "saved" : "idle");
        } else {
          setConflict(disk);
          setSaveStatus("conflict");
        }
      } catch {
        setDeleted(true);
        setSaveStatus("conflict");
      }
    });
  }, [refreshTree]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        if (vaultRef.current) setQuickOpen(true);
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow();
      }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const current = snapshotRef.current;
      if (current && draftRef.current !== current.text) {
        event.preventDefault();
        event.returnValue = "";
        void saveNow();
      }
    };
    addEventListener("keydown", keyboard);
    addEventListener("beforeunload", beforeUnload);
    return () => {
      removeEventListener("keydown", keyboard);
      removeEventListener("beforeunload", beforeUnload);
    };
  }, [saveNow]);

  const openChosenVault = async () => {
    if (!(await saveNow())) return;
    setError(null);
    try {
      const selected = await bridge.chooseVault();
      if (selected) {
        setRecentVaults((current) => [
          selected,
          ...current.filter((item) => item.id !== selected.id),
        ]);
        await activateVault(selected);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Folder access is unavailable.");
    }
  };

  const createVault = async () => {
    if (!(await saveNow())) return;
    const name = window.prompt("New vault name:", "Graphite Vault")?.trim();
    if (!name) return;
    const created = await bridge.createVault(name);
    if (created) {
      setRecentVaults((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      await activateVault(created);
    }
  };

  const openSandboxVault = async (reset = false) => {
    if (!(await saveNow())) return;
    if (reset && !confirm("Reset the sandbox and discard every change made in its working copy?")) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const selected = await bridge.openSandboxVault(reset);
      setRecentVaults((current) => [
        selected,
        ...current.filter((item) => item.id !== selected.id),
      ]);
      await activateVault(selected, SANDBOX_START_NOTE);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The sandbox vault could not be opened.");
    } finally {
      setBusy(false);
    }
  };

  const createNote = async (folder = folderOf(snapshot?.path)) => {
    if (!vault) return;
    if (!(await saveNow())) return;
    const path = await bridge.createNote(vault.id, folder);
    await refreshTree();
    await openDocument(path);
  };

  const createFolder = async (folder = folderOf(snapshot?.path)) => {
    if (!vault) return;
    await bridge.createFolder(vault.id, folder);
    await refreshTree();
  };

  const renameEntry = async (node: VaultTreeNode) => {
    if (!vault) return;
    if (!(await saveNow())) return;
    const name = window.prompt("Rename entry:", node.name)?.trim();
    if (!name || name === node.name) return;
    try {
      const result = await bridge.renameEntry(vault.id, node.path, name);
      if (result.path && snapshotRef.current?.path) {
        const mapped = mapMoved(snapshotRef.current.path, node.path, result.path);
        if (mapped !== snapshotRef.current.path) {
          const refreshed = await bridge.readDocument(vault.id, mapped);
          snapshotRef.current = refreshed;
          draftRef.current = refreshed.text;
          setSnapshot(refreshed);
          setDraft(refreshed.text);
        }
      }
      if (result.failures.length)
        setError(`Moved, but ${result.failures.length} linked notes could not be updated.`);
      await refreshTree();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rename failed.");
    }
  };

  const moveEntry = async (node: VaultTreeNode, destination: string) => {
    if (!vault) return;
    if (!(await saveNow())) return;
    try {
      const result = await bridge.moveEntry(vault.id, node.path, destination);
      if (result.path && snapshotRef.current?.path) {
        const mapped = mapMoved(snapshotRef.current.path, node.path, result.path);
        if (mapped !== snapshotRef.current.path) {
          const refreshed = await bridge.readDocument(vault.id, mapped);
          snapshotRef.current = refreshed;
          draftRef.current = refreshed.text;
          setSnapshot(refreshed);
          setDraft(refreshed.text);
        }
      }
      if (result.failures.length)
        setError(`Moved, but ${result.failures.length} linked notes could not be updated.`);
      await refreshTree();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Move failed.");
    }
  };

  const trashEntry = async (node: VaultTreeNode) => {
    if (!vault) return;
    const prompt = vault.sandbox
      ? `Delete “${node.name}” from the sandbox working copy? Resetting the sandbox restores it.`
      : `Move “${node.name}” to the operating system trash?`;
    if (!confirm(prompt)) return;
    if (!(await saveNow())) return;
    if (await bridge.trashEntry(vault.id, node.path)) {
      if (
        snapshotRef.current?.path === node.path ||
        snapshotRef.current?.path.startsWith(`${node.path}/`)
      ) {
        snapshotRef.current = null;
        setSnapshot(null);
        setDraft("");
      }
      await refreshTree();
    }
  };

  const showVaultSwitcher = async () => {
    if (!(await saveNow())) return;
    vaultRef.current = null;
    snapshotRef.current = null;
    draftRef.current = "";
    setVault(null);
    setPreviewAttachment(null);
    setSnapshot(null);
    setDraft("");
    setTree([]);
    setSaveStatus("idle");
  };

  const saveIcon = useMemo(() => {
    if (saveStatus === "saving")
      return <LoaderCircle className="motion-safe:animate-spin" size={13} />;
    if (saveStatus === "error" || saveStatus === "conflict") return <CircleAlert size={13} />;
    return <Check size={13} />;
  }, [saveStatus]);
  const viewModeIndex = Math.max(
    0,
    VIEW_MODES.findIndex((mode) => mode.value === preferences.primaryView),
  );
  const currentViewMode = VIEW_MODES[viewModeIndex];
  const nextViewMode = VIEW_MODES[(viewModeIndex + 1) % VIEW_MODES.length];
  const ViewModeIcon = currentViewMode.icon;

  if (!vault) {
    return (
      <main className="welcome-shell">
        <Button
          variant="ghost"
          size="icon"
          className="welcome-settings-button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open settings"
          title="Settings"
        >
          <Settings size={17} />
        </Button>
        <section className="welcome-card">
          <img src={graphiteIcon} alt="" className="welcome-icon graphite-brand-icon" />
          <div>
            <h1>Graphite</h1>
            {capabilities.runtime !== "unsupported" && (
              <p className="welcome-copy">
                {capabilities.runtime === "web"
                  ? "Choose a local folder. Its contents stay on this device and are never uploaded."
                  : "A quiet, focused editor for the notes already on your machine."}
              </p>
            )}
          </div>
          <div className="welcome-actions">
            <Button onClick={() => void openChosenVault()} disabled={busy}>
              <FolderOpen size={16} /> Open folder as vault
            </Button>
            <Button
              variant="ghost"
              onClick={() => void createVault()}
              disabled={busy || !capabilities.canAccessVaults}
            >
              <FolderPlus size={16} /> Create vault
            </Button>
            <Button variant="ghost" onClick={() => void openSandboxVault()} disabled={busy}>
              <FlaskConical size={16} /> Open sandbox vault
            </Button>
          </div>
          {capabilities.limitation && (
            <p className="capability-note">
              <TriangleAlert size={17} aria-hidden="true" />
              <span>{capabilities.limitation}</span>
            </p>
          )}
          {recentVaults.length > 0 && (
            <div className="recent-vaults">
              <span>Recent vaults</span>
              {recentVaults.map((recent) => (
                <button
                  key={recent.id}
                  type="button"
                  onClick={() => {
                    void saveNow().then(async (saved) => {
                      if (!saved) return;
                      const opened = await bridge.openRecentVault(recent.id, true);
                      if (opened) await activateVault(opened);
                      else setError("Graphite could not regain access to that folder.");
                    });
                  }}
                >
                  <strong>{recent.name}</strong>
                  <small>{recent.displayPath}</small>
                </button>
              ))}
            </div>
          )}
          {error && <p className="error-banner">{error}</p>}
        </section>
        <SettingsDialog
          open={settingsOpen}
          preferences={preferences}
          onOpenChange={setSettingsOpen}
          onChange={setPreferences}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div
        className={`workspace${preferences.sidebarVisible ? "" : " workspace-sidebar-collapsed"}`}
      >
        {preferences.sidebarVisible && (
          <aside
            className="sidebar"
            style={{ width: preferences.sidebarWidth }}
            aria-label="Vault navigation"
          >
            <div className="sidebar-header">
              <span>Files</span>
              <div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setQuickOpen(true)}
                  aria-label="Quick open"
                  title="Quick open (Ctrl/Cmd+P)"
                >
                  <Search size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void createNote()}
                  aria-label="New note"
                  title="New note"
                >
                  <FilePlus2 size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void createFolder()}
                  aria-label="New folder"
                  title="New folder"
                >
                  <FolderPlus size={15} />
                </Button>
              </div>
            </div>
            <VaultTree
              nodes={tree}
              activePath={snapshot?.path}
              canTrash={capabilities.canTrash || vault.sandbox === true}
              trashLabel={vault.sandbox ? "Delete from sandbox" : undefined}
              onOpen={(node) =>
                node.kind === "markdown"
                  ? void openDocument(node.path)
                  : setPreviewAttachment({ path: node.path, kind: node.kind })
              }
              onCreateNote={(folder) => void createNote(folder)}
              onCreateFolder={(folder) => void createFolder(folder)}
              onRename={(node) => void renameEntry(node)}
              onMove={(node, destination) => void moveEntry(node, destination)}
              onTrash={(node) => void trashEntry(node)}
            />
            <footer className="sidebar-footer">
              <div className="sidebar-vault-row">
                <button
                  className="sidebar-vault-home"
                  type="button"
                  onClick={() => void showVaultSwitcher()}
                  title="Switch vault"
                >
                  <img src={graphiteIcon} alt="" className="graphite-brand-icon" />
                  <span>
                    <strong>{vault.name}</strong>
                    <small>Switch vault</small>
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="sidebar-settings-button"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Open settings"
                  title="Settings"
                >
                  <Settings size={16} />
                </Button>
              </div>
              {vault.sandbox && (
                <Button
                  variant="ghost"
                  className="sidebar-footer-button sandbox-reset"
                  aria-label="Reset Sandbox"
                  onClick={() => void openSandboxVault(true)}
                  title="Reset Sandbox"
                >
                  <RotateCcw size={15} /> Reset Sandbox
                </Button>
              )}
            </footer>
          </aside>
        )}
        {preferences.sidebarVisible && (
          <hr
            className="resize-handle"
            aria-label="Resize file sidebar"
            aria-orientation="vertical"
            aria-valuemin={180}
            aria-valuemax={480}
            aria-valuenow={preferences.sidebarWidth}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const direction = event.key === "ArrowLeft" ? -12 : 12;
              setPreferences((current) => ({
                ...current,
                sidebarWidth: Math.max(180, Math.min(480, current.sidebarWidth + direction)),
              }));
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              const start = event.clientX;
              const width = preferences.sidebarWidth;
              const handle = event.currentTarget;
              handle.setPointerCapture(event.pointerId);
              document.body.classList.add("is-sidebar-resizing");
              const move = (moveEvent: PointerEvent) =>
                setPreferences((current) => ({
                  ...current,
                  sidebarWidth: Math.max(180, Math.min(480, width + moveEvent.clientX - start)),
                }));
              const stop = (stopEvent: PointerEvent) => {
                removeEventListener("pointermove", move);
                removeEventListener("pointerup", stop);
                removeEventListener("pointercancel", stop);
                document.body.classList.remove("is-sidebar-resizing");
                if (handle.hasPointerCapture(stopEvent.pointerId)) {
                  handle.releasePointerCapture(stopEvent.pointerId);
                }
              };
              addEventListener("pointermove", move);
              addEventListener("pointerup", stop);
              addEventListener("pointercancel", stop);
            }}
          />
        )}

        <section className="document-workspace">
          <header className="document-toolbar">
            <div className="document-toolbar-title">
              <Button
                variant="ghost"
                size="icon"
                className="sidebar-toggle"
                aria-label={preferences.sidebarVisible ? "Collapse sidebar" : "Show sidebar"}
                onClick={() =>
                  setPreferences((current) => ({
                    ...current,
                    sidebarVisible: !current.sidebarVisible,
                  }))
                }
                title={preferences.sidebarVisible ? "Collapse sidebar" : "Show sidebar"}
              >
                {preferences.sidebarVisible ? (
                  <PanelLeftClose size={16} />
                ) : (
                  <PanelLeftOpen size={16} />
                )}
              </Button>
              <span title={snapshot?.path}>
                {snapshot ? documentName(snapshot.path) : "No note selected"}
              </span>
            </div>
            <div className="toolbar-actions">
              <span className={`save-state save-${saveStatus}`}>
                {saveIcon}
                {saveStatus === "idle" ? "Ready" : saveStatus}
              </span>
              <Button
                variant="ghost"
                className="mode-cycle-button"
                aria-label={`Mode: ${currentViewMode.label}. Switch to ${nextViewMode.label}`}
                onClick={() =>
                  setPreferences((preferences) => ({
                    ...preferences,
                    primaryView: nextViewMode.value,
                  }))
                }
                title={`Switch to ${nextViewMode.label}`}
              >
                <ViewModeIcon size={16} /> {currentViewMode.label}
              </Button>
            </div>
          </header>
          {!snapshot ? (
            <div className="empty-document">
              <FilePlus2 size={28} />
              <h2>No note selected</h2>
              <p>Choose a note from the file tree or create a new one.</p>
            </div>
          ) : (
            <div className="document-panes">
              <section className="document-pane primary-pane">
                {preferences.primaryView === "preview" ? (
                  <MarkdownPreview
                    vaultId={vault.id}
                    sourcePath={snapshot.path}
                    markdown={draft}
                    onOpenNote={(path) => void openDocument(path)}
                    onOpenAttachment={(path, kind) => setPreviewAttachment({ path, kind })}
                  />
                ) : (
                  <MarkdownEditor
                    value={draft}
                    onChange={(value) => {
                      draftRef.current = value;
                      setDraft(value);
                    }}
                    dark={dark}
                    themeId={preferences.colorTheme}
                    disabled={deleted}
                    mode={preferences.primaryView}
                    vaultId={vault.id}
                    sourcePath={snapshot.path}
                    onOpenNote={openDocument}
                  />
                )}
              </section>
            </div>
          )}
        </section>
      </div>

      {error && (
        <div className="toast" role="alert">
          <CircleAlert size={16} /> <span>{error}</span>
          <Button variant="ghost" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}
      <QuickOpen
        open={quickOpen}
        onOpenChange={setQuickOpen}
        tree={tree}
        onSelect={(path) => void openDocument(path)}
      />
      {previewAttachment && (
        <AttachmentDialog
          open
          vaultId={vault.id}
          path={previewAttachment.path}
          kind={previewAttachment.kind}
          onOpenChange={(open) => {
            if (!open) setPreviewAttachment(null);
          }}
        />
      )}
      <ConflictDialog
        open={Boolean(conflict) || deleted}
        deleted={deleted}
        onReload={() => {
          if (!conflict) return;
          snapshotRef.current = conflict;
          draftRef.current = conflict.text;
          setSnapshot(conflict);
          setDraft(conflict.text);
          setConflict(null);
          setSaveStatus("idle");
        }}
        onOverwrite={() => void saveNow(true)}
        onSaveCopy={() => {
          if (!vault || !snapshot) return;
          void bridge.saveCopy(vault.id, snapshot.path, draft).then((path) => {
            setConflict(null);
            setDeleted(false);
            setSaveStatus("saved");
            if (path) void refreshTree();
          });
        }}
        onClose={() => {
          snapshotRef.current = null;
          setSnapshot(null);
          setDraft("");
          setDeleted(false);
          setSaveStatus("idle");
        }}
      />
      <SettingsDialog
        open={settingsOpen}
        preferences={preferences}
        onOpenChange={setSettingsOpen}
        onChange={setPreferences}
      />
    </main>
  );
}
