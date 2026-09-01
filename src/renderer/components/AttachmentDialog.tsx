import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLink, X } from "lucide-react";
import type { VaultEntryKind } from "../../shared/contracts";
import { bridge } from "../lib/bridge";
import { AttachmentPreview } from "./MarkdownPreview";
import { Button } from "./Button";

interface AttachmentDialogProps {
  open: boolean;
  vaultId: string;
  path: string;
  kind: VaultEntryKind;
  onOpenChange(open: boolean): void;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function AttachmentDialog({
  open,
  vaultId,
  path,
  kind,
  onOpenChange,
}: AttachmentDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay attachment-dialog-overlay" />
        <Dialog.Content className="attachment-dialog-content">
          <header className="attachment-dialog-header">
            <div>
              <Dialog.Title className="attachment-dialog-title">{fileName(path)}</Dialog.Title>
              <Dialog.Description className="attachment-dialog-description">
                {path}
              </Dialog.Description>
            </div>
            <div className="attachment-dialog-actions">
              <Button
                variant="ghost"
                onClick={() => void bridge.openAttachment(vaultId, path)}
                title="Open with the system application"
              >
                <ExternalLink size={14} /> Open externally
              </Button>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close attachment preview">
                  <X size={17} />
                </Button>
              </Dialog.Close>
            </div>
          </header>
          <div className="attachment-dialog-body">
            <AttachmentPreview vaultId={vaultId} path={path} kind={kind} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
