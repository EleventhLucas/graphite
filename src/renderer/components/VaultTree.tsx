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

interface DragState {
  sourcePath: string | null;
  destination: string | null | undefined;
  setSourcePath(path: string | null): void;
  setDestination(path: string | null | undefined): void;
}

function parentFolder(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator === -1 ? "" : path.slice(0, separator);
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
  drag,
  ...props
}: { node: VaultTreeNode; depth: number; drag: DragState } & Omit<VaultTreeProps, "nodes">) {
  const [open, setOpen] = useState(depth < 1);
  const isFolder = node.kind === "folder";
  const validDestination =
    isFolder &&
    Boolean(drag.sourcePath) &&
    drag.sourcePath !== node.path &&
    !node.path.startsWith(`${drag.sourcePath}/`) &&
    parentFolder(drag.sourcePath ?? "") !== node.path;
  const activate = () => {
    if (isFolder) setOpen((value) => !value);
    else props.onOpen(node);
  };
  return (
    <li>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Drag-and-drop supplements the focusable label and actions menu. */}
      <div
        className={cn(
          "tree-row group",
          props.activePath === node.path && "tree-row-active",
          drag.sourcePath === node.path && "tree-row-dragging",
          validDestination && drag.destination === node.path && "tree-row-drop-target",
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/x-graphite-path", node.path);
          drag.setSourcePath(node.path);
        }}
        onDragEnd={() => {
          drag.setSourcePath(null);
          drag.setDestination(undefined);
        }}
        onDragOver={(event) => {
          if (!validDestination) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          drag.setDestination(node.path);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          if (drag.destination === node.path) drag.setDestination(undefined);
        }}
        onDrop={(event) => {
          if (!validDestination) return;
          event.preventDefault();
          event.stopPropagation();
          const source = event.dataTransfer.getData("application/x-graphite-path");
          drag.setSourcePath(null);
          drag.setDestination(undefined);
          if (source) {
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
            <TreeNode key={child.path} node={child} depth={depth + 1} drag={drag} {...props} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function VaultTree({ nodes, ...props }: VaultTreeProps) {
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null | undefined>(undefined);
  const drag: DragState = { sourcePath, destination, setSourcePath, setDestination };
  const rootIsValid = Boolean(sourcePath) && parentFolder(sourcePath ?? "") !== "";
  return (
    <ul
      className={cn("vault-tree", rootIsValid && destination === "" && "vault-tree-drop-target")}
      aria-label="Vault files"
      onDragOver={(event) => {
        if (!rootIsValid || event.target !== event.currentTarget) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDestination("");
      }}
      onDragLeave={(event) => {
        if (event.target === event.currentTarget && destination === "") setDestination(undefined);
      }}
      onDrop={(event) => {
        if (!rootIsValid || event.target !== event.currentTarget) return;
        event.preventDefault();
        const source = event.dataTransfer.getData("application/x-graphite-path");
        setSourcePath(null);
        setDestination(undefined);
        if (source) props.onMove({ path: source } as VaultTreeNode, "");
      }}
    >
      {nodes.map((node) => (
        <TreeNode key={node.path} node={node} depth={0} drag={drag} {...props} />
      ))}
    </ul>
  );
}
