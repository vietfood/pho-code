const APP_TOOL_DISPLAY_NAMES = {
  ffgrep: "grep",
  fffind: "find",
  "fff-multi-grep": "multi-grep",
  web_search: "web search",
  fetch_content: "fetch",
  move_to_trash: "move to trash",
} as const satisfies Readonly<Record<string, string>>;

export const APP_OWNED_TOOL_NAMES = Object.freeze(Object.keys(APP_TOOL_DISPLAY_NAMES));

/** Human-facing label only. Tool registration, Pi events, and persisted JSONL keep the canonical name. */
export function displayToolName(name: string): string {
  return APP_TOOL_DISPLAY_NAMES[name as keyof typeof APP_TOOL_DISPLAY_NAMES] ?? name;
}

/** Sanitizes extension-owned dialog copy before it crosses the host UI protocol boundary. */
export function displayToolNamesInText(value: string): string {
  let displayed = value;
  for (const internalName of APP_OWNED_TOOL_NAMES) {
    displayed = displayed.replaceAll(internalName, displayToolName(internalName));
  }
  return displayed;
}
