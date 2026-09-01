import { useId, useRef, useState, type CSSProperties } from "react";
import {
  COMPACTION_COPY,
  type ContextUsageSummary,
  type SessionCompactionState,
  type SessionUsageSummary,
} from "@pho-code/protocol";
import { contextBarFillColor } from "./lib/context-bar-color";
import { formatContextPercent, formatTokenCount, formatUsd } from "./lib/format-tokens";
import { cn } from "./lib/cn";
import { ContextUsageMeter } from "./context-usage-meter";

/** Everything the usage popover needs to offer the manual compaction action. */
export interface ComposerCompactionAction {
  state: SessionCompactionState;
  /** Why Compact is unavailable right now; undefined means the action is enabled. */
  disabledReason?: string;
  onCompact: () => void;
  onCancel: () => void;
}

export function ComposerUsage({
  usage,
  contextUsage,
  compaction,
  className,
}: {
  usage?: SessionUsageSummary;
  contextUsage?: ContextUsageSummary;
  compaction?: ComposerCompactionAction;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (!usage && !contextUsage) {
    return null;
  }

  const percent = contextUsage?.percent ?? null;
  const windowSize = contextUsage?.contextWindow ?? 0;
  const fillColor = contextBarFillColor(percent);
  const contextLabel =
    percent === null || percent === undefined
      ? `?/${formatTokenCount(windowSize)}`
      : `${formatContextPercent(percent)}%/${formatTokenCount(windowSize)}`;

  const input = usage?.input ?? 0;
  const output = usage?.output ?? 0;
  const cacheRead = usage?.cacheRead ?? 0;
  const cacheWrite = usage?.cacheWrite ?? 0;
  const costUsd = usage?.costUsd ?? 0;
  const detailLabel = `Session usage ${contextLabel}, ${formatUsd(costUsd)}`;

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className={cn("composer-usage relative min-w-0", className)}>
      <button
        type="button"
        ref={triggerRef}
        data-testid="composer-usage-trigger"
        className={cn("composer-usage-trigger", open && "is-open")}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={detailLabel}
        title={detailLabel}
        onClick={() => setOpen((value) => !value)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) {
            setOpen(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            close();
          }
        }}
      >
        {contextUsage ? (
          <ContextUsageMeter
            className="context-usage-meter"
            percent={percent}
            tokens={contextUsage.tokens}
            contextWindow={windowSize}
            decorative
          />
        ) : (
          <span className="context-usage-meter__label tabular-nums">{formatUsd(costUsd)}</span>
        )}
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          data-testid="composer-usage-detail"
          className="composer-usage-popover"
          style={{ "--usage-context-accent": fillColor } as CSSProperties}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          <UsageRow
            label="Context"
            value={contextDetail(contextUsage)}
            valueClassName="composer-usage-percent"
          />
          <UsageRow
            label="Input"
            value={`↑${formatTokenCount(input)}`}
            valueClassName="composer-usage-input"
          />
          <UsageRow
            label="Output"
            value={`↓${formatTokenCount(output)}`}
            valueClassName="composer-usage-output"
          />
          <UsageRow
            label="Cache read"
            value={`R${formatTokenCount(cacheRead)}`}
            valueClassName="composer-usage-cache-read"
          />
          <UsageRow
            label="Cache write"
            value={`W${formatTokenCount(cacheWrite)}`}
            valueClassName="composer-usage-cache-write"
          />
          <UsageRow
            label="Total cost"
            value={formatUsd(costUsd)}
            valueClassName="composer-usage-cost"
            emphasize
          />
          {compaction ? <CompactionSection action={compaction} /> : null}
        </div>
      ) : null}
    </div>
  );
}

export function CompactionSection({ action }: { action: ComposerCompactionAction }) {
  const compacting = action.state.status === "compacting";
  return (
    <div className="composer-usage-compaction" data-testid="composer-usage-compaction">
      <p className="composer-usage-note">{COMPACTION_COPY.usageNote}</p>
      {compacting ? (
        <div className="composer-usage-compaction-row">
          <span className="composer-usage-compaction-status" role="status">
            {COMPACTION_COPY.actionBusy}
          </span>
          {action.state.cancelable ? (
            <button
              type="button"
              className="composer-usage-compaction-button"
              data-testid="cancel-compaction"
              onClick={action.onCancel}
            >
              {COMPACTION_COPY.cancel}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <button
            type="button"
            className="composer-usage-compaction-button"
            data-testid="compact-context"
            disabled={action.disabledReason !== undefined}
            {...(action.disabledReason !== undefined ? { title: action.disabledReason } : {})}
            onClick={action.onCompact}
          >
            {COMPACTION_COPY.action}
          </button>
          {action.disabledReason !== undefined ? (
            <p className="composer-usage-note" data-testid="compact-unavailable">
              {action.disabledReason}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function UsageRow({
  label,
  value,
  valueClassName,
  emphasize = false,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  emphasize?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 text-[0.6875rem]", emphasize && "font-medium")}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", valueClassName ?? "text-foreground")}>{value}</span>
    </div>
  );
}

function contextDetail(contextUsage?: ContextUsageSummary): string {
  if (!contextUsage) {
    return "—";
  }
  const tokens =
    contextUsage.tokens === null || contextUsage.tokens === undefined
      ? "?"
      : formatTokenCount(contextUsage.tokens);
  const percent =
    contextUsage.percent === null || contextUsage.percent === undefined
      ? "?"
      : `${formatContextPercent(contextUsage.percent)}%`;
  return `${tokens} · ${percent} of ${formatTokenCount(contextUsage.contextWindow)}`;
}
