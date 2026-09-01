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

function mp4TopLevelBoxes(bytes: Uint8Array): string[] {
  const boxes: string[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset);
    const type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
    boxes.push(type);
    if (size === 0) break;
    if (size < 8 || offset + size > bytes.length) throw new Error(`Invalid MP4 box: ${type}`);
    offset += size;
  }
  return boxes;
}

describe("committed sandbox vault", () => {
  it("matches the built-in working-copy template byte for byte", async () => {
    const fixtures = createSandboxVaultFiles();
    expect((await committedPaths()).sort()).toEqual(fixtures.map((file) => file.path).sort());
    for (const fixture of fixtures) {
      expect(Buffer.compare(await readFile(join(committedRoot, fixture.path)), fixture.bytes)).toBe(
        0,
      );
    }
  });

  it("contains the encoding fixtures promised by the sandbox", async () => {
    const crlf = new Uint8Array(await readFile(join(committedRoot, "Encoding/CRLF.md")));
    const bom = new Uint8Array(await readFile(join(committedRoot, "Encoding/BOM.md")));
    expect(new TextDecoder().decode(crlf)).toContain("\r\n");
    expect([...bom.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("keeps archival media small enough for ordinary Git", () => {
    const archivalMedia = createSandboxVaultFiles().filter((file) =>
      [
        "Attachments/le-agreable.jpg",
        "Attachments/12th-street-rag.mp3",
        "Attachments/market-street-1906.mp4",
        "Attachments/beyond-earth-excerpt.pdf",
      ].includes(file.path),
    );

    expect(archivalMedia).toHaveLength(4);
    expect(archivalMedia.every((file) => file.bytes.length < 1_000_000)).toBe(true);
    expect(archivalMedia.reduce((total, file) => total + file.bytes.length, 0)).toBeLessThan(
      3_000_000,
    );
  });

  it("contains genuine JPEG, MP3, MP4, and PDF fixtures", () => {
    const media = new Map(createSandboxVaultFiles().map((file) => [file.path, file.bytes]));
    const jpeg = media.get("Attachments/le-agreable.jpg");
    const mp3 = media.get("Attachments/12th-street-rag.mp3");
    const mp4 = media.get("Attachments/market-street-1906.mp4");
    const pdf = media.get("Attachments/beyond-earth-excerpt.pdf");
    if (!jpeg || !mp3 || !mp4 || !pdf) {
      throw new Error("Expected all archival sandbox media fixtures.");
    }

    expect([...jpeg.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(new TextDecoder().decode(mp3.slice(0, 3))).toBe("ID3");
    expect(new TextDecoder().decode(mp4.slice(4, 8))).toBe("ftyp");
    const mp4Boxes = mp4TopLevelBoxes(mp4);
    expect(mp4Boxes).toContain("moov");
    expect(mp4Boxes).toContain("mdat");
    expect(mp4Boxes.indexOf("moov")).toBeLessThan(mp4Boxes.indexOf("mdat"));
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });
});
