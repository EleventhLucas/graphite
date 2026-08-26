// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickOpen } from "./QuickOpen";

describe("QuickOpen", () => {
  it("filters notes by path and selects the first match", () => {
    const select = vi.fn();
    render(
      <QuickOpen
        open
        onOpenChange={() => undefined}
        onSelect={select}
        tree={[
          {
            name: "Project.md",
            path: "Work/Project.md",
            kind: "markdown",
            modifiedAt: 0,
            size: 0,
          },
        ]}
      />,
    );
    const input = screen.getByLabelText("Find a note");
    fireEvent.change(input, { target: { value: "project" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(select).toHaveBeenCalledWith("Work/Project.md");
  });
});
