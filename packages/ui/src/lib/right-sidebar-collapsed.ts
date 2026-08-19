import { readStoredValue, writeStoredValue } from "./storage";

const STORAGE_KEY = "pho-code.rightSidebarCollapsed";

/** Collapsed (pill) is the default so the conversation stays primary. */
export function readRightSidebarCollapsed(): boolean {
  const raw = readStoredValue(STORAGE_KEY);
  return raw == null || raw === "" ? true : raw === "1";
}

export function writeRightSidebarCollapsed(collapsed: boolean): void {
  writeStoredValue(STORAGE_KEY, collapsed ? "1" : "0");
}
