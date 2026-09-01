// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { VaultTreeNode } from "../../shared/contracts";
import { VaultTree } from "./VaultTree";

function node(
  path: string,
  kind: VaultTreeNode["kind"],
  children?: VaultTreeNode[],
): VaultTreeNode {
  return {
    path,
    name: path.slice(path.lastIndexOf("/") + 1),
    kind,
    children,
    modifiedAt: 0,
    size: 0,
  };
}

function dataTransfer() {
  const values = new Map<string, string>();
  return {
    dropEffect: "none",
    effectAllowed: "none",
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? "",
  } as unknown as DataTransfer;
}

const handlers = {
  onOpen: vi.fn(),
  onCreateNote: vi.fn(),
  onCreateFolder: vi.fn(),
  onRename: vi.fn(),
  onMove: vi.fn(),
  onTrash: vi.fn(),
};

describe("VaultTree", () => {
  it("shows the dragged entry and valid destination before moving", () => {
    const transfer = dataTransfer();
    const onMove = vi.fn();
    render(
      <VaultTree
        nodes={[
          node("Notes", "folder", [node("Notes/Entry.md", "markdown")]),
          node("Archive", "folder"),
        ]}
        canTrash
        {...handlers}
        onMove={onMove}
      />,
    );

    const source = screen.getByRole("button", { name: "Entry.md" }).closest(".tree-row");
    const destination = screen.getByRole("button", { name: "Archive" }).closest(".tree-row");
    expect(source).not.toBeNull();
    expect(destination).not.toBeNull();

    fireEvent.dragStart(source as Element, { dataTransfer: transfer });
    expect(source).toHaveClass("tree-row-dragging");

    fireEvent.dragOver(destination as Element, { dataTransfer: transfer });
    expect(destination).toHaveClass("tree-row-drop-target");

    fireEvent.drop(destination as Element, { dataTransfer: transfer });
    expect(onMove).toHaveBeenCalledWith(
      expect.objectContaining({ path: "Notes/Entry.md" }),
      "Archive",
    );
  });

  it("does not expose the removed Move action", () => {
    render(<VaultTree nodes={[node("Entry.md", "markdown")]} canTrash {...handlers} />);
    expect(screen.queryByText(/^Move/)).not.toBeInTheDocument();
  });
});
