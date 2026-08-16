const STORAGE_KEY = "pho-code.reviewSidebarWidth";

/** Icon rail for FileDiff, Context prompt, and later terminal surfaces, matching settings-nav density. */
export const REVIEW_SIDEBAR_RAIL_WIDTH_PX = 40;
/** Wide enough to read a unified diff without feeling like a narrow drawer. */
export const DEFAULT_REVIEW_SIDEBAR_WIDTH_PX = 520;
/** Wide enough for a unified diff or the context-prompt panel. */
export const MIN_REVIEW_SIDEBAR_WIDTH_PX = 360;
/** Canvas-like split: up to ~62% of the window, capped for very wide displays. */
export const MAX_REVIEW_SIDEBAR_WIDTH_PX = 1100;
export const REVIEW_SIDEBAR_RESIZE_STEP_PX = 16;

function viewportCap(): number {
  if (typeof window === "undefined" || !Number.isFinite(window.innerWidth)) {
    return MAX_REVIEW_SIDEBAR_WIDTH_PX;
  }
  return Math.max(MIN_REVIEW_SIDEBAR_WIDTH_PX, Math.floor(window.innerWidth * 0.62));
}

export function clampReviewSidebarWidth(widthPx: number): number {
  if (!Number.isFinite(widthPx)) {
    return DEFAULT_REVIEW_SIDEBAR_WIDTH_PX;
  }
  const max = Math.min(MAX_REVIEW_SIDEBAR_WIDTH_PX, viewportCap());
  return Math.min(max, Math.max(MIN_REVIEW_SIDEBAR_WIDTH_PX, Math.round(widthPx)));
}

export function readReviewSidebarWidth(): number {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw == null || raw === "") {
      return DEFAULT_REVIEW_SIDEBAR_WIDTH_PX;
    }
    return clampReviewSidebarWidth(Number.parseInt(raw, 10));
  } catch {
    return DEFAULT_REVIEW_SIDEBAR_WIDTH_PX;
  }
}

export function writeReviewSidebarWidth(widthPx: number): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, String(clampReviewSidebarWidth(widthPx)));
  } catch {
    // Ignore quota / private-mode failures; in-memory state still works.
  }
}
