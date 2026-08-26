import { mkdtemp, mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VaultService } from "./vault-service";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "graphite-test-"));
  roots.push(root);
  await mkdir(join(root, "Notes"));
  await mkdir(join(root, ".obsidian"));
  await writeFile(join(root, "Notes", "Home.md"), "# Home\r\n\r\nSee [[Target]].\r\n", "utf8");
  await writeFile(join(root, "Notes", "Target.md"), "# Target\n", "utf8");
  await writeFile(join(root, ".obsidian", "app.json"), "{}", "utf8");
  await writeFile(join(root, "ignored.json"), "{}", "utf8");
  const service = new VaultService({
    moveToTrash: async (path) => {
      await rename(path, `${path}.trashed`);
      return true;
    },
    openPath: () => true,
    onChange: () => undefined,
  });
  const vault = await service.openRoot(root);
  return { root, service, vault };
}

describe("VaultService", () => {
  it("scans supported visible entries only", async () => {
    const { service, vault } = await fixture();
    try {
      const tree = await service.scan(vault.id);
      expect(tree.map((node) => node.name)).toEqual(["Notes"]);
      expect(tree[0].children?.map((node) => node.name)).toEqual(["Home.md", "Target.md"]);
    } finally {
      service.close(vault.id);
    }
  });

  it("detects save conflicts and preserves CRLF", async () => {
    const { root, service, vault } = await fixture();
    try {
      const original = await service.readDocument(vault.id, "Notes/Home.md");
      await writeFile(join(root, "Notes", "Home.md"), "external\r\n", "utf8");
      const conflict = await service.saveDocument(
        vault.id,
        "Notes/Home.md",
        "mine",
        original.revision,
      );
      expect(conflict.status).toBe("conflict");
      const forced = await service.saveDocument(
        vault.id,
        "Notes/Home.md",
        "mine\nagain",
        original.revision,
        true,
      );
      expect(forced.status).toBe("saved");
      expect(await readFile(join(root, "Notes", "Home.md"), "utf8")).toBe("mine\r\nagain");
    } finally {
      service.close(vault.id);
    }
  });

  it("renames notes and updates inbound wikilinks", async () => {
    const { root, service, vault } = await fixture();
    try {
      const result = await service.renameEntry(vault.id, "Notes/Target.md", "Renamed.md");
      expect(result).toMatchObject({ path: "Notes/Renamed.md", updatedLinks: 1, failures: [] });
      expect(await readFile(join(root, "Notes", "Home.md"), "utf8")).toContain("[[Renamed]]");
    } finally {
      service.close(vault.id);
    }
  });

  it("serializes saves and reports a stale concurrent revision as a conflict", async () => {
    const { service, vault } = await fixture();
    try {
      const original = await service.readDocument(vault.id, "Notes/Home.md");
      const [first, second] = await Promise.all([
        service.saveDocument(vault.id, original.path, "first", original.revision),
        service.saveDocument(vault.id, original.path, "second", original.revision),
      ]);
      expect(first.status).toBe("saved");
      expect(second.status).toBe("conflict");
    } finally {
      service.close(vault.id);
    }
  });

  it("restores an externally deleted note only when force is explicit", async () => {
    const { root, service, vault } = await fixture();
    try {
      const original = await service.readDocument(vault.id, "Notes/Home.md");
      await unlink(join(root, "Notes", "Home.md"));
      expect(
        (await service.saveDocument(vault.id, original.path, "restored", original.revision)).status,
      ).toBe("error");
      expect(
        (await service.saveDocument(vault.id, original.path, "restored", original.revision, true))
          .status,
      ).toBe("saved");
      expect(await readFile(join(root, "Notes", "Home.md"), "utf8")).toBe("restored");
    } finally {
      service.close(vault.id);
    }
  });

  it("rejects destructive operations against the vault root", async () => {
    const { service, vault } = await fixture();
    try {
      await expect(service.trashEntry(vault.id, "")).rejects.toThrow("vault root");
      await expect(service.moveEntry(vault.id, "", "Notes")).rejects.toThrow("vault root");
    } finally {
      service.close(vault.id);
    }
  });
});
