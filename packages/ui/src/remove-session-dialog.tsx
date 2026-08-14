import { useEffect, useRef } from "react";
import type { PrepareRemoveSessionResult } from "@pho-code/protocol";
import { handleDialogTab } from "./lib/dialog-focus";
import { Button } from "./ui/button";

export function RemoveSessionDialog({
  pending,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: PrepareRemoveSessionResult;
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
      data-testid="remove-session-backdrop"
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
        aria-labelledby="remove-session-heading"
        data-testid="remove-session-dialog"
        className="grid w-[min(26rem,calc(100dvw-2rem))] gap-3 rounded-xl border border-border bg-background p-4 shadow-lg"
        onKeyDown={(event) => {
          if (dialogRef.current) {
            handleDialogTab(event.nativeEvent, dialogRef.current);
          }
        }}
      >
        <h2 id="remove-session-heading" className="text-sm font-medium">
          Move chat to Trash?
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          “{pending.title}” in {pending.workspaceDisplayName} will leave Pho Code and move to the operating-system
          Trash. Restore it from Finder or the desktop Trash, not from Archive.
        </p>
        {pending.sharedAgentDir ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            This app is using a shared Pi data directory, so another Pi process may also observe the removal.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" data-testid="remove-session-cancel" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            size="sm"
            variant="destructive"
            data-testid="remove-session-confirm"
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
