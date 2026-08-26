import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import type {
  AssetPayload,
  DocumentRevision,
  DocumentSnapshot,
  MutationResult,
  ResolvedLink,
  VaultChangeEvent,
  VaultSummary,
  VaultTreeNode,
} from "../shared/contracts";
import { decodeMarkdown, encodeMarkdown } from "../shared/encoding";
import { mapMovedPath, resolveVaultLink, rewriteLinksForMove } from "../shared/links";
import {
  entryKindForPath,
  isHiddenPath,
  isSupportedPath,
  normalizeVaultPath,
  validateEntryName,
} from "../shared/paths";

const MAX_ASSET_BYTES = 64 * 1024 * 1024;
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

interface ActiveVault {
  summary: VaultSummary;
  root: string;
}

interface VaultDependencies {
  moveToTrash(path: string): boolean | Promise<boolean>;
  openPath(path: string): boolean | Promise<boolean>;
  onChange(event: VaultChangeEvent): void;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function vaultId(root: string): string {
  return createHash("sha256").update(resolve(root).toLocaleLowerCase()).digest("hex").slice(0, 20);
}

function compareNodes(left: VaultTreeNode, right: VaultTreeNode): number {
  if (left.kind === "folder" && right.kind !== "folder") return -1;
  if (left.kind !== "folder" && right.kind === "folder") return 1;
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
}

export class VaultService {
  private active = new Map<string, ActiveVault>();
  private watchers = new Map<string, FSWatcher[]>();
  private changeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private writeQueues = new Map<string, Promise<void>>();

  constructor(private readonly dependencies: VaultDependencies) {}

  async openRoot(root: string): Promise<VaultSummary> {
    const absoluteRoot = resolve(root);
    const details = await lstat(absoluteRoot);
    if (details.isSymbolicLink()) throw new Error("A vault root cannot be a symbolic link.");
    if (!details.isDirectory()) throw new Error("The selected vault is not a directory.");
    const canonicalRoot = await realpath(absoluteRoot);
    const summary: VaultSummary = {
      id: vaultId(absoluteRoot),
      name: basename(absoluteRoot),
      displayPath: canonicalRoot,
      lastOpenedAt: Date.now(),
    };
    for (const openVaultId of [...this.active.keys()]) this.close(openVaultId);
    this.active.set(summary.id, { summary, root: canonicalRoot });
    await this.startWatching(summary.id);
    return summary;
  }

  close(vaultIdValue: string): void {
    clearTimeout(this.changeTimers.get(vaultIdValue));
    this.changeTimers.delete(vaultIdValue);
    for (const watcher of this.watchers.get(vaultIdValue) ?? []) watcher.close();
    this.watchers.delete(vaultIdValue);
    this.active.delete(vaultIdValue);
  }

  async createRoot(parent: string, name: string): Promise<VaultSummary> {
    const target = join(resolve(parent), validateEntryName(name));
    await mkdir(target, { recursive: false });
    return this.openRoot(target);
  }

  async scan(vaultIdValue: string): Promise<VaultTreeNode[]> {
    const vault = this.requireVault(vaultIdValue);
    return this.scanDirectory(vault.root, "");
  }

  async readDocument(vaultIdValue: string, vaultPath: string): Promise<DocumentSnapshot> {
    const absolute = await this.safeExistingPath(vaultIdValue, vaultPath, "markdown");
    const bytes = new Uint8Array(await readFile(absolute));
    const decoded = decodeMarkdown(bytes);
    return {
      path: normalizeVaultPath(vaultPath),
      text: decoded.text,
      newline: decoded.newline,
      hasBom: decoded.hasBom,
      revision: await this.revision(absolute, bytes),
    };
  }

