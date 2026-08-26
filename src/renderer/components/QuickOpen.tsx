import * as Dialog from "@radix-ui/react-dialog";
import Fuse from "fuse.js";
import { FileText, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { VaultTreeNode } from "../../shared/contracts";
import { Button } from "./Button";

function markdownNodes(nodes: VaultTreeNode[]): VaultTreeNode[] {
  return nodes.flatMap((node) =>
    node.kind === "folder"
      ? markdownNodes(node.children ?? [])
      : node.kind === "markdown"
        ? [node]
        : [],
  );
}

export function QuickOpen({
  open,
  onOpenChange,
  tree,
  onSelect,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  tree: VaultTreeNode[];
  onSelect(path: string): void;
}) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const files = useMemo(() => markdownNodes(tree), [tree]);
  const fuse = useMemo(() => new Fuse(files, { keys: ["name", "path"], threshold: 0.42 }), [files]);
  const results = query
    ? fuse
        .search(query)
        .slice(0, 12)
        .map((result) => result.item)
    : files.slice(0, 12);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const choose = (path: string) => {
    onSelect(path);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="quick-open-content" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Quick open</Dialog.Title>
          <div className="quick-search">
            <Search size={17} />
            <input
              ref={input}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && results[0]) choose(results[0].path);
              }}
              placeholder="Find a note by name or path…"
              aria-label="Find a note"
            />
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close quick open">
                <X size={15} />
              </Button>
            </Dialog.Close>
          </div>
          <div className="quick-results">
            {results.map((file) => (
              <button type="button" key={file.path} onClick={() => choose(file.path)}>
                <FileText size={15} />
                <span>
                  <strong>{file.name}</strong>
                  <small>{file.path}</small>
                </span>
              </button>
            ))}
            {results.length === 0 && <p>No matching notes.</p>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
