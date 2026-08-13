import { useId, useState } from "react";
import type { ContextUsageSummary, SessionUsageSummary } from "@pho-code/protocol";
import { contextBarFillColor } from "./lib/context-bar-color";
import { formatContextPercent, formatTokenCount, formatUsd } from "./lib/format-tokens";
import { cn } from "./lib/cn";

export function ComposerUsage({
  usage,
  contextUsage,
  className,
}: {
  usage?: SessionUsageSummary;
  contextUsage?: ContextUsageSummary;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (!usage && !contextUsage) {
    return null;
  }

  const percent = contextUsage?.percent ?? null;
  const windowSize = contextUsage?.contextWindow ?? 0;
  const fill = Math.min(100, Math.max(0, percent ?? 0));
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

  return (
    <div className={cn("relative min-w-0", className)}>
      <button
        type="button"
        data-testid="composer-usage"
        className="composer-usage-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Session usage ${contextLabel}, ${formatUsd(costUsd)}`}
        onClick={() => setOpen((value) => !value)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) {
            setOpen(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        <span className="context-usage-bar" aria-hidden="true">
          <span
            className="context-usage-bar__fill"
            style={{ width: `${fill}%`, backgroundColor: fillColor }}
          />
        </span>
        <span className="tabular-nums">{contextLabel}</span>
        <span className="composer-usage-sep" aria-hidden="true">
          |
        </span>
        <span className="tabular-nums">↑{formatTokenCount(input)}</span>
        <span className="tabular-nums">↓{formatTokenCount(output)}</span>
        {cacheRead > 0 ? <span className="tabular-nums">R{formatTokenCount(cacheRead)}</span> : null}
        {cacheWrite > 0 ? <span className="tabular-nums">W{formatTokenCount(cacheWrite)}</span> : null}
        <span className="composer-usage-sep" aria-hidden="true">
          |
        </span>
        <span className="composer-usage-cost tabular-nums">{formatUsd(costUsd)}</span>
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          data-testid="composer-usage-detail"
          className="composer-usage-popover"
        >
          <UsageRow label="Context" value={contextDetail(contextUsage)} />
          <UsageRow label="Input" value={formatTokenCount(input)} />
          <UsageRow label="Output" value={formatTokenCount(output)} />
          <UsageRow label="Cache read" value={formatTokenCount(cacheRead)} />
          <UsageRow label="Cache write" value={formatTokenCount(cacheWrite)} />
          <UsageRow label="Total cost" value={formatUsd(costUsd)} emphasize />
        </div>
      ) : null}
    </div>
  );
}

function UsageRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 text-[11px]", emphasize && "font-medium")}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
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
