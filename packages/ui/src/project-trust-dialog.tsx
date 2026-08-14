import { useEffect, useRef } from "react";
import { ShieldIcon } from "lucide-react";
import { handleDialogTab } from "./lib/dialog-focus";
import { Button } from "./ui/button";

export function ProjectTrustDialog({
  workspaceName,
  workspacePath,
  sessionTrusted,
  busy,
  onConfirm,
  onCancel,
}: {
  workspaceName: string;
  workspacePath: string;
  sessionTrusted: boolean;
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
        event.stopPropagation();
        if (!busy) {
          onCancel();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      data-testid="project-trust-backdrop"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-trust-heading"
        data-testid="project-trust-dialog"
        className="grid w-[min(28rem,calc(100dvw-2rem))] gap-3 rounded-xl border border-border bg-background p-4 shadow-lg"
        onKeyDown={(event) => {
          if (dialogRef.current) {
            handleDialogTab(event.nativeEvent, dialogRef.current);
          }
        }}
      >
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning"
            aria-hidden="true"
          >
            <ShieldIcon className="size-4" />
          </span>
          <div className="grid min-w-0 gap-2">
            <h2 id="project-trust-heading" className="text-sm font-medium">
              Trust this project&apos;s permission rules?
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {sessionTrusted
                ? "This workspace has its own permission config. It applies for this session because you opened the folder here. Trust it in Pho Code so these rules load again next time."
                : "This project is not trusted. Until you trust it, project-scoped permission rules are skipped and only the global policy applies. Trusting loads those rules now and remembers this workspace in Pho Code."}{" "}
              This does not enable project extensions or change another Pi installation&apos;s trust store.
            </p>
            <p className="min-w-0">
              <strong className="block truncate text-xs font-medium">{workspaceName}</strong>
              <code
                className="mt-1 block overflow-x-auto rounded-md border border-border bg-muted/40 px-2 py-1.5 font-mono text-[11px] leading-snug text-foreground"
                data-testid="project-trust-path"
              >
                {workspacePath}
              </code>
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" data-testid="project-trust-cancel" disabled={busy} onClick={onCancel}>
            Not now
          </Button>
          <Button
            ref={confirmRef}
            size="sm"
            data-testid="project-trust-confirm"
            disabled={busy}
            onClick={onConfirm}
          >
            Trust this project
          </Button>
        </div>
      </section>
    </div>
  );
}