  async saveDocument(
    vaultIdValue: string,
    vaultPath: string,
    text: string,
    baseRevision: DocumentRevision,
    force = false,
  ) {
    const cleanPath = normalizeVaultPath(vaultPath);
    if (entryKindForPath(cleanPath) !== "markdown") {
      return { status: "error" as const, message: "A Markdown file is required." };
    }
    return this.withWriteLock(`${vaultIdValue}:${cleanPath.toLocaleLowerCase()}`, async () => {
      try {
        let absolute: string;
        try {
          absolute = await this.safeExistingPath(vaultIdValue, cleanPath, "markdown");
        } catch (error) {
          if (!force || !isMissingError(error)) throw error;
          const parent = dirname(cleanPath) === "." ? "" : dirname(cleanPath);
          await this.safeExistingPath(vaultIdValue, parent, "folder");
          absolute = this.safeNewPath(vaultIdValue, cleanPath);
          const bytes = encodeMarkdown(text, "lf", false);
          await this.atomicWrite(absolute, bytes);
          return { status: "saved" as const, revision: await this.revision(absolute, bytes) };
        }
        const currentBytes = new Uint8Array(await readFile(absolute));
        const currentRevision = await this.revision(absolute, currentBytes);
        if (!force && currentRevision.hash !== baseRevision.hash) {
          return {
            status: "conflict" as const,
            disk: await this.readDocument(vaultIdValue, cleanPath),
          };
        }
        const decoded = decodeMarkdown(currentBytes);
        const bytes = encodeMarkdown(text, decoded.newline, decoded.hasBom);
        await this.atomicWrite(absolute, bytes);
        return {
          status: "saved" as const,
          revision: await this.revision(absolute, bytes),
        };
      } catch (error) {
        return {
          status: "error" as const,
          message: error instanceof Error ? error.message : "Save failed.",
        };
      }
    });
  }

  async saveCopy(vaultIdValue: string, sourcePath: string, text: string): Promise<string> {
    const folder = dirname(normalizeVaultPath(sourcePath));
    const base = basename(sourcePath, ".md");
    await this.safeExistingPath(vaultIdValue, folder === "." ? "" : folder, "folder");
    const path = await this.uniquePath(vaultIdValue, folder, `${base} (conflict copy)`, ".md");
    const absolute = this.safeNewPath(vaultIdValue, path);
    await writeFile(absolute, encodeMarkdown(text, "lf", false));
    return path;
  }

  async createNote(vaultIdValue: string, folder: string): Promise<string> {
    const cleanFolder = normalizeVaultPath(folder);
    await this.safeExistingPath(vaultIdValue, cleanFolder, "folder");
    const path = await this.uniquePath(vaultIdValue, cleanFolder, "Untitled", ".md");
    await writeFile(this.safeNewPath(vaultIdValue, path), new Uint8Array());
    return path;
  }

  async createFolder(vaultIdValue: string, folder: string): Promise<string> {
    const cleanFolder = normalizeVaultPath(folder);
    await this.safeExistingPath(vaultIdValue, cleanFolder, "folder");
    const path = await this.uniquePath(vaultIdValue, cleanFolder, "New folder", "");
    await mkdir(this.safeNewPath(vaultIdValue, path));
    return path;
  }

  async renameEntry(
    vaultIdValue: string,
    vaultPath: string,
    name: string,
  ): Promise<MutationResult> {
    const cleanPath = normalizeVaultPath(vaultPath);
    if (!cleanPath) throw new Error("The vault root cannot be renamed.");
    const oldAbsolute = await this.safeExistingPath(vaultIdValue, cleanPath);
    const newPath = normalizeVaultPath(
      join(dirname(cleanPath), validateEntryName(name)).replaceAll(sep, "/"),
    );
    if ((await lstat(oldAbsolute)).isFile() && !isSupportedPath(newPath)) {
      throw new Error("Graphite entries must keep a supported file extension.");
    }
    return this.moveWithLinkUpdate(vaultIdValue, cleanPath, newPath, oldAbsolute);
  }

  async moveEntry(
    vaultIdValue: string,
    vaultPath: string,
    destinationFolder: string,
  ): Promise<MutationResult> {
    const cleanPath = normalizeVaultPath(vaultPath);
    if (!cleanPath) throw new Error("The vault root cannot be moved.");
    const oldAbsolute = await this.safeExistingPath(vaultIdValue, cleanPath);
    await this.safeExistingPath(vaultIdValue, destinationFolder, "folder");
    const newPath = normalizeVaultPath(
      join(destinationFolder, basename(cleanPath)).replaceAll(sep, "/"),
    );
    return this.moveWithLinkUpdate(vaultIdValue, cleanPath, newPath, oldAbsolute);
  }

