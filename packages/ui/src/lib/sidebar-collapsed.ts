import { readStoredValue, writeStoredValue } from "./storage";

const STORAGE_KEY = "pho-code.sidebarCollapsed";

export function readSidebarCollapsed(): boolean {
  return readStoredValue(STORAGE_KEY) === "1";
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  writeStoredValue(STORAGE_KEY, collapsed ? "1" : "0");
}
