export const IMAGE_EXTENSIONS = [
  ".avif",
  ".bmp",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
] as const;
export const AUDIO_EXTENSIONS = [".flac", ".m4a", ".mp3", ".ogg", ".wav", ".3gp"] as const;
export const VIDEO_EXTENSIONS = [".mkv", ".mov", ".mp4", ".ogv", ".webm"] as const;
export const PDF_EXTENSIONS = [".pdf"] as const;
export const MARKDOWN_EXTENSIONS = [".md"] as const;
export const SUPPORTED_EXTENSIONS = [
  ...MARKDOWN_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...PDF_EXTENSIONS,
] as const;

export type VaultEntryKind = "folder" | "markdown" | "image" | "audio" | "video" | "pdf";
export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";
export type ThemePreference = "light" | "dark";
export type PrimaryView = "wysiwyg" | "source" | "preview";
export type VaultPath = string;
type EmptyRecord = Record<never, never>;
type RPCSchema<Schema extends { requests: object; messages: object }> = Schema;

export interface VaultSummary {
  id: string;
  name: string;
  displayPath: string;
  lastOpenedAt: number;
  sandbox?: boolean;
}

export interface VaultTreeNode {
  name: string;
  path: VaultPath;
  kind: VaultEntryKind;
  modifiedAt: number;
  size: number;
  children?: VaultTreeNode[];
}

export interface DocumentRevision {
  hash: string;
  modifiedAt: number;
  size: number;
}

export interface DocumentSnapshot {
  path: VaultPath;
  text: string;
  revision: DocumentRevision;
  newline: "lf" | "crlf";
  hasBom: boolean;
}

export type SaveResult =
  | { status: "saved"; revision: DocumentRevision }
  | { status: "conflict"; disk: DocumentSnapshot }
  | { status: "error"; message: string };

export type ResolvedLink =
  | { status: "resolved"; path: VaultPath; kind: VaultEntryKind }
  | { status: "missing"; proposedPath: VaultPath }
  | { status: "ambiguous"; candidates: VaultPath[] }
  | { status: "invalid" };

export interface VaultChangeEvent {
  vaultId: string;
  kind: "tree" | "document-deleted" | "document-updated";
  path?: VaultPath;
}

export interface AppPreferences {
  theme: ThemePreference;
  sidebarVisible: boolean;
  primaryView: PrimaryView;
  sidePreviewVisible: boolean;
  sidebarWidth: number;
  editorRatio: number;
  lastVaultId?: string;
  lastNoteByVault: Record<string, VaultPath>;
}

export type AssetPayload =
  | { status: "ok"; mimeType: string; base64: string }
  | { status: "too-large"; size: number }
  | { status: "error"; message: string };

export interface MutationResult {
  path?: VaultPath;
  updatedLinks: number;
  failures: string[];
}

export type GraphiteRPC = {
  bun: RPCSchema<{
    requests: {
      bootstrap: {
        params: EmptyRecord;
        response: { recentVaults: VaultSummary[]; preferences: AppPreferences };
      };
      chooseVault: { params: EmptyRecord; response: VaultSummary | null };
      createVault: { params: { name: string }; response: VaultSummary | null };
      openSandboxVault: { params: { reset?: boolean }; response: VaultSummary };
      openRecentVault: { params: { vaultId: string }; response: VaultSummary | null };
      scanVault: { params: { vaultId: string }; response: VaultTreeNode[] };
      readDocument: { params: { vaultId: string; path: VaultPath }; response: DocumentSnapshot };
      saveDocument: {
        params: {
          vaultId: string;
          path: VaultPath;
          text: string;
          baseRevision: DocumentRevision;
          force?: boolean;
        };
        response: SaveResult;
      };
      saveCopy: {
        params: { vaultId: string; sourcePath: VaultPath; text: string };
        response: VaultPath | null;
      };
      createNote: { params: { vaultId: string; folder: VaultPath }; response: VaultPath };
      createFolder: { params: { vaultId: string; folder: VaultPath }; response: VaultPath };
      renameEntry: {
        params: { vaultId: string; path: VaultPath; name: string };
        response: MutationResult;
      };
      moveEntry: {
        params: { vaultId: string; path: VaultPath; destinationFolder: VaultPath };
        response: MutationResult;
      };
      trashEntry: { params: { vaultId: string; path: VaultPath }; response: boolean };
      resolveLink: {
        params: { vaultId: string; sourcePath: VaultPath; target: string };
        response: ResolvedLink;
      };
      createLinkedNote: {
        params: { vaultId: string; sourcePath: VaultPath; target: string };
        response: VaultPath;
      };
      readAsset: { params: { vaultId: string; path: VaultPath }; response: AssetPayload };
      openAttachment: { params: { vaultId: string; path: VaultPath }; response: boolean };
      openExternal: { params: { url: string }; response: boolean };
      completeSmoke: {
        params: { vaultId: string; path: VaultPath };
        response: boolean;
      };
      updatePreferences: { params: { preferences: AppPreferences }; response: AppPreferences };
    };
    messages: EmptyRecord;
  }>;
  webview: RPCSchema<{
    requests: {
      prepareToClose: { params: EmptyRecord; response: boolean };
    };
    messages: {
      vaultChanged: VaultChangeEvent;
    };
  }>;
};

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: "light",
  sidebarVisible: true,
  primaryView: "wysiwyg",
  sidePreviewVisible: true,
  sidebarWidth: 248,
  editorRatio: 0.5,
  lastNoteByVault: {},
};

type LegacyPreferences = Omit<Partial<AppPreferences>, "theme"> & {
  theme?: ThemePreference | "system";
  editorVisible?: boolean;
  previewVisible?: boolean;
};

export function normalizeAppPreferences(stored?: LegacyPreferences | null): AppPreferences {
  const legacyPrimaryView: PrimaryView = !stored
    ? DEFAULT_PREFERENCES.primaryView
    : stored.editorVisible === false && stored.previewVisible !== false
      ? "preview"
      : "source";
  const legacySidePreview = stored?.editorVisible !== false && stored?.previewVisible !== false;
  const primaryView = new Set<PrimaryView>(["wysiwyg", "source", "preview"]).has(
    stored?.primaryView as PrimaryView,
  )
    ? (stored?.primaryView as PrimaryView)
    : legacyPrimaryView;

  return {
    theme: stored?.theme === "dark" ? "dark" : "light",
    sidebarVisible: stored?.sidebarVisible ?? DEFAULT_PREFERENCES.sidebarVisible,
    primaryView,
    sidePreviewVisible: stored?.sidePreviewVisible ?? legacySidePreview,
    sidebarWidth: Math.min(480, Math.max(180, stored?.sidebarWidth ?? 248)),
    editorRatio: Math.min(0.8, Math.max(0.2, stored?.editorRatio ?? 0.5)),
    lastVaultId: stored?.lastVaultId,
    lastNoteByVault: stored?.lastNoteByVault ?? {},
  };
}
