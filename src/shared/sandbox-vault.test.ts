import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createSandboxVaultFiles } from "./sandbox-vault";

const committedRoot = resolve(import.meta.dirname, "../../sandbox-vault");

async function committedPaths(directory = committedRoot): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await committedPaths(absolute)));
    else paths.push(relative(committedRoot, absolute).replaceAll("\\", "/"));
  }
  return paths;
}

describe("committed sandbox vault", () => {
  it("matches the built-in working-copy template byte for byte", async () => {
    const fixtures = createSandboxVaultFiles();
    expect((await committedPaths()).sort()).toEqual(fixtures.map((file) => file.path).sort());
    for (const fixture of fixtures) {
      expect(new Uint8Array(await readFile(join(committedRoot, fixture.path)))).toEqual(
        fixture.bytes,
      );
    }
  });

  it("contains the encoding fixtures promised by the sandbox", async () => {
    const crlf = new Uint8Array(await readFile(join(committedRoot, "Encoding/CRLF.md")));
    const bom = new Uint8Array(await readFile(join(committedRoot, "Encoding/BOM.md")));
    expect(new TextDecoder().decode(crlf)).toContain("\r\n");
    expect([...bom.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
