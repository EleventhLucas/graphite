import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, normalizeAppPreferences } from "./contracts";

describe("normalizeAppPreferences", () => {
  it("uses the current defaults for an empty preference store", () => {
    expect(normalizeAppPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("migrates the previous dual-pane visibility settings", () => {
    expect(normalizeAppPreferences({ editorVisible: false, previewVisible: true })).toMatchObject({
      primaryView: "preview",
      sidePreviewVisible: false,
    });
    expect(normalizeAppPreferences({ editorVisible: true, previewVisible: true })).toMatchObject({
      primaryView: "source",
      sidePreviewVisible: true,
    });
  });

  it("preserves independent current mode and side-preview settings", () => {
    expect(
      normalizeAppPreferences({
        primaryView: "wysiwyg",
        sidePreviewVisible: false,
        editorVisible: false,
        previewVisible: true,
      }),
    ).toMatchObject({ primaryView: "wysiwyg", sidePreviewVisible: false });
  });

  it("migrates the former system theme to a deterministic light theme", () => {
    expect(normalizeAppPreferences({ theme: "system" }).theme).toBe("light");
    expect(normalizeAppPreferences({ theme: "dark" }).theme).toBe("dark");
  });

  it("clamps persisted pane dimensions", () => {
    expect(normalizeAppPreferences({ sidebarWidth: 10, editorRatio: 4 })).toMatchObject({
      sidebarWidth: 180,
      editorRatio: 0.8,
    });
  });
});
