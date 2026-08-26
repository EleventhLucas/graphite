import { describe, expect, it } from "vitest";
import { entryKindForPath, isHiddenPath, normalizeVaultPath, validateEntryName } from "./paths";

describe("vault paths", () => {
  it("normalizes separators and rejects traversal", () => {
    expect(normalizeVaultPath("Notes\\Today.md")).toBe("Notes/Today.md");
    expect(() => normalizeVaultPath("../outside.md")).toThrow(/inside/);
    expect(() => normalizeVaultPath("C:\\outside.md")).toThrow(/inside/);
  });

  it("detects hidden path segments", () => {
    expect(isHiddenPath(".obsidian/app.json")).toBe(true);
    expect(isHiddenPath("Notes/.archive/old.md")).toBe(true);
    expect(isHiddenPath("Notes/Visible.md")).toBe(false);
  });

  it("validates names for every target platform", () => {
    expect(validateEntryName("Project notes.md")).toBe("Project notes.md");
    expect(() => validateEntryName("CON")).toThrow(/portable/);
    expect(() => validateEntryName("bad:name.md")).toThrow(/portable/);
    expect(() => validateEntryName(".hidden")).toThrow(/Hidden/);
  });

  it("classifies supported attachments", () => {
    expect(entryKindForPath("note.md")).toBe("markdown");
    expect(entryKindForPath("photo.webp")).toBe("image");
    expect(entryKindForPath("clip.webm")).toBe("video");
    expect(entryKindForPath("document.pdf")).toBe("pdf");
    expect(entryKindForPath("settings.json")).toBeNull();
  });
});