  async trashEntry(vaultIdValue: string, vaultPath: string): Promise<boolean> {
    const cleanPath = normalizeVaultPath(vaultPath);
    if (!cleanPath) throw new Error("The vault root cannot be trashed.");
    const absolute = await this.safeExistingPath(vaultIdValue, cleanPath);
    return Boolean(await this.dependencies.moveToTrash(absolute));
  }

  async resolveLink(
    vaultIdValue: string,
    sourcePath: string,
    target: string,
  ): Promise<ResolvedLink> {
    const paths = await this.supportedPaths(vaultIdValue);
    return resolveVaultLink(sourcePath, target, paths);
  }

  async createLinkedNote(
    vaultIdValue: string,
    sourcePath: string,
    target: string,
  ): Promise<string> {
    const resolution = await this.resolveLink(vaultIdValue, sourcePath, target);
    if (resolution.status === "resolved") return resolution.path;
    if (
      resolution.status !== "missing" ||
      extname(resolution.proposedPath).toLowerCase() !== ".md"
    ) {
      throw new Error("This link cannot be created as a Markdown note.");
    }
    const desired = resolution.proposedPath;
    const folder = dirname(desired) === "." ? "" : dirname(desired);
    await this.ensureFolder(vaultIdValue, folder);
    const unique = await this.uniquePath(
      vaultIdValue,
      folder,
      validateEntryName(basename(desired, ".md")),
      ".md",
    );
    await writeFile(this.safeNewPath(vaultIdValue, unique), new Uint8Array());
    return unique;
  }

  async readAsset(vaultIdValue: string, vaultPath: string): Promise<AssetPayload> {
    try {
      const absolute = await this.safeExistingPath(vaultIdValue, vaultPath);
      const kind = entryKindForPath(vaultPath);
      if (!kind || kind === "markdown")
        return { status: "error", message: "Unsupported attachment." };
      const details = await stat(absolute);
      if (details.size > MAX_ASSET_BYTES) return { status: "too-large", size: details.size };
      const bytes = await readFile(absolute);
      return {
        status: "ok",
        mimeType: MIME_TYPES[extname(vaultPath).toLowerCase()] ?? "application/octet-stream",
        base64: bytes.toString("base64"),
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Attachment failed.",
      };
    }
  }

  async openAttachment(vaultIdValue: string, vaultPath: string): Promise<boolean> {
    return Boolean(
      await this.dependencies.openPath(await this.safeExistingPath(vaultIdValue, vaultPath)),
    );
  }

  private requireVault(vaultIdValue: string): ActiveVault {
    const vault = this.active.get(vaultIdValue);
    if (!vault) throw new Error("The vault is not open.");
    return vault;
  }

  private safeNewPath(vaultIdValue: string, vaultPath: string): string {
    const vault = this.requireVault(vaultIdValue);
    const clean = normalizeVaultPath(vaultPath);
    if (isHiddenPath(clean)) throw new Error("Hidden paths are outside Graphite's workspace.");
    const absolute = resolve(vault.root, clean);
    const prefix = `${vault.root}${sep}`.toLocaleLowerCase();
    if (
      absolute.toLocaleLowerCase() !== vault.root.toLocaleLowerCase() &&
      !absolute.toLocaleLowerCase().startsWith(prefix)
    ) {
      throw new Error("Path must remain inside the active vault.");
    }
    return absolute;
  }

  private async safeExistingPath(
    vaultIdValue: string,
    vaultPath: string,
    expectedKind?: "markdown" | "folder",
  ): Promise<string> {
    const absolute = this.safeNewPath(vaultIdValue, vaultPath);
    const clean = normalizeVaultPath(vaultPath);
    let cursor = this.requireVault(vaultIdValue).root;
    for (const segment of clean.split("/").filter(Boolean)) {
      cursor = join(cursor, segment);
      const segmentDetails = await lstat(cursor);
      if (segmentDetails.isSymbolicLink()) throw new Error("Symbolic links are not supported.");
    }
    const details = await lstat(absolute);
    const canonical = await realpath(absolute);
    const vaultRoot = this.requireVault(vaultIdValue).root;
    const prefix = `${vaultRoot}${sep}`.toLocaleLowerCase();
    if (
      canonical.toLocaleLowerCase() !== vaultRoot.toLocaleLowerCase() &&
      !canonical.toLocaleLowerCase().startsWith(prefix)
    ) {
      throw new Error("Symbolic links cannot leave the active vault.");
    }
    if (expectedKind === "folder" && !details.isDirectory())
      throw new Error("A folder is required.");
    if (
      expectedKind === "markdown" &&
      (!details.isFile() || extname(absolute).toLowerCase() !== ".md")
    ) {
      throw new Error("A Markdown file is required.");
    }
    if (!expectedKind && !details.isDirectory() && (!details.isFile() || !isSupportedPath(clean))) {
      throw new Error("The entry type is not supported by Graphite.");
    }
    return absolute;
  }

