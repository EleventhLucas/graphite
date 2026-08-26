// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./web-vault-store", () => ({
  deleteWebVault: vi.fn(async () => undefined),
  listWebVaults: vi.fn(async () => []),
  loadWebPreferences: vi.fn(() => ({
    theme: "system",
    sidebarVisible: true,
    editorVisible: true,
    previewVisible: true,
    sidebarWidth: 248,
    editorRatio: 0.5,
    lastNoteByVault: {},
  })),
  putWebVault: vi.fn(async () => undefined),
  saveWebPreferences: vi.fn((preferences) => preferences),
  summaryForWebVault: vi.fn((record) => ({
    id: record.id,
    name: record.name,
    displayPath: "Local folder",
    lastOpenedAt: record.lastOpenedAt,
  })),
}));

import { createWebFileSystemBridge } from "./web-file-system-bridge";

function bytesFromBlob(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

class MemoryFileHandle {
  readonly kind = "file" as const;
  lastModified = 1;
  bytes: Uint8Array;

  constructor(
    readonly name: string,
    text: string,
  ) {
    this.bytes = new TextEncoder().encode(text);
  }

  async getFile(): Promise<File> {
    const bytes = new Uint8Array(this.bytes);
    return {
      name: this.name,
      size: bytes.byteLength,
      lastModified: this.lastModified,
      arrayBuffer: async () => bytes.buffer,
    } as File;
  }

  async createWritable(): Promise<FileSystemWritableFileStream> {
    let next = this.bytes;
    return {
      write: async (data: FileSystemWriteChunkType) => {
        if (!(data instanceof Blob)) throw new Error("The test only accepts Blob writes.");
        next = await bytesFromBlob(data);
      },
      close: async () => {
        this.bytes = next;
        this.lastModified += 1;
      },
      abort: async () => undefined,
    } as FileSystemWritableFileStream;
  }

  externalWrite(text: string): void {
    this.bytes = new TextEncoder().encode(text);
    this.lastModified += 1;
  }
}

class MemoryDirectoryHandle {
  readonly kind = "directory" as const;
  readonly children = new Map<string, MemoryDirectoryHandle | MemoryFileHandle>();

  constructor(readonly name: string) {}

  async *entries(): AsyncIterableIterator<
    [string, FileSystemDirectoryHandle | FileSystemFileHandle]
  > {
    for (const [name, handle] of this.children) {
      yield [name, handle as unknown as FileSystemDirectoryHandle | FileSystemFileHandle];
    }
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
    const existing = this.children.get(name);
    if (existing instanceof MemoryFileHandle) return existing as unknown as FileSystemFileHandle;
    if (!existing && options?.create) {
      const created = new MemoryFileHandle(name, "");
      this.children.set(name, created);
      return created as unknown as FileSystemFileHandle;
    }
    throw new DOMException("Entry not found.", "NotFoundError");
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemDirectoryHandle> {
    const existing = this.children.get(name);
    if (existing instanceof MemoryDirectoryHandle) {
      return existing as unknown as FileSystemDirectoryHandle;
    }
    if (!existing && options?.create) {
      const created = new MemoryDirectoryHandle(name);
      this.children.set(name, created);
      return created as unknown as FileSystemDirectoryHandle;
    }
    throw new DOMException("Entry not found.", "NotFoundError");
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.children.delete(name)) throw new DOMException("Entry not found.", "NotFoundError");
  }

  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return other === (this as unknown as FileSystemHandle);
  }

  async queryPermission(): Promise<PermissionState> {
    return "granted";
  }

  async requestPermission(): Promise<PermissionState> {
    return "granted";
  }
}

describe("web file-system bridge", () => {
  beforeEach(() => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  });

  it("scans supported visible entries and detects revision conflicts", async () => {
    const root = new MemoryDirectoryHandle("Notes");
    const note = new MemoryFileHandle("Welcome.md", "# Welcome\r\n");
    root.children.set("Welcome.md", note);
    root.children.set("diagram.png", new MemoryFileHandle("diagram.png", "image"));
    root.children.set("ignore.txt", new MemoryFileHandle("ignore.txt", "ignored"));
    root.children.set(".obsidian", new MemoryDirectoryHandle(".obsidian"));
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: vi.fn(async () => root as unknown as FileSystemDirectoryHandle),
    });

    const bridge = createWebFileSystemBridge();
    const vault = await bridge.chooseVault();
    expect(vault?.name).toBe("Notes");
    if (!vault) throw new Error("Expected a selected vault.");

    const tree = await bridge.scanVault(vault.id);
    expect(tree.map((entry) => entry.name)).toEqual(["diagram.png", "Welcome.md"]);

    const snapshot = await bridge.readDocument(vault.id, "Welcome.md");
    expect(snapshot.newline).toBe("crlf");
    note.externalWrite("# External\r\n");
    const result = await bridge.saveDocument(
      vault.id,
      "Welcome.md",
      "# Local\r\n",
      snapshot.revision,
    );
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") expect(result.disk.text).toBe("# External\n");
  });

  it("returns null when the directory picker is cancelled", async () => {
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: vi.fn(async () => {
        throw new DOMException("Cancelled", "AbortError");
      }),
    });
    const bridge = createWebFileSystemBridge();
    await expect(bridge.chooseVault()).resolves.toBeNull();
  });
});
