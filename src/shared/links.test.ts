import { describe, expect, it } from "vitest";
import { resolveVaultLink, rewriteLinksForMove } from "./links";

const paths = ["Notes/Home.md", "Projects/Home.md", "Notes/Target.md", "Assets/image.png"];

describe("Obsidian links", () => {
  it("prefers a note beside the source and reports ambiguous basenames", () => {
    expect(resolveVaultLink("Notes/Today.md", "Home", paths)).toMatchObject({
      status: "resolved",
      path: "Notes/Home.md",
    });
    expect(resolveVaultLink("Root.md", "Home", paths)).toMatchObject({ status: "ambiguous" });
  });

  it("proposes missing notes beside their source", () => {
    expect(resolveVaultLink("Journal/Today.md", "Tomorrow", paths)).toEqual({
      status: "missing",
      proposedPath: "Journal/Tomorrow.md",
    });
  });

  it("rewrites wikilinks and relative Markdown links after a move", () => {
    const source = "See [[Target|the target]] and [target](./Target.md).";
    const rewritten = rewriteLinksForMove(
      source,
      "Notes/Home.md",
      "Notes/Home.md",
      paths,
      "Notes/Target.md",
      "Archive/Renamed.md",
    );
    expect(rewritten).toContain("[[Renamed|the target]]");
    expect(rewritten).toContain("[target](../Archive/Renamed.md)");
  });
});
