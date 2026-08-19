import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import type { ModelSummary } from "@pho-code/protocol";
import { handleDialogTab } from "./lib/dialog-focus";

export function modelLabel(model: ModelSummary): string {
  return model.name || `${model.provider}/${model.id}`;
}

export function ModelDialogShell({
  testId,
  busy,
  onCancel,
  focusKey,
  confirmRef,
  children,
}: {
  testId: string;
  busy: boolean;
  onCancel: () => void;
  focusKey: string;
  confirmRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy) {
          onCancel();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [busy, onCancel, confirmRef, focusKey]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
      data-testid={`${testId}-backdrop`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
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
        className="grid w-[min(30rem,calc(100dvw-2rem))] gap-3 rounded-xl border border-border bg-background p-4 shadow-lg"
        onKeyDown={(event) => {
          if (dialogRef.current) {
            handleDialogTab(event.nativeEvent, dialogRef.current);
          }
        }}
      >
        {children}
      </section>
    </div>
  );
}
