import { useEffect, useRef } from "react";
import type { ContextUsageSummary, ModelSummary } from "@pho-code/protocol";
import { handleDialogTab } from "./lib/dialog-focus";
import { formatRatePerMillion, formatTokenCount } from "./lib/format-tokens";
import { Button } from "./ui/button";

export function ChangeModelDialog({
  model,
  currentModel,
  contextUsage,
  busy = false,
  onConfirm,
  onCancel,
}: {
  model: ModelSummary;
  currentModel?: ModelSummary;
  contextUsage?: ContextUsageSummary;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const nextLabel = modelLabel(model);
  const currentLabel = currentModel ? modelLabel(currentModel) : null;
  const contextTokens = contextUsage?.tokens;
  const sameProvider = Boolean(currentModel && currentModel.provider === model.provider);
  const windowChanged = Boolean(currentModel && currentModel.contextWindow !== model.contextWindow);

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
  }, [busy, onCancel, model.provider, model.id]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
      data-testid="change-model-backdrop"
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
        aria-labelledby="change-model-heading"
        data-testid="change-model-dialog"
        className="grid w-[min(30rem,calc(100dvw-2rem))] gap-3 rounded-xl border border-border bg-background p-4 shadow-lg"
        onKeyDown={(event) => {
          if (dialogRef.current) {
            handleDialogTab(event.nativeEvent, dialogRef.current);
          }
        }}
      >
        <h2 id="change-model-heading" className="text-sm font-medium">
          Change model in this chat?
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {currentLabel ? (
            <>
              Switch from <span className="text-foreground">{currentLabel}</span> to{" "}
              <span className="text-foreground">{nextLabel}</span>. The Pi JSONL transcript stays as-is; only the
              live session model binding changes.
            </>
          ) : (
            <>
              Switch to <span className="text-foreground">{nextLabel}</span>. The Pi JSONL transcript stays as-is;
              only the live session model binding changes.
            </>
          )}
        </p>
        <ul
          className="grid list-disc gap-1.5 pl-4 text-xs leading-relaxed text-muted-foreground"
          data-testid="change-model-details"
        >
          <li>
            Provider prompt-cache entries are keyed to the previous model. The next turn will miss cache reads
            {sameProvider ? " for this conversation prefix" : " (and may miss them across providers)"}; expect a
            cold prefix with full input pricing and a fresh cache write if the new model supports caching.
          </li>
          <li>
            {typeof contextTokens === "number" && contextTokens > 0 ? (
              <>
                Current projected context is ~{formatTokenCount(contextTokens)}
                {contextUsage?.contextWindow
                  ? ` / ${formatTokenCount(contextUsage.contextWindow)}`
                  : ""}
                . That history is resent under {nextLabel}
                {windowChanged && currentModel
                  ? ` (${formatTokenCount(currentModel.contextWindow)} → ${formatTokenCount(model.contextWindow)} context window)`
                  : ""}
                .
              </>
            ) : (
              <>
                Existing turns are resent as ordinary context under {nextLabel}
                {windowChanged && currentModel
                  ? ` (${formatTokenCount(currentModel.contextWindow)} → ${formatTokenCount(model.contextWindow)} context window)`
                  : ""}
                ; no compaction or fork happens automatically.
              </>
            )}
          </li>
          <li>
            Rate card changes to {formatRatePerMillion(model.cost.input)}/{formatRatePerMillion(model.cost.output)}
            in/out per 1M
            {model.cost.cacheRead > 0 || model.cost.cacheWrite > 0
              ? ` (cache R ${formatRatePerMillion(model.cost.cacheRead)} / W ${formatRatePerMillion(model.cost.cacheWrite)})`
              : ""}
            . Session usage totals keep counting; they do not reset.
          </li>
          <li>
            Tool results, thinking traces, and image attachments already in the transcript remain. Capability
            differences (for example image input) only affect the next turn.
          </li>
        </ul>
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            data-testid="change-model-cancel"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            size="sm"
            data-testid="change-model-confirm"
            disabled={busy}
            onClick={onConfirm}
          >
            Switch model
          </Button>
        </div>
      </section>
    </div>
  );
}

function modelLabel(model: ModelSummary): string {
  return model.name || `${model.provider}/${model.id}`;
}
