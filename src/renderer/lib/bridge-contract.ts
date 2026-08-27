import type {
  AppPreferences,
  AssetPayload,
  DocumentRevision,
  DocumentSnapshot,
  MutationResult,
  ResolvedLink,
  SaveResult,
  VaultChangeEvent,
  VaultSummary,
  VaultTreeNode,
} from "../../shared/contracts";

export interface GraphiteCapabilities {
  runtime: "desktop" | "web" | "demo" | "unsupported";
  canAccessVaults: boolean;
  canTrash: boolean;
  limitation?: string;
}

export type ChangeListener = (event: VaultChangeEvent) => void;

export interface GraphiteBridge {
  capabilities: GraphiteCapabilities;
  bootstrap(): Promise<{ recentVaults: VaultSummary[]; preferences: AppPreferences }>;
  chooseVault(): Promise<VaultSummary | null>;
  createVault(name: string): Promise<VaultSummary | null>;
  openSandboxVault(reset?: boolean): Promise<VaultSummary>;
  openRecentVault(vaultId: string, interactive?: boolean): Promise<VaultSummary | null>;
  scanVault(vaultId: string): Promise<VaultTreeNode[]>;
  readDocument(vaultId: string, path: string): Promise<DocumentSnapshot>;
  saveDocument(
    vaultId: string,
    path: string,
    text: string,
    baseRevision: DocumentRevision,
    force?: boolean,
  ): Promise<SaveResult>;
  saveCopy(vaultId: string, sourcePath: string, text: string): Promise<string | null>;
  createNote(vaultId: string, folder: string): Promise<string>;
  createFolder(vaultId: string, folder: string): Promise<string>;
  renameEntry(vaultId: string, path: string, name: string): Promise<MutationResult>;
  moveEntry(vaultId: string, path: string, destinationFolder: string): Promise<MutationResult>;
  trashEntry(vaultId: string, path: string): Promise<boolean>;
  resolveLink(vaultId: string, sourcePath: string, target: string): Promise<ResolvedLink>;
  createLinkedNote(vaultId: string, sourcePath: string, target: string): Promise<string>;
  readAsset(vaultId: string, path: string): Promise<AssetPayload>;
  openAttachment(vaultId: string, path: string): Promise<boolean>;
  openExternal(url: string): Promise<boolean>;
  completeSmoke(vaultId: string, path: string): Promise<boolean>;
  updatePreferences(preferences: AppPreferences): Promise<AppPreferences>;
  onVaultChanged(listener: ChangeListener): () => void;
  setCloseHandler(handler: () => Promise<boolean>): () => void;
}
