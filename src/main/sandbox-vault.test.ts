import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureSandboxVault } from "./sandbox-vault";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("ensureSandboxVault", () => {
  it("creates a working copy and preserves user edits when reopened", async () => {
    const root = await mkdtemp(join(tmpdir(), "graphite-sandbox-test-"));
    temporaryRoots.push(root);
    const vault = await ensureSandboxVault(root);
    const home = join(vault, "Home.md");

    await writeFile(home, "# Changed by the user\r\n");
    await ensureSandboxVault(root);

    expect(await readFile(home, "utf8")).toBe("# Changed by the user\r\n");
  });

  it("restores a missing fixture without replacing the working copy", async () => {
    const root = await mkdtemp(join(tmpdir(), "graphite-sandbox-test-"));
    temporaryRoots.push(root);
    const vault = await ensureSandboxVault(root);
    const note = join(vault, "Notes", "Welcome.md");

    await unlink(note);
    await ensureSandboxVault(root);

    expect(await readFile(note, "utf8")).toContain("# Welcome\r\n");
  });

  it("resets the working copy only when explicitly requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "graphite-sandbox-test-"));
    temporaryRoots.push(root);
    const vault = await ensureSandboxVault(root);
    const home = join(vault, "Home.md");

    await writeFile(home, "# Changed by the user\r\n");
    await ensureSandboxVault(root, true);

    expect(await readFile(home, "utf8")).toContain("# Graphite Sandbox\r\n");
  });
});
