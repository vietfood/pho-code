/** Compact relative timestamps for sidebar session rows (e.g. 8m, 2h, 3d). */
export function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) {
    return "";
  }
  const deltaSec = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (deltaSec < 60) {
    return `${Math.max(1, deltaSec)}s`;
  }
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) {
    return `${deltaMin}m`;
  }
  const deltaHour = Math.floor(deltaMin / 60);
  if (deltaHour < 48) {
    return `${deltaHour}h`;
  }
  const deltaDay = Math.floor(deltaHour / 24);
  if (deltaDay < 14) {
    return `${deltaDay}d`;
  }
  const deltaWeek = Math.floor(deltaDay / 7);
  if (deltaWeek < 8) {
    return `${deltaWeek}w`;
  }
  return `${Math.floor(deltaDay / 30)}mo`;
}
