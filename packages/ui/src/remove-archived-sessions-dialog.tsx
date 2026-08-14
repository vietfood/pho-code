import { useEffect, useRef } from "react";
import type { PrepareRemoveArchivedSessionsResult } from "@pho-code/protocol";
import { archivedRemovalWarning } from "./lib/archived-removal";
import { handleDialogTab } from "./lib/dialog-focus";
import { Button } from "./ui/button";

export function RemoveArchivedSessionsDialog({
  pending,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: PrepareRemoveArchivedSessionsResult;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onCancel, pending.confirmationToken]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
      data-testid="remove-archived-sessions-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-archived-sessions-heading"
        data-testid="remove-archived-sessions-dialog"
        className="grid w-[min(26rem,calc(100dvw-2rem))] gap-3 rounded-xl border border-border bg-background p-4 shadow-lg"
        onKeyDown={(event) => {
          if (dialogRef.current) {
            handleDialogTab(event.nativeEvent, dialogRef.current);
          }
        }}
      >
        <h2 id="remove-archived-sessions-heading" className="text-sm font-medium">
          Delete all archived chats?
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{archivedRemovalWarning(pending)}</p>
        {pending.sharedAgentDir ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            This app is using a shared Pi data directory, so another Pi process may also observe the removal.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            data-testid="remove-archived-sessions-cancel"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            size="sm"
            variant="destructive"
            data-testid="remove-archived-sessions-confirm"
            disabled={busy}
            onClick={onConfirm}
          >
            Move to Trash
          </Button>
        </div>
      </section>
    </div>
  );
}
