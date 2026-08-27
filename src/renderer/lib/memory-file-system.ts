import { createSandboxVaultFiles, SANDBOX_VAULT_NAME } from "../../shared/sandbox-vault";

async function bytesFromWrite(data: FileSystemWriteChunkType): Promise<Uint8Array> {
  if (data instanceof Blob) {
    if (typeof data.arrayBuffer === "function") return new Uint8Array(await data.arrayBuffer());
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(data);
    });
  }
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }
  if (typeof data === "string") return new TextEncoder().encode(data);
  throw new Error("The in-memory sandbox received an unsupported write.");
}

export class MemoryFileHandle {
  readonly kind = "file" as const;
  private lastModified = Date.now();

  constructor(
    readonly name: string,
    private bytes: Uint8Array,
  ) {}

  async getFile(): Promise<File> {
    const bytes = new Uint8Array(this.bytes);
    const file = new File([bytes], this.name, { lastModified: this.lastModified });
    if (typeof file.arrayBuffer !== "function") {
      Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer });
    }
    return file;
  }

  async createWritable(): Promise<FileSystemWritableFileStream> {
    let next = this.bytes;
    return {
      write: async (data: FileSystemWriteChunkType) => {
        next = await bytesFromWrite(data);
      },
      close: async () => {
        this.bytes = next;
        this.lastModified = Date.now();
      },
      abort: async () => undefined,
    } as FileSystemWritableFileStream;
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

export class MemoryDirectoryHandle {
  readonly kind = "directory" as const;
  readonly children = new Map<string, MemoryDirectoryHandle | MemoryFileHandle>();

  constructor(readonly name: string) {}

  async *entries(): AsyncIterableIterator<
    [string, FileSystemDirectoryHandle | FileSystemFileHandle]
  > {
    for (const [name, handle] of this.children) {
      yield [name, handle as FileSystemDirectoryHandle | FileSystemFileHandle];
    }
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
    const existing = this.children.get(name);
    if (existing instanceof MemoryFileHandle) return existing as unknown as FileSystemFileHandle;
    if (!existing && options?.create) {
      const created = new MemoryFileHandle(name, new Uint8Array());
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

export function createMemorySandboxDirectory(): FileSystemDirectoryHandle {
  const root = new MemoryDirectoryHandle(SANDBOX_VAULT_NAME);
  for (const file of createSandboxVaultFiles()) {
    const parts = file.path.split("/");
    const name = parts.pop();
    if (!name) continue;
    let directory = root;
    for (const part of parts) {
      const existing = directory.children.get(part);
      if (existing instanceof MemoryDirectoryHandle) {
        directory = existing;
      } else {
        const created = new MemoryDirectoryHandle(part);
        directory.children.set(part, created);
        directory = created;
      }
    }
    directory.children.set(name, new MemoryFileHandle(name, new Uint8Array(file.bytes)));
  }
  return root as unknown as FileSystemDirectoryHandle;
}
