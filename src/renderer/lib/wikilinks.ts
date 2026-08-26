import type { Link, Parent, Root, Text } from "mdast";
import { visit } from "unist-util-visit";

const WIKILINK = /(!?)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function remarkWikilinks() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (index === undefined || !parent || parent.type === "link" || parent.type === "image")
        return;
      const value = node.value;
      WIKILINK.lastIndex = 0;
      let match = WIKILINK.exec(value);
      if (!match) return;
      const nodes: Array<Text | Link | { type: "image"; url: string; alt: string; title: null }> =
        [];
      let cursor = 0;
      while (match) {
        if (match.index > cursor)
          nodes.push({ type: "text", value: value.slice(cursor, match.index) });
        const embed = match[1] === "!";
        const target = match[2].trim();
        const label = (match[3] || target).trim();
        if (embed) {
          nodes.push({
            type: "image",
            url: `graphite-embed:${encodeURIComponent(target)}`,
            alt: label,
            title: null,
          });
        } else {
          nodes.push({
            type: "link",
            url: `graphite-wiki:${encodeURIComponent(target)}`,
            title: null,
            children: [{ type: "text", value: label }],
          });
        }
        cursor = match.index + match[0].length;
        match = WIKILINK.exec(value);
      }
      if (cursor < value.length) nodes.push({ type: "text", value: value.slice(cursor) });
      parent.children.splice(index, 1, ...(nodes as Parent["children"]));
      return index + nodes.length;
    });
  };
}
