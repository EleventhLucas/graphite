import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChevronDown,
  ChevronRight,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { VaultTreeNode } from "../../shared/contracts";
import { cn } from "../lib/cn";
import { Button } from "./Button";

interface VaultTreeProps {
  nodes: VaultTreeNode[];
  activePath?: string;
  canTrash: boolean;
  trashLabel?: string;
  onOpen(node: VaultTreeNode): void;
  onCreateNote(folder: string): void;
  onCreateFolder(folder: string): void;
  onRename(node: VaultTreeNode): void;
  onMove(node: VaultTreeNode, destination: string): void;
  onTrash(node: VaultTreeNode): void;
}

function EntryIcon({ node, open }: { node: VaultTreeNode; open?: boolean }) {
  if (node.kind === "folder")
    return open ? (
      <FolderOpen size={15} strokeWidth={1.5} />
    ) : (
      <Folder size={15} strokeWidth={1.5} />
    );
  if (node.kind === "image" || node.kind === "pdf")
    return <FileImage size={15} strokeWidth={1.5} />;
  if (node.kind === "audio") return <FileAudio size={15} strokeWidth={1.5} />;
  if (node.kind === "video") return <FileVideo size={15} strokeWidth={1.5} />;
  return <FileText size={15} strokeWidth={1.5} />;
}

function TreeNode({
  node,
  depth,
  ...props
}: { node: VaultTreeNode; depth: number } & Omit<VaultTreeProps, "nodes">) {
  const [open, setOpen] = useState(depth < 1);
  const isFolder = node.kind === "folder";
  const activate = () => {
    if (isFolder) setOpen((value) => !value);
    else props.onOpen(node);
  };
  return (
    <li>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Drag-and-drop supplements the focusable label and actions menu. */}
      <div
        className={cn("tree-row group", props.activePath === node.path && "tree-row-active")}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        draggable
        onDragStart={(event) =>
          event.dataTransfer.setData("application/x-graphite-path", node.path)
        }
        onDragOver={(event) => {
          if (isFolder) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!isFolder) return;
          event.preventDefault();
          const source = event.dataTransfer.getData("application/x-graphite-path");
          if (source && source !== node.path && !node.path.startsWith(`${source}/`)) {
            props.onMove({ path: source } as VaultTreeNode, node.path);
          }
        }}
      >
        <button type="button" className="tree-label" onClick={activate} title={node.path}>
          {isFolder ? (
            open ? (
              <ChevronDown size={13} strokeWidth={1.5} />
            ) : (
              <ChevronRight size={13} strokeWidth={1.5} />
            )
          ) : (
            <span className="tree-icon-spacer" />
          )}
          <EntryIcon node={node} open={open} />
          <span className="tree-name">{node.name}</span>
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="tree-more"
              aria-label={`Actions for ${node.name}`}
            >
              <MoreHorizontal size={14} />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu-content" sideOffset={4} align="start">
              {isFolder && (
                <>
                  <DropdownMenu.Item
                    className="menu-item"
                    onSelect={() => props.onCreateNote(node.path)}
                  >
                    <Plus size={14} /> New note
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="menu-item"
                    onSelect={() => props.onCreateFolder(node.path)}
                  >
                    <Folder size={14} /> New folder
                  </DropdownMenu.Item>
                </>
              )}
              <DropdownMenu.Item className="menu-item" onSelect={() => props.onRename(node)}>
                Rename
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="menu-item"
                onSelect={() => {
                  const destination = window.prompt(
                    "Move to folder (vault-relative, blank for root):",
                    "",
                  );
                  if (destination !== null) props.onMove(node, destination);
                }}
              >
                Move…
              </DropdownMenu.Item>
              {props.canTrash && (
                <>
                  <DropdownMenu.Separator className="menu-separator" />
                  <DropdownMenu.Item
                    className="menu-item text-red-600"
                    onSelect={() => props.onTrash(node)}
                  >
                    <Trash2 size={14} /> {props.trashLabel ?? "Move to trash"}
                  </DropdownMenu.Item>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {isFolder && open && node.children && (
        <ul>
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} {...props} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function VaultTree({ nodes, ...props }: VaultTreeProps) {
  return (
    <ul className="vault-tree" aria-label="Vault files">
      {nodes.map((node) => (
        <TreeNode key={node.path} node={node} depth={0} {...props} />
      ))}
    </ul>
  );
}
