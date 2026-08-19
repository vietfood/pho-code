import { useEffect, useRef, type ReactNode } from "react";
import { handleDialogTab } from "./lib/dialog-focus";
import { Button } from "./ui/button";

export function ConfirmRemovalDialog({
  pending,
  busy,
  onConfirm,
  onCancel,
  testId,
  heading,
  body,
  confirmLabel,
  focus = "confirm",
}: {
  pending: { confirmationToken: string; sharedAgentDir: boolean };
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testId: string;
  heading: string;
  body: ReactNode;
  confirmLabel: string;
  focus?: "confirm" | "cancel";
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (focus === "cancel" ? cancelRef : confirmRef).current?.focus();
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
  }, [focus, onCancel, pending.confirmationToken]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
      data-testid={`${testId}-backdrop`}
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
        aria-labelledby={`${testId}-heading`}
        data-testid={`${testId}-dialog`}
        className="grid w-[min(26rem,calc(100dvw-2rem))] gap-3 rounded-xl border border-border bg-background p-4 shadow-lg"
        onKeyDown={(event) => {
          if (dialogRef.current) {
            handleDialogTab(event.nativeEvent, dialogRef.current);
          }
        }}
      >
        <h2 id={`${testId}-heading`} className="text-sm font-medium">
          {heading}
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
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
            data-testid={`${testId}-cancel`}
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            size="sm"
            variant="destructive"
            data-testid={`${testId}-confirm`}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
