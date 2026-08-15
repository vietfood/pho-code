const STORAGE_KEY = "pho-code.rightSidebarCollapsed";

/** Collapsed (pill) is the default so the conversation stays primary. */
export function readRightSidebarCollapsed(): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw == null || raw === "") {
      return true;
    }
    return raw === "1";
  } catch {
    return true;
  }
}

export function writeRightSidebarCollapsed(collapsed: boolean): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // Ignore quota / private-mode failures; in-memory state still works.
  }
}
