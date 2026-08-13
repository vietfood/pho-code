/** Beautiful UI loading-state timer: tenths of a second, then minutes. */
export function formatElapsedTenths(elapsedMs: number): string {
  const total = Math.max(0, elapsedMs) / 1000;
  if (total < 60) {
    return `${total.toFixed(1)}s`;
  }
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}m ${seconds.toFixed(1)}s`;
}

export function elapsedSince(startedAt: string | undefined, nowMs: number): string {
  if (!startedAt) {
    return "0.0s";
  }
  const startMs = Date.parse(startedAt);
  if (Number.isNaN(startMs) || nowMs < startMs) {
    return "0.0s";
  }
  return formatElapsedTenths(nowMs - startMs);
}