  private async ensureFolder(vaultIdValue: string, folder: string): Promise<void> {
    let current = "";
    for (const segment of normalizeVaultPath(folder).split("/").filter(Boolean)) {
      const validSegment = validateEntryName(segment);
      current = current ? `${current}/${validSegment}` : validSegment;
      try {
        await this.safeExistingPath(vaultIdValue, current, "folder");
      } catch (error) {
        if (!isMissingError(error)) throw error;
        await mkdir(this.safeNewPath(vaultIdValue, current));
      }
    }
  }

  private async scanDirectory(root: string, vaultPath: string): Promise<VaultTreeNode[]> {
    const absolute = vaultPath ? resolve(root, vaultPath) : root;
    const entries = await readdir(absolute, { withFileTypes: true });
    const osHiddenNames = await this.windowsHiddenNames(absolute);
    const nodes: VaultTreeNode[] = [];
    for (const entry of entries) {
      if (
        entry.name.startsWith(".") ||
        osHiddenNames.has(entry.name.toLocaleLowerCase()) ||
        entry.isSymbolicLink()
      )
        continue;
      const childPath = normalizeVaultPath(join(vaultPath, entry.name).replaceAll(sep, "/"));
      if (entry.isDirectory()) {
        const details = await stat(resolve(root, childPath));
        nodes.push({
          name: entry.name,
          path: childPath,
          kind: "folder",
          modifiedAt: details.mtimeMs,
          size: 0,
          children: await this.scanDirectory(root, childPath),
        });
      } else if (entry.isFile() && isSupportedPath(childPath)) {
        const details = await stat(resolve(root, childPath));
        const kind = entryKindForPath(childPath);
        if (kind)
          nodes.push({
            name: entry.name,
            path: childPath,
            kind,
            modifiedAt: details.mtimeMs,
            size: details.size,
          });
      }
    }
    return nodes.sort(compareNodes);
  }

  private async supportedPaths(vaultIdValue: string): Promise<string[]> {
    const flatten = (nodes: VaultTreeNode[]): string[] =>
      nodes.flatMap((node) =>
        node.kind === "folder" ? flatten(node.children ?? []) : [node.path],
      );
    return flatten(await this.scan(vaultIdValue));
  }

  private async windowsHiddenNames(absolute: string): Promise<Set<string>> {
    const hidden = new Set<string>();
    if (process.platform !== "win32") return hidden;
    try {
      const child = Bun.spawn(["attrib", "/D", join(absolute, "*")], {
        stdout: "pipe",
        stderr: "ignore",
      });
      const output = await new Response(child.stdout).text();
      if ((await child.exited) !== 0) return hidden;
      const folderMarker = absolute.toLocaleLowerCase();
      for (const line of output.split(/\r?\n/)) {
        if (!line.slice(0, 20).toUpperCase().includes("H")) continue;
        const pathIndex = line.toLocaleLowerCase().indexOf(folderMarker);
        if (pathIndex >= 0) hidden.add(basename(line.slice(pathIndex)).toLocaleLowerCase());
      }
    } catch {
      // A failed attribute query must not prevent the vault from opening.
    }
    return hidden;
  }

  private async markdownPaths(vaultIdValue: string): Promise<string[]> {
    return (await this.supportedPaths(vaultIdValue)).filter((path) =>
      path.toLowerCase().endsWith(".md"),
    );
  }

