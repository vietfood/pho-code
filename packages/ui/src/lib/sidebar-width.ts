import { readStoredValue, writeStoredValue } from "./storage";

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
  const raw = readStoredValue(STORAGE_KEY);
  return raw == null || raw === "" ? DEFAULT_SIDEBAR_WIDTH_PX : clampSidebarWidth(Number.parseInt(raw, 10));
}

export function writeSidebarWidth(widthPx: number): void {
  writeStoredValue(STORAGE_KEY, String(clampSidebarWidth(widthPx)));
}
