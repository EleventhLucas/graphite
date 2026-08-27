import { describe, expect, it } from "vitest";
import { calculateSplitRatio } from "./panes";

describe("calculateSplitRatio", () => {
  it("keeps the grabbed point beneath the pointer", () => {
    expect(calculateSplitRatio(552, 50, 1_004, 4, 2)).toBe(0.5);
  });

  it("clamps either pane to twenty percent", () => {
    expect(calculateSplitRatio(50, 50, 1_004, 4, 2)).toBe(0.2);
    expect(calculateSplitRatio(1_054, 50, 1_004, 4, 2)).toBe(0.8);
  });

  it("falls back safely when no resizable width is available", () => {
    expect(calculateSplitRatio(10, 0, 4, 4, 2)).toBe(0.5);
  });
});
