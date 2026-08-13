const STORAGE_KEY = "pho-code.sidebarCollapsed";

export function readSidebarCollapsed(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // Ignore quota / private-mode failures; in-memory state still works.
  }
}