  private async uniquePath(
    vaultIdValue: string,
    folder: string,
    base: string,
    extension: string,
  ): Promise<string> {
    for (let index = 1; index < 10_000; index += 1) {
      const suffix = index === 1 ? "" : ` ${index}`;
      const candidate = normalizeVaultPath(
        join(folder, `${base}${suffix}${extension}`).replaceAll(sep, "/"),
      );
      try {
        await lstat(this.safeNewPath(vaultIdValue, candidate));
      } catch (error) {
        if (isMissingError(error)) return candidate;
        throw error;
      }
    }
    throw new Error("Could not create a unique name.");
  }

  private async revision(absolute: string, bytes?: Uint8Array): Promise<DocumentRevision> {
    const content = bytes ?? new Uint8Array(await readFile(absolute));
    const details = await stat(absolute);
    return { hash: hashBytes(content), modifiedAt: details.mtimeMs, size: details.size };
  }

  private async atomicWrite(absolute: string, bytes: Uint8Array): Promise<void> {
    const temporary = join(
      dirname(absolute),
      `.${basename(absolute)}.graphite-${randomUUID()}.tmp`,
    );
    try {
      const handle = await open(temporary, "wx");
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      try {
        await rename(temporary, absolute);
      } catch {
        await copyFile(temporary, absolute);
        await unlink(temporary);
      }
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  private async moveWithLinkUpdate(
    vaultIdValue: string,
    oldPath: string,
    newPath: string,
    oldAbsolute: string,
  ): Promise<MutationResult> {
    if (oldPath === newPath) return { path: newPath, updatedLinks: 0, failures: [] };
    const newAbsolute = this.safeNewPath(vaultIdValue, newPath);
    const destinationFolder = dirname(newPath) === "." ? "" : dirname(newPath);
    await this.safeExistingPath(vaultIdValue, destinationFolder, "folder");
    try {
      await lstat(newAbsolute);
      throw new Error("An entry already exists at the destination.");
    } catch (error) {
      if (!isMissingError(error)) throw error;
    }

    const oldPaths = await this.supportedPaths(vaultIdValue);
    const markdownPaths = await this.markdownPaths(vaultIdValue);
    const documents = await Promise.all(
      markdownPaths.map(async (path) => ({
        path,
        snapshot: await this.readDocument(vaultIdValue, path),
      })),
    );
    await mkdir(dirname(newAbsolute), { recursive: true });
    await rename(oldAbsolute, newAbsolute);

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
        const targetAbsolute = this.safeNewPath(vaultIdValue, movedDocumentPath);
        await this.atomicWrite(
          targetAbsolute,
          encodeMarkdown(rewritten, document.snapshot.newline, document.snapshot.hasBom),
        );
        updatedLinks += 1;
      } catch {
        failures.push(movedDocumentPath);
      }
    }
    return { path: newPath, updatedLinks, failures };
  }

  private async startWatching(vaultIdValue: string): Promise<void> {
    if (!this.active.has(vaultIdValue)) return;
    for (const watcher of this.watchers.get(vaultIdValue) ?? []) watcher.close();
    const vault = this.requireVault(vaultIdValue);
    const directories: string[] = [];
    const collect = async (absolute: string): Promise<void> => {
      directories.push(absolute);
      for (const entry of await readdir(absolute, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || !entry.isDirectory() || entry.isSymbolicLink()) continue;
        await collect(join(absolute, entry.name));
      }
    };
    await collect(vault.root);
    const watchers = directories.map((directory) =>
      watch(directory, (_event, filename) => {
        if (filename?.toString().startsWith(".")) return;
        clearTimeout(this.changeTimers.get(vaultIdValue));
        this.changeTimers.set(
          vaultIdValue,
          setTimeout(() => {
            const changedPath = filename
              ? normalizeVaultPath(
                  relative(vault.root, join(directory, filename.toString())).replaceAll(sep, "/"),
                )
              : undefined;
            this.dependencies.onChange({ vaultId: vaultIdValue, kind: "tree", path: changedPath });
            if (this.active.has(vaultIdValue)) void this.startWatching(vaultIdValue);
          }, 120),
        );
      }),
    );
    this.watchers.set(vaultIdValue, watchers);
  }

  private async withWriteLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.writeQueues.get(key) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.writeQueues.set(key, tail);
    try {
      return await result;
    } finally {
      if (this.writeQueues.get(key) === tail) this.writeQueues.delete(key);
    }
  }
}

function isMissingError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}
