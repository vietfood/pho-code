import { useRef } from "react";
import type { ContextUsageSummary, ModelSummary } from "@pho-code/protocol";
import { formatRatePerMillion, formatTokenCount } from "./lib/format-tokens";
import { ModelDialogShell, modelLabel } from "./model-dialog-shell";
import { ProviderIcon } from "./provider-icon";
import { Button } from "./ui/button";

export function CursorModelWarningDialog({
  model,
  currentModel,
  contextUsage,
  midChat = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  model: ModelSummary;
  currentModel?: ModelSummary;
  contextUsage?: ContextUsageSummary;
  midChat?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const nextLabel = modelLabel(model);
  const currentLabel = currentModel ? modelLabel(currentModel) : null;
  const contextTokens = contextUsage?.tokens;

  return (
    <ModelDialogShell
      testId="cursor-model-warning"
      busy={busy}
      onCancel={onCancel}
      focusKey={`${model.provider}:${model.id}`}
      confirmRef={confirmRef}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning"
          aria-hidden="true"
        >
          <ProviderIcon provider="cursor" className="size-4 text-warning" />
        </span>
        <div className="grid min-w-0 gap-2">
          <h2 id="cursor-model-warning-heading" className="text-sm font-medium">
            Use a Cursor model in this chat?
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {currentLabel ? (
              <>
                Switch from <span className="text-foreground">{currentLabel}</span> to{" "}
                <span className="text-foreground">{nextLabel}</span>.
              </>
            ) : (
              <>
                Select <span className="text-foreground">{nextLabel}</span>.
              </>
            )}{" "}
            Cursor models run through the baked <span className="text-foreground">pi-cursor-sdk</span> provider:
            Cursor&apos;s local agent loop owns shell, edit, and search tools. Pho Code tools stay available over
            the local bridge, but Cursor may prefer its own tools.
          </p>
        </div>
      </div>
      <ul
        className="grid list-disc gap-1.5 pl-4 text-xs leading-relaxed text-muted-foreground"
        data-testid="cursor-model-warning-details"
      >
        <li>
          Cursor host tools are not gated by Pho Code&apos;s permission-system feature. Bridged Pho Code tools still
          go through normal permission prompts.
        </li>
        <li>
          This build keeps Cursor local-only and does not load ambient Cursor MCP, plugins, or rules from{" "}
          <span className="text-foreground">~/.cursor</span>. Cloud Cursor agents are not enabled.
        </li>
        <li>
          Auth is a Cursor SDK API key (Settings → Accounts), not Cursor Desktop or Agent CLI login. Extensions still
          run with the app process permissions.
        </li>
        {midChat ? (
          <li>
            Provider prompt-cache entries are keyed to the previous model. The next turn will miss cache reads; expect
            a cold prefix
            {typeof contextTokens === "number" && contextTokens > 0
              ? ` (~${formatTokenCount(contextTokens)}${
                  contextUsage?.contextWindow ? ` / ${formatTokenCount(contextUsage.contextWindow)}` : ""
                } projected context)`
              : ""}
            .
          </li>
        ) : null}
      </ul>
      {midChat ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground" data-testid="cursor-model-warning-rates">
          Rate card: {formatRatePerMillion(model.cost.input)} in / {formatRatePerMillion(model.cost.output)} out ·{" "}
          {formatTokenCount(model.contextWindow)} ctx.
        </p>
      ) : null}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          ref={confirmRef}
          type="button"
          size="sm"
          data-testid="cursor-model-warning-confirm"
          disabled={busy}
          onClick={onConfirm}
        >
          Use Cursor model
        </Button>
      </div>
    </ModelDialogShell>
  );
}
