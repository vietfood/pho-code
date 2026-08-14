const STORAGE_KEY = "pho-code.sidebarWidth";

/** Matches `--sidebar-width: 18.25rem` at the 16px UI root. */
export const DEFAULT_SIDEBAR_WIDTH_PX = 292;
/** Wide enough that project/session labels stay readable; collapse is button-only. */
export const MIN_SIDEBAR_WIDTH_PX = 264;
export const MAX_SIDEBAR_WIDTH_PX = 420;
export const SIDEBAR_RESIZE_STEP_PX = 16;

export function clampSidebarWidth(widthPx: number): number {
  if (!Number.isFinite(widthPx)) {
    return DEFAULT_SIDEBAR_WIDTH_PX;
  }
  return Math.min(MAX_SIDEBAR_WIDTH_PX, Math.max(MIN_SIDEBAR_WIDTH_PX, Math.round(widthPx)));
}

export function readSidebarWidth(): number {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw == null || raw === "") {
      return DEFAULT_SIDEBAR_WIDTH_PX;
    }
    return clampSidebarWidth(Number.parseInt(raw, 10));
  } catch {
    return DEFAULT_SIDEBAR_WIDTH_PX;
  }
}

export function writeSidebarWidth(widthPx: number): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, String(clampSidebarWidth(widthPx)));
  } catch {
    // Ignore quota / private-mode failures; in-memory state still works.
  }
}
