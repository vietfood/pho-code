import { useRef } from "react";
import type { ContextUsageSummary, ModelSummary } from "@pho-code/protocol";
import { formatRatePerMillion, formatTokenCount } from "./lib/format-tokens";
import { ModelDialogShell, modelLabel } from "./model-dialog-shell";
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
  const confirmRef = useRef<HTMLButtonElement>(null);
  const nextLabel = modelLabel(model);
  const currentLabel = currentModel ? modelLabel(currentModel) : null;
  const contextTokens = contextUsage?.tokens;
  const sameProvider = Boolean(currentModel && currentModel.provider === model.provider);
  const windowChanged = Boolean(currentModel && currentModel.contextWindow !== model.contextWindow);
  const windowNote =
    windowChanged && currentModel
      ? ` (${formatTokenCount(currentModel.contextWindow)} → ${formatTokenCount(model.contextWindow)} context window)`
      : "";

  return (
    <ModelDialogShell
      testId="change-model"
      busy={busy}
      onCancel={onCancel}
      focusKey={`${model.provider}:${model.id}`}
      confirmRef={confirmRef}
    >
      <h2 id="change-model-heading" className="text-sm font-medium">
        Change model in this chat?
      </h2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {currentLabel ? (
          <>
            Switch from <span className="text-foreground">{currentLabel}</span> to{" "}
          </>
        ) : (
          <>
            Switch to <span className="text-foreground">{nextLabel}</span>.
          </>
        )}
      </p>
      <ul
        className="grid list-disc gap-1.5 pl-4 text-xs leading-relaxed text-muted-foreground"
        data-testid="change-model-details"
      >
        <li>
          Provider prompt-cache entries are keyed to the previous model. The next turn will miss cache reads
          {sameProvider ? " for this conversation prefix" : " (and may miss them across providers)"};
        </li>
        <li>
          {typeof contextTokens === "number" && contextTokens > 0 ? (
            <>
              Current projected context is ~{formatTokenCount(contextTokens)}
              {contextUsage?.contextWindow ? ` / ${formatTokenCount(contextUsage.contextWindow)}` : ""}. That
              history is resent under {nextLabel}
              {windowNote}.
            </>
          ) : (
            <>
              Existing turns are resent as ordinary context under {nextLabel}
              {windowNote}; no compaction or fork happens automatically.
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
      </ul>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" data-testid="change-model-cancel" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button ref={confirmRef} size="sm" data-testid="change-model-confirm" disabled={busy} onClick={onConfirm}>
          Switch model
        </Button>
      </div>
    </ModelDialogShell>
  );
}
