import { useRef } from "react";
import type { ContextUsageSummary, ModelSummary } from "@pho-code/protocol";
import { formatTokenCount } from "./lib/format-tokens";
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
            Cursor runs its own local agent loop (shell, edit, search) through the baked{" "}
            <span className="text-foreground">pi-cursor-sdk</span> provider; Pho Code tools stay available over the
            local bridge, though Cursor may prefer its own.
          </p>
        </div>
      </div>
      <ul
        className="grid list-disc gap-1.5 pl-4 text-xs leading-relaxed text-muted-foreground"
        data-testid="cursor-model-warning-details"
      >
        <li>
          Cursor tools are not gated by Pho Code&apos;s permission-system; bridged Pho Code tools still ask.
        </li>
        <li>
          Runs local-only: no Cursor Cloud, and no ambient MCP, plugins, or rules load from{" "}
          <span className="text-foreground">~/.cursor</span>.
        </li>
        <li>Sign-in is a Cursor API key in Settings → Accounts; the agent runs with the app process permissions.</li>
        {midChat ? (
          <li>
            The next turn will miss cache reads on a cold prefix
            {typeof contextTokens === "number" && contextTokens > 0
              ? ` (~${formatTokenCount(contextTokens)}${
                  contextUsage?.contextWindow ? ` / ${formatTokenCount(contextUsage.contextWindow)}` : ""
                } projected context)`
              : ""}
            .
          </li>
        ) : null}
      </ul>
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
