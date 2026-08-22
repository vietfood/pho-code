const TOOL_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  ls: "Browse",
  list: "Browse",
  browse: "Browse",
  read: "Read",
  write: "Write",
  edit: "Edit",
  bash: "Run",
  user_bash: "Run",
  run: "Run",
  grep: "Search",
  ffgrep: "Search",
  "fff-multi-grep": "Search",
  search: "Search",
  find: "Find",
  fffind: "Find",
  web_search: "Web search",
  fetch: "Fetch",
  fetch_content: "Fetch",
  move_to_trash: "Trash",
  trash: "Trash",
  read_skill: "Skill",
  skill: "Skill",
  ask: "Ask",
  ask_user_question: "Ask",
  update_plan_document: "Plan",
  plan: "Plan",
  todo: "Todos",
  todos: "Todos",
  execute: "Execute",
  execute_plan: "Execute",
};

/** Human-facing label only. Tool registration, Pi events, and persisted JSONL keep the canonical name. */
export function displayToolName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return name;
  }
  const normalized = trimmed.replace(/^mcp__/iu, "").toLowerCase().replace(/\s+/gu, "_");
  if (normalized.startsWith("github_")) {
    const rest = normalized.slice("github_".length).replaceAll("_", " ");
    return rest ? `GitHub ${rest}` : "GitHub";
  }
  return TOOL_DISPLAY_NAMES[normalized] ?? titleCaseUnderscored(normalized);
}

function titleCaseUnderscored(value: string): string {
  return value
    .split(/[_\s]+/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
