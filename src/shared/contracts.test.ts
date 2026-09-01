import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, normalizeAppPreferences } from "./contracts";

describe("normalizeAppPreferences", () => {
  it("uses the current defaults for an empty preference store", () => {
    expect(normalizeAppPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("migrates the previous dual-pane visibility settings", () => {
    expect(normalizeAppPreferences({ editorVisible: false, previewVisible: true })).toMatchObject({
      primaryView: "preview",
    });
    expect(normalizeAppPreferences({ editorVisible: true, previewVisible: true })).toMatchObject({
      primaryView: "source",
    });
  });

  it("preserves the current primary mode over legacy pane settings", () => {
    expect(
      normalizeAppPreferences({
        primaryView: "wysiwyg",
        editorVisible: false,
        previewVisible: true,
      }),
    ).toMatchObject({ primaryView: "wysiwyg" });
  });

  it("migrates the former system theme to a deterministic light theme", () => {
    expect(normalizeAppPreferences({ theme: "system" }).theme).toBe("light");
    expect(normalizeAppPreferences({ theme: "dark" }).theme).toBe("dark");
  });

  it("preserves valid color themes and replaces unknown themes", () => {
    expect(normalizeAppPreferences({ colorTheme: "solarized" }).colorTheme).toBe("solarized");
    expect(normalizeAppPreferences({ colorTheme: "uninstalled-theme" as never }).colorTheme).toBe(
      "default",
    );
  });

  it("clamps the persisted sidebar width", () => {
    expect(normalizeAppPreferences({ sidebarWidth: 10 })).toMatchObject({
      sidebarWidth: 180,
    });
  });
});
