import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";

export function ConflictDialog({
  open,
  deleted,
  onReload,
  onOverwrite,
  onSaveCopy,
  onClose,
}: {
  open: boolean;
  deleted: boolean;
  onReload(): void;
  onOverwrite(): void;
  onSaveCopy(): void;
  onClose(): void;
}) {
  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <Dialog.Title className="dialog-title">
            <AlertTriangle size={19} />{" "}
            {deleted ? "Note removed outside Graphite" : "External edit conflict"}
          </Dialog.Title>
          <Dialog.Description className="dialog-description">
            {deleted
              ? "The active note no longer exists on disk. Your editor contents are still safe in memory."
              : "The note changed on disk while Graphite had local edits. Choose which version to keep."}
          </Dialog.Description>
          <div className="dialog-actions">
            {!deleted && <Button onClick={onReload}>Reload disk version</Button>}
            <Button onClick={onOverwrite}>
              {deleted ? "Restore note" : "Overwrite with mine"}
            </Button>
            <Button onClick={onSaveCopy}>Save a copy</Button>
            {deleted && (
              <Button variant="ghost" onClick={onClose}>
                Close note
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
