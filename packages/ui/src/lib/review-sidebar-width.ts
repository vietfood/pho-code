const STORAGE_KEY = "pho-code.reviewSidebarWidth";

/** Icon rail for FileDiff, Context prompt, and later terminal surfaces, matching settings-nav density. */
export const REVIEW_SIDEBAR_RAIL_WIDTH_PX = 40;
/** Matches the previous fixed review sheet (~28rem) at the 16px UI root. */
export const DEFAULT_REVIEW_SIDEBAR_WIDTH_PX = 448;
/** Wide enough for a unified diff or the context-prompt panel. */
export const MIN_REVIEW_SIDEBAR_WIDTH_PX = 360;
export const MAX_REVIEW_SIDEBAR_WIDTH_PX = 720;
export const REVIEW_SIDEBAR_RESIZE_STEP_PX = 16;

function viewportCap(): number {
  if (typeof window === "undefined" || !Number.isFinite(window.innerWidth)) {
    return MAX_REVIEW_SIDEBAR_WIDTH_PX;
  }
  return Math.max(MIN_REVIEW_SIDEBAR_WIDTH_PX, Math.floor(window.innerWidth * 0.55));
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
