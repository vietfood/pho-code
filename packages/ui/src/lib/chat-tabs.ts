import { readStoredValue, writeStoredValue } from "./storage";

const STORAGE_KEY = "pho-code.chatTabs";
const LEGACY_STORAGE_KEY = "pho-code.chatTiles";

/**
 * Main-region chat tab strip: every open chat is a tab, exactly one is active,
 * and closing a tab is view-only (the session keeps running in the sidebar).
 */
export interface ChatTabs {
  tabs: string[];
  active: string | null;
}

export function emptyChatTabs(): ChatTabs {
  return { tabs: [], active: null };
}

export function isChatTabOpen(state: ChatTabs, key: string): boolean {
  return state.tabs.includes(key);
}

/** Open-or-focus: a known tab activates, a new tab appends and activates. */
export function openChatTab(state: ChatTabs, key: string): ChatTabs {
  if (state.tabs.includes(key)) {
    return focusChatTab(state, key);
  }
  return { tabs: [...state.tabs, key], active: key };
}

export function focusChatTab(state: ChatTabs, key: string): ChatTabs {
  if (!state.tabs.includes(key) || state.active === key) {
    return state;
  }
  return { ...state, active: key };
}

/** Closing the active tab activates its right neighbor, else the left one. */
export function closeChatTab(state: ChatTabs, key: string): ChatTabs {
  const index = state.tabs.indexOf(key);
  if (index < 0) {
    return state;
  }
  const tabs = state.tabs.filter((entry) => entry !== key);
  let active = state.active;
  if (active === key) {
    active = tabs[index] ?? tabs[index - 1] ?? null;
  }
  return { tabs, active };
}

/** A pending-new tab swaps its temporary key for the real session key. */
export function replaceChatTabKey(state: ChatTabs, oldKey: string, newKey: string): ChatTabs {
  if (!state.tabs.includes(oldKey) || state.tabs.includes(newKey)) {
    return state;
  }
  return {
    tabs: state.tabs.map((entry) => (entry === oldKey ? newKey : entry)),
    active: state.active === oldKey ? newKey : state.active,
  };
}

function sanitizeChatTabs(value: unknown, isKnownKey?: (key: string) => boolean): ChatTabs | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as { tabs?: unknown; active?: unknown };
  if (!Array.isArray(candidate.tabs)) {
    return null;
  }
  const tabs = candidate.tabs.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry !== "" && (isKnownKey?.(entry) ?? true),
  );
  const unique = [...new Set(tabs)];
  const active =
    typeof candidate.active === "string" && unique.includes(candidate.active)
      ? candidate.active
      : (unique[0] ?? null);
  return { tabs: unique, active };
}

/** Pre-tab builds persisted a tiling shape; fold its visible/parked sets into tabs. */
function migrateLegacyTiles(value: unknown, isKnownKey?: (key: string) => boolean): ChatTabs | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as { visible?: unknown; minimized?: unknown; focused?: unknown };
  if (!Array.isArray(candidate.visible)) {
    return null;
  }
  const parked = Array.isArray(candidate.minimized) ? candidate.minimized : [];
  const tabs = [...candidate.visible, ...parked].filter(
    (entry): entry is string =>
      typeof entry === "string" && entry !== "" && (isKnownKey?.(entry) ?? true),
  );
  const unique = [...new Set(tabs)];
  const active =
    typeof candidate.focused === "string" && unique.includes(candidate.focused)
      ? candidate.focused
      : (unique[0] ?? null);
  return { tabs: unique, active };
}

function parseStored(raw: string | null): unknown {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Reads the persisted tab strip. When `isKnownKey` is given, tabs whose
 * session no longer exists drop silently; the active tab is repaired.
 */
export function readChatTabs(isKnownKey?: (key: string) => boolean): ChatTabs {
  const stored = sanitizeChatTabs(parseStored(readStoredValue(STORAGE_KEY)), isKnownKey);
  if (stored) {
    return stored;
  }
  const legacy = migrateLegacyTiles(parseStored(readStoredValue(LEGACY_STORAGE_KEY)), isKnownKey);
  return legacy ?? emptyChatTabs();
}

export function writeChatTabs(state: ChatTabs): void {
  writeStoredValue(STORAGE_KEY, JSON.stringify(state));
}
