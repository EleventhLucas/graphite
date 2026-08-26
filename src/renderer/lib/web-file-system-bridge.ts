import type {
  AssetPayload,
  DocumentRevision,
  DocumentSnapshot,
  MutationResult,
  SaveResult,
  VaultSummary,
  VaultTreeNode,
} from "../../shared/contracts";
import { decodeMarkdown, encodeMarkdown } from "../../shared/encoding";
import { mapMovedPath, resolveVaultLink, rewriteLinksForMove } from "../../shared/links";
import { basename, dirname, extname, join } from "../../shared/posix-path";
import {
  entryKindForPath,
  isHiddenPath,
  isSupportedPath,
  normalizeVaultPath,
  validateEntryName,
} from "../../shared/paths";
import type { ChangeListener, GraphiteBridge } from "./bridge-contract";
import {
  deleteWebVault,
  listWebVaults,
  loadWebPreferences,
  putWebVault,
  saveWebPreferences,
  summaryForWebVault,
  type WebVaultRecord,
} from "./web-vault-store";

const MAX_ASSET_BYTES = 64 * 1024 * 1024;
const POLL_INTERVAL = 2_000;
const MIME_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".3gp": "audio/3gpp",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".ogv": "video/ogg",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
};

function pathParts(value: string): string[] {
  const clean = normalizeVaultPath(value);
  if (isHiddenPath(clean)) throw new Error("Hidden paths are outside Graphite's workspace.");
  return clean.split("/").filter(Boolean);
}

function isMissingError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

function compareNodes(left: VaultTreeNode, right: VaultTreeNode): number {
  if (left.kind === "folder" && right.kind !== "folder") return -1;
  if (left.kind !== "folder" && right.kind === "folder") return 1;
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
}

function flattenTree(nodes: VaultTreeNode[]): VaultTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children ?? [])]);
}

function treeSignature(nodes: VaultTreeNode[]): string {
  return flattenTree(nodes)
    .map((node) => `${node.kind}:${node.path}:${node.modifiedAt}:${node.size}`)
    .join("\n");
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function revisionFor(file: File, bytes?: Uint8Array): Promise<DocumentRevision> {
  const content = bytes ?? new Uint8Array(await file.arrayBuffer());
  return { hash: await sha256(content), modifiedAt: file.lastModified, size: file.size };
}

function base64ForBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Attachment encoding failed."));
    reader.readAsDataURL(blob);
  });
}

