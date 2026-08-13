/**
 * Map context usage percent (0–100) to a fill color that shifts
 * muted → amber → red as the window fills.
 */
export function contextBarFillColor(percent: number | null | undefined): string {
  const clamped = clampPercent(percent);
  // HSL: green (~142°) → amber (~40°) → red (~0°)
  const hue = lerp(142, 0, easeTowardRed(clamped / 100));
  const saturation = lerp(42, 78, clamped / 100);
  const lightness = lerp(46, 52, clamped / 100);
  return `hsl(${hue.toFixed(1)} ${saturation.toFixed(1)}% ${lightness.toFixed(1)}%)`;
}

function clampPercent(percent: number | null | undefined): number {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) {
    return 0;
  }
  return Math.min(100, Math.max(0, percent));
}

/** Spend more of the hue budget in the upper half so high usage reads redder sooner. */
function easeTowardRed(t: number): number {
  return t * t * (2 - t);
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, t));
}
