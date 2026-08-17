import type { CSSProperties } from "react";
import { contextBarFillColor } from "./lib/context-bar-color";
import { formatContextPercent, formatTokenCount } from "./lib/format-tokens";

// Circular meter adapted from AI Elements Context progress icon
// (https://elements.ai-sdk.dev/components/context, MIT, Vercel).
const ICON_RADIUS = 9;
const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_STROKE_WIDTH = 3.75;
const ICON_CIRCUMFERENCE = 2 * Math.PI * ICON_RADIUS;

export function ContextUsageMeter({
  percent,
  tokens,
  contextWindow,
  size = 16,
  className,
}: {
  percent: number | null;
  tokens: number | null | undefined;
  contextWindow: number;
  size?: number;
  className?: string;
}) {
  const fill = clampPercent(percent);
  const fillColor = contextBarFillColor(percent);
  const dashOffset = ICON_CIRCUMFERENCE * (1 - fill / 100);
  const label = formatMeterPercent(percent);
  const detail = formatMeterDetail(percent, tokens, contextWindow);

  return (
    <span
      className={className}
      data-testid="composer-context-ring"
      role="img"
      aria-label={`Context ${detail}`}
      title={`Context ${detail}`}
      style={{ "--context-meter-accent": fillColor } as CSSProperties}
    >
      <span className="context-usage-meter__label tabular-nums" aria-hidden="true">
        {label}
      </span>
      <span className="context-usage-meter__ring" aria-hidden="true">
        <svg
          className="context-usage-meter__svg"
          viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
          width={size}
          height={size}
        >
          <circle
            className="context-usage-meter__track"
            cx={ICON_CENTER}
            cy={ICON_CENTER}
            r={ICON_RADIUS}
            fill="none"
            strokeWidth={ICON_STROKE_WIDTH}
          />
          <circle
            className="context-usage-meter__fill"
            cx={ICON_CENTER}
            cy={ICON_CENTER}
            r={ICON_RADIUS}
            fill="none"
            strokeWidth={ICON_STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={ICON_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${ICON_CENTER} ${ICON_CENTER})`}
          />
        </svg>
      </span>
    </span>
  );
}

function clampPercent(percent: number | null | undefined): number {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) {
    return 0;
  }
  return Math.min(100, Math.max(0, percent));
}

function formatMeterPercent(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) {
    return "?";
  }
  if (percent >= 100) {
    return "100%";
  }
  return `${formatContextPercent(percent)}%`;
}

function formatMeterDetail(
  percent: number | null | undefined,
  tokens: number | null | undefined,
  contextWindow: number,
): string {
  const pct =
    percent === null || percent === undefined || !Number.isFinite(percent)
      ? "?"
      : `${formatContextPercent(percent)}%`;
  const tokenLabel =
    tokens === null || tokens === undefined || !Number.isFinite(tokens)
      ? "?"
      : formatTokenCount(tokens);
  const windowLabel = contextWindow > 0 ? formatTokenCount(contextWindow) : "?";
  return `${pct} · ${tokenLabel}/${windowLabel}`;
}