export function createWebFileSystemBridge(): GraphiteBridge {
  const supported =
    typeof window.showDirectoryPicker === "function" && window.isSecureContext !== false;
  const limitation = supported
    ? undefined
    : "Local vault access requires desktop Microsoft Edge or Google Chrome in a secure context.";
  const records = new Map<string, WebVaultRecord>();
  const listeners = new Set<ChangeListener>();
  const writeQueues = new Map<string, Promise<void>>();
  let activeVaultId: string | null = null;
  let lastTreeSignature = "";
  let pollTimer: number | null = null;

  const requireSupport = () => {
    if (!supported) throw new Error(limitation);
  };

  const requireVault = (vaultId: string): WebVaultRecord => {
    const record = records.get(vaultId);
    if (!record) throw new Error("This browser no longer has the selected vault handle.");
    return record;
  };

  const ensurePermission = async (
    record: WebVaultRecord,
    interactive: boolean,
  ): Promise<boolean> => {
    const descriptor: FileSystemHandlePermissionDescriptor = { mode: "readwrite" };
    if ((await record.handle.queryPermission(descriptor)) === "granted") return true;
    if (!interactive) return false;
    return (await record.handle.requestPermission(descriptor)) === "granted";
  };

  const directoryFor = async (
    vaultId: string,
    path: string,
    create = false,
  ): Promise<FileSystemDirectoryHandle> => {
    let directory = requireVault(vaultId).handle;
    for (const part of pathParts(path)) {
      if (create) validateEntryName(part);
      directory = await directory.getDirectoryHandle(part, { create });
    }
    return directory;
  };

  const parentAndName = async (
    vaultId: string,
    path: string,
  ): Promise<{ parent: FileSystemDirectoryHandle; name: string }> => {
    const clean = normalizeVaultPath(path);
    const parts = pathParts(clean);
    const name = parts.pop();
    if (!name) throw new Error("The vault root cannot be modified.");
    return { parent: await directoryFor(vaultId, parts.join("/")), name };
  };

  const entryFor = async (
    vaultId: string,
    path: string,
  ): Promise<FileSystemFileHandle | FileSystemDirectoryHandle> => {
    const { parent, name } = await parentAndName(vaultId, path);
    for await (const [entryName, handle] of parent.entries()) {
      if (entryName === name) return handle;
    }
    throw new DOMException("Entry not found.", "NotFoundError");
  };

  const fileHandleFor = async (
    vaultId: string,
    path: string,
    create = false,
  ): Promise<FileSystemFileHandle> => {
    const clean = normalizeVaultPath(path);
    if (entryKindForPath(clean) !== "markdown" && !isSupportedPath(clean)) {
      throw new Error("The file type is not supported by Graphite.");
    }
    const { parent, name } = await parentAndName(vaultId, clean);
    return parent.getFileHandle(name, { create });
  };

  const scanDirectory = async (
    handle: FileSystemDirectoryHandle,
    parentPath: string,
  ): Promise<VaultTreeNode[]> => {
    const nodes: VaultTreeNode[] = [];
    for await (const [name, child] of handle.entries()) {
      if (name.startsWith(".")) continue;
      const path = normalizeVaultPath(join(parentPath, name));
      if (child.kind === "directory") {
        nodes.push({
          name,
          path,
          kind: "folder",
          modifiedAt: 0,
          size: 0,
          children: await scanDirectory(child, path),
        });
      } else if (isSupportedPath(path)) {
        const file = await child.getFile();
        const kind = entryKindForPath(path);
        if (kind) {
          nodes.push({
            name,
            path,
            kind,
            modifiedAt: file.lastModified,
            size: file.size,
          });
        }
      }
    }
    return nodes.sort(compareNodes);
  };

  const scanTree = async (vaultId: string): Promise<VaultTreeNode[]> =>
    scanDirectory(requireVault(vaultId).handle, "");

  const poll = async () => {
    if (!activeVaultId || document.visibilityState === "hidden") return;
    try {
      const next = await scanTree(activeVaultId);
      const signature = treeSignature(next);
      if (lastTreeSignature && signature !== lastTreeSignature) {
        for (const listener of listeners) {
          listener({ vaultId: activeVaultId, kind: "tree" });
        }
      }
      lastTreeSignature = signature;
    } catch {
      // Permission loss is surfaced when the next user action accesses the vault.
    }
  };

  const setActive = (vaultId: string) => {
    activeVaultId = vaultId;
    lastTreeSignature = "";
    if (pollTimer !== null) clearInterval(pollTimer);
    pollTimer = window.setInterval(() => void poll(), POLL_INTERVAL);
  };

  window.addEventListener("focus", () => void poll());

  const touchHandle = async (handle: FileSystemDirectoryHandle): Promise<VaultSummary> => {
    let record: WebVaultRecord | undefined;
    for (const candidate of records.values()) {
      if (await candidate.handle.isSameEntry(handle)) {
        record = candidate;
        break;
      }
    }
    record = {
      id: record?.id ?? crypto.randomUUID(),
      name: handle.name,
      handle,
      lastOpenedAt: Date.now(),
    };
    records.set(record.id, record);
    await putWebVault(record);
    setActive(record.id);
    return summaryForWebVault(record);
  };

  const readDocument = async (vaultId: string, path: string): Promise<DocumentSnapshot> => {
    const handle = await fileHandleFor(vaultId, path);
    const file = await handle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const decoded = decodeMarkdown(bytes);
    return {
      path: normalizeVaultPath(path),
      text: decoded.text,
      newline: decoded.newline,
      hasBom: decoded.hasBom,
      revision: await revisionFor(file, bytes),
    };
  };

  const writeMarkdown = async (
    vaultId: string,
    path: string,
    text: string,
    newline: "lf" | "crlf",
    hasBom: boolean,
    create = false,
  ): Promise<DocumentRevision> => {
    const handle = await fileHandleFor(vaultId, path, create);
    const writable = await handle.createWritable();
    try {
      const encoded = encodeMarkdown(text, newline, hasBom);
      const bytes = encoded.buffer.slice(
        encoded.byteOffset,
        encoded.byteOffset + encoded.byteLength,
      ) as ArrayBuffer;
      await writable.write(new Blob([bytes]));
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
    return revisionFor(await handle.getFile());
  };

  const withWriteLock = async <T>(key: string, operation: () => Promise<T>): Promise<T> => {
    const previous = writeQueues.get(key) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    writeQueues.set(key, tail);
    try {
      return await result;
    } finally {
      if (writeQueues.get(key) === tail) writeQueues.delete(key);
    }
  };

  const uniquePath = async (
    vaultId: string,
    folder: string,
    base: string,
    extension: string,
  ): Promise<string> => {
    const parent = await directoryFor(vaultId, folder);
    for (let index = 1; index < 10_000; index += 1) {
      const suffix = index === 1 ? "" : ` ${index}`;
      const name = `${base}${suffix}${extension}`;
      let exists = false;
      for await (const [entryName] of parent.entries()) {
        if (entryName.toLocaleLowerCase() === name.toLocaleLowerCase()) {
          exists = true;
          break;
        }
      }
      if (!exists) return normalizeVaultPath(join(folder, name));
    }
    throw new Error("Could not create a unique name.");
  };

  const copyEntry = async (
    source: FileSystemFileHandle | FileSystemDirectoryHandle,
    destination: FileSystemDirectoryHandle,
    name: string,
  ): Promise<void> => {
    if (source.kind === "file") {
      const output = await destination.getFileHandle(name, { create: true });
      const writable = await output.createWritable();
      try {
        await writable.write(await source.getFile());
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
      }
      return;
    }
    const output = await destination.getDirectoryHandle(name, { create: true });
    for await (const [childName, child] of source.entries()) {
      await copyEntry(child, output, childName);
    }
  };

  const moveWithLinkUpdate = async (
    vaultId: string,
    oldPath: string,
    newPath: string,
  ): Promise<MutationResult> => {
    if (oldPath === newPath) return { path: newPath, updatedLinks: 0, failures: [] };
    if (newPath.startsWith(`${oldPath}/`)) throw new Error("A folder cannot be moved into itself.");
    const oldTree = await scanTree(vaultId);
    const oldPaths = flattenTree(oldTree)
      .filter((node) => node.kind !== "folder")
      .map((node) => node.path);
    const documents = await Promise.all(
      oldPaths
        .filter((path) => path.toLocaleLowerCase().endsWith(".md"))
        .map(async (path) => ({ path, snapshot: await readDocument(vaultId, path) })),
    );
    const source = await entryFor(vaultId, oldPath);
    const sourceLocation = await parentAndName(vaultId, oldPath);
    const destinationLocation = await parentAndName(vaultId, newPath);
    for await (const [entryName] of destinationLocation.parent.entries()) {
      if (entryName.toLocaleLowerCase() === destinationLocation.name.toLocaleLowerCase()) {
        throw new Error("An entry already exists at the destination.");
      }
    }
    await copyEntry(source, destinationLocation.parent, destinationLocation.name);
    try {
      await sourceLocation.parent.removeEntry(sourceLocation.name, { recursive: true });
    } catch (error) {
      await destinationLocation.parent
        .removeEntry(destinationLocation.name, { recursive: true })
        .catch(() => undefined);
      throw error;
    }

    let updatedLinks = 0;
    const failures: string[] = [];
    for (const document of documents) {
      const movedDocumentPath = mapMovedPath(document.path, oldPath, newPath);
      const rewritten = rewriteLinksForMove(
        document.snapshot.text,
        document.path,
        movedDocumentPath,
        oldPaths,
        oldPath,
        newPath,
      );
      if (rewritten === document.snapshot.text) continue;
      try {
        await writeMarkdown(
          vaultId,
          movedDocumentPath,
          rewritten,
          document.snapshot.newline,
          document.snapshot.hasBom,
        );
        updatedLinks += 1;
      } catch {
        failures.push(movedDocumentPath);
      }
    }
    return { path: newPath, updatedLinks, failures };
  };

  const bridge: GraphiteBridge = {
    capabilities: {
      runtime: supported ? "web" : "unsupported",
      canAccessVaults: supported,
      canTrash: false,
      limitation,
    },
    bootstrap: async () => {
      if (supported) {
        for (const record of await listWebVaults().catch(() => [])) records.set(record.id, record);
      }
      return {
        recentVaults: [...records.values()].map(summaryForWebVault),
        preferences: loadWebPreferences(),
      };
    },
    chooseVault: async () => {
      requireSupport();
      try {
        const handle = await window.showDirectoryPicker({
          id: "graphite-vault",
          mode: "readwrite",
        });
        return touchHandle(handle);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return null;
        throw error;
      }
    },
    createVault: async (name) => {
      requireSupport();
      try {
        const parent = await window.showDirectoryPicker({
          id: "graphite-vault-parent",
          mode: "readwrite",
        });
        const handle = await parent.getDirectoryHandle(validateEntryName(name), { create: true });
        return touchHandle(handle);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return null;
        throw error;
      }
    },
    openRecentVault: async (vaultId, interactive = false) => {
      requireSupport();
      const record = records.get(vaultId);
      if (!record) return null;
      try {
        if (!(await ensurePermission(record, interactive))) return null;
        record.lastOpenedAt = Date.now();
        await putWebVault(record);
        setActive(record.id);
        return summaryForWebVault(record);
      } catch {
        await deleteWebVault(vaultId).catch(() => undefined);
        records.delete(vaultId);
        return null;
      }
    },
    scanVault: async (vaultId) => {
      const tree = await scanTree(vaultId);
      lastTreeSignature = treeSignature(tree);
      return tree;
    },
    readDocument,
    saveDocument: async (vaultId, path, text, baseRevision, force = false) => {
      const clean = normalizeVaultPath(path);
      return withWriteLock(
        `${vaultId}:${clean.toLocaleLowerCase()}`,
        async (): Promise<SaveResult> => {
          try {
            let current: DocumentSnapshot;
            try {
              current = await readDocument(vaultId, clean);
            } catch (error) {
              if (!force || !isMissingError(error)) throw error;
              const revision = await writeMarkdown(vaultId, clean, text, "lf", false, true);
              return { status: "saved", revision };
            }
            if (!force && current.revision.hash !== baseRevision.hash) {
              return { status: "conflict", disk: current };
            }
            const revision = await writeMarkdown(
              vaultId,
              clean,
              text,
              current.newline,
              current.hasBom,
            );
            return { status: "saved", revision };
          } catch (error) {
            return {
              status: "error",
              message: error instanceof Error ? error.message : "Save failed.",
            };
          }
        },
      );
    },
    saveCopy: async (vaultId, sourcePath, text) => {
      const folder = dirname(normalizeVaultPath(sourcePath)).replaceAll("\\", "/");
      const cleanFolder = folder === "." ? "" : folder;
      const base = basename(sourcePath, ".md");
      const path = await uniquePath(vaultId, cleanFolder, `${base} (conflict copy)`, ".md");
      await writeMarkdown(vaultId, path, text, "lf", false, true);
      return path;
    },
    createNote: async (vaultId, folder) => {
      const path = await uniquePath(vaultId, folder, "Untitled", ".md");
      await writeMarkdown(vaultId, path, "", "lf", false, true);
      return path;
    },
    createFolder: async (vaultId, folder) => {
      const path = await uniquePath(vaultId, folder, "New folder", "");
      const parts = pathParts(path);
      const name = validateEntryName(parts.pop() ?? "");
      await (await directoryFor(vaultId, parts.join("/"))).getDirectoryHandle(name, {
        create: true,
      });
      return path;
    },
    renameEntry: async (vaultId, path, name) => {
      const clean = normalizeVaultPath(path);
      const entry = await entryFor(vaultId, clean);
      const validName = validateEntryName(name);
      const newPath = normalizeVaultPath(join(dirname(clean), validName));
      if (entry.kind === "file" && !isSupportedPath(newPath)) {
        throw new Error("Graphite entries must keep a supported file extension.");
      }
      return moveWithLinkUpdate(vaultId, clean, newPath);
    },
    moveEntry: async (vaultId, path, destinationFolder) => {
      await directoryFor(vaultId, destinationFolder);
      const clean = normalizeVaultPath(path);
      return moveWithLinkUpdate(
        vaultId,
        clean,
        normalizeVaultPath(join(destinationFolder, basename(clean))),
      );
    },
    trashEntry: async () => {
      throw new Error("Web Graphite cannot access the operating system trash.");
    },
    resolveLink: async (vaultId, sourcePath, target) => {
      const paths = flattenTree(await scanTree(vaultId))
        .filter((node) => node.kind !== "folder")
        .map((node) => node.path);
      return resolveVaultLink(sourcePath, target, paths);
    },
    createLinkedNote: async (vaultId, sourcePath, target) => {
      const resolution = await bridge.resolveLink(vaultId, sourcePath, target);
      if (resolution.status === "resolved") return resolution.path;
      if (
        resolution.status !== "missing" ||
        entryKindForPath(resolution.proposedPath) !== "markdown"
      ) {
        throw new Error("This link cannot be created as a Markdown note.");
      }
      const parts = pathParts(resolution.proposedPath);
      const filename = parts.pop();
      if (!filename) throw new Error("The linked note name is invalid.");
      const folder = parts.join("/");
      await directoryFor(vaultId, folder, true);
      const path = await uniquePath(
        vaultId,
        folder,
        validateEntryName(basename(filename, ".md")),
        ".md",
      );
      await writeMarkdown(vaultId, path, "", "lf", false, true);
      return path;
    },
    readAsset: async (vaultId, path): Promise<AssetPayload> => {
      try {
        const handle = await fileHandleFor(vaultId, path);
        const file = await handle.getFile();
        if (file.size > MAX_ASSET_BYTES) return { status: "too-large", size: file.size };
        return {
          status: "ok",
          mimeType: MIME_TYPES[extname(path).toLocaleLowerCase()] ?? "application/octet-stream",
          base64: await base64ForBlob(file),
        };
      } catch (error) {
        return {
          status: "error",
          message: error instanceof Error ? error.message : "Attachment failed.",
        };
      }
    },
    openAttachment: async (vaultId, path) => {
      const handle = await fileHandleFor(vaultId, path);
      const url = URL.createObjectURL(await handle.getFile());
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return opened !== null;
    },
    openExternal: async (url) => {
      const parsed = new URL(url);
      if (!new Set(["http:", "https:"]).has(parsed.protocol)) return false;
      return window.open(parsed.href, "_blank", "noopener,noreferrer") !== null;
    },
    completeSmoke: async () => false,
    updatePreferences: async (preferences) => saveWebPreferences(preferences),
    onVaultChanged: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setCloseHandler: () => () => undefined,
  };

  return bridge;
}
