/** Pi-style compact token counts: 842, 1.2k, 12k, 1.2M. */
export function formatTokenCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) {
    return "0";
  }
  if (count < 1_000) {
    return String(Math.round(count));
  }
  if (count < 10_000) {
    return `${(count / 1_000).toFixed(1)}k`;
  }
  if (count < 1_000_000) {
    return `${Math.round(count / 1_000)}k`;
  }
  return `${(count / 1_000_000).toFixed(1)}M`;
}

/** Format context percent already on a 0–100 scale (Pi `ContextUsage.percent`). */
export function formatContextPercent(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) {
    return "?";
  }
  return percent.toFixed(1);
}

export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "$0.000";
  }
  if (amount < 0.001) {
    return `$${amount.toFixed(4)}`;
  }
  return `$${amount.toFixed(3)}`;
}

/** Display model rate as USD per million tokens. */
export function formatRatePerMillion(rate: number): string {
  if (!Number.isFinite(rate)) {
    return "$0";
  }
  if (rate === 0) {
    return "$0";
  }
  if (rate < 0.01) {
    return `$${rate.toFixed(3)}`;
  }
  if (rate < 1) {
    return `$${rate.toFixed(2)}`;
  }
  if (Number.isInteger(rate)) {
    return `$${rate}`;
  }
  return `$${rate.toFixed(2)}`;
}
