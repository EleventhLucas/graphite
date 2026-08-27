import type { AppPreferences, VaultSummary } from "../../shared/contracts";
import { DEFAULT_PREFERENCES, normalizeAppPreferences } from "../../shared/contracts";

const DATABASE_NAME = "graphite-web";
const VAULT_STORE = "vaults";
const PREFERENCES_KEY = "graphite.preferences";

export interface WebVaultRecord {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  lastOpenedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(VAULT_STORE)) {
        request.result.createObjectStore(VAULT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open browser storage."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Browser storage failed."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await requestResult(
      operation(database.transaction(VAULT_STORE, mode).objectStore(VAULT_STORE)),
    );
  } finally {
    database.close();
  }
}

export async function listWebVaults(): Promise<WebVaultRecord[]> {
  const records = await withStore("readonly", (store) => store.getAll());
  return records.sort((left, right) => right.lastOpenedAt - left.lastOpenedAt).slice(0, 10);
}

export async function putWebVault(record: WebVaultRecord): Promise<void> {
  await withStore("readwrite", (store) => store.put(record));
}

export async function deleteWebVault(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export function summaryForWebVault(record: WebVaultRecord): VaultSummary {
  return {
    id: record.id,
    name: record.name,
    displayPath: "Local folder",
    lastOpenedAt: record.lastOpenedAt,
  };
}

export function loadWebPreferences(): AppPreferences {
  try {
    const stored = JSON.parse(
      localStorage.getItem(PREFERENCES_KEY) ?? "null",
    ) as Partial<AppPreferences> | null;
    return normalizeAppPreferences(stored);
  } catch {
    return structuredClone(DEFAULT_PREFERENCES);
  }
}

export function saveWebPreferences(preferences: AppPreferences): AppPreferences {
  const normalized = normalizeAppPreferences(preferences);
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(normalized));
  return normalized;
}
