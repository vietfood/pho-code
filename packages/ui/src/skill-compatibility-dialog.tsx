import { useEffect, useRef } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { handleDialogTab } from "./lib/dialog-focus";
import { Button } from "./ui/button";

export function SkillCompatibilityDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
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
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-testid="skill-compatibility-backdrop"
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
        aria-labelledby="skill-compatibility-heading"
        data-testid="skill-compatibility-dialog"
        className="grid w-[min(22rem,calc(100dvw-2rem))] gap-3 rounded-xl border border-border bg-background p-3 shadow-lg"
        onKeyDown={(event) => {
          if (dialogRef.current) {
            handleDialogTab(event.nativeEvent, dialogRef.current);
          }
        }}
      >
        <div className="flex items-start gap-2">
          <span
            className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning"
            aria-hidden="true"
          >
            <TriangleAlertIcon className="size-3.5" />
          </span>
          <div className="grid min-w-0 gap-1">
            <h2 id="skill-compatibility-heading" className="text-sm font-medium">
              {title}
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" data-testid="skill-compatibility-cancel" onClick={onCancel}>
            Cancel
          </Button>
          <Button ref={confirmRef} size="sm" data-testid="skill-compatibility-confirm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
