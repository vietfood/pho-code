import { useEffect, useRef } from "react";
import type { PrepareRemoveProjectResult } from "@pho-code/protocol";
import { handleDialogTab } from "./lib/dialog-focus";
import { projectRemovalWarning } from "./lib/project-removal";
import { Button } from "./ui/button";

export function RemoveProjectDialog({
  pending,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: PrepareRemoveProjectResult;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
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
      data-testid="remove-project-backdrop"
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
        aria-labelledby="remove-project-heading"
        data-testid="remove-project-dialog"
        className="grid w-[min(26rem,calc(100dvw-2rem))] gap-3 rounded-xl border border-border bg-background p-4 shadow-lg"
        onKeyDown={(event) => {
          if (dialogRef.current) {
            handleDialogTab(event.nativeEvent, dialogRef.current);
          }
        }}
      >
        <h2 id="remove-project-heading" className="text-sm font-medium">
          Remove project?
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{projectRemovalWarning(pending)}</p>
        {pending.sharedAgentDir ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            This app is using a shared Pi data directory, so another Pi process may also observe the removal.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            ref={cancelRef}
            size="sm"
            variant="outline"
            data-testid="remove-project-cancel"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            data-testid="remove-project-confirm"
            disabled={busy}
            onClick={onConfirm}
          >
            Remove project
          </Button>
        </div>
      </section>
    </div>
  );
}
