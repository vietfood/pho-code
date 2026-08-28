import {
  completedPlanTodoCount,
  displayToolName,
  parsePlanTodoList,
  type AgentToolKind,
  type PlanTodoItem,
  type ToolStatus,
} from "@pho-code/protocol";
import { splitRelativePath } from "./lib/compact-path";

export interface ToolWorkEntryChip {
  text: string;
  title: string;
}

export type WorkEntryIconName =
  | "list"
  | "read"
  | "write"
  | "edit"
  | "run"
  | "search"
  | "find"
  | "web-search"
  | "fetch"
  | "trash"
  | "skill"
  | "ask"
  | "todos"
  | "plan"
  | "execute"
  | "github"
  | "wrench"
  | "thought";

export type ToolPayloadLanguage = "bash" | "json" | "text";

export interface ToolExpandedSection {
  id: "input" | "output";
  label: string;
  language: ToolPayloadLanguage;
  text: string;
}

export function capitalizePhrase(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return value;
  }
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

export function toolWorkEntryHeading(name: string, _status: ToolStatus): string {
  return displayToolName(name);
}

const ICON_BY_KEY: Readonly<Record<string, WorkEntryIconName>> = {
  ls: "list",
  list: "list",
  browse: "list",
  read: "read",
  write: "write",
  edit: "edit",
  bash: "run",
  "user bash": "run",
  run: "run",
  shell: "run",
  grep: "search",
  search: "search",
  find: "find",
  "web search": "web-search",
  fetch: "fetch",
  "fetch content": "fetch",
  "move to trash": "trash",
  trash: "trash",
  "read skill": "skill",
  skill: "skill",
  ask: "ask",
  "ask user": "ask",
  "ask user question": "ask",
  todo: "todos",
  todos: "todos",
  "plan document": "plan",
  "update plan document": "plan",
  plan: "plan",
  execute: "execute",
  "execute plan": "execute",
  thought: "thought",
};

const ICON_BY_KIND: Readonly<Partial<Record<AgentToolKind, WorkEntryIconName>>> = {
  command: "run",
  "file-change": "edit",
  mcp: "wrench",
  "web-search": "web-search",
  image: "read",
  review: "read",
  subagent: "thought",
  other: "wrench",
};

export function toolWorkEntryIcon(name: string, kind?: AgentToolKind): WorkEntryIconName {
  if (kind && ICON_BY_KIND[kind]) return ICON_BY_KIND[kind];
  const key = normalizeToolName(name);
  if (key.startsWith("github")) {
    return "github";
  }
  return ICON_BY_KEY[key] ?? "wrench";
}

export function toolWorkEntryChip(
  name: string,
  inputPreview: string,
  outputPreview = "",
): ToolWorkEntryChip | null {
  const key = normalizeToolName(name);
  if (key === "todo" || key === "todos") {
    const todos = parseTodosFromInput(inputPreview);
    if (!todos || todos.length === 0) {
      return null;
    }
    const text = `${completedPlanTodoCount(todos)}/${todos.length}`;
    return { text, title: text };
  }

  const target = describeToolInputTarget(name, inputPreview);
  if (target) {
    const text = conciseChipText(target.label, target.value);
    if (!text) {
      return null;
    }
    return { text, title: compactWhitespace(target.value) };
  }

  if (key === "ask" || key === "ask user" || key === "ask user question") {
    const title = compactWhitespace(outputPreview);
    return title ? { text: title, title } : null;
  }

  return null;
}

export function thoughtWorkEntryChip(text: string): ToolWorkEntryChip | null {
  const firstLine = compactWhitespace((text.split(/\r?\n/u, 1)[0] ?? "").replace(/[*_`#]+/gu, " "));
  return firstLine ? { text: firstLine, title: firstLine } : null;
}

export function describeToolInputTarget(
  name: string,
  inputPreview: string,
): { label: string; value: string } | null {
  const trimmed = inputPreview.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = tryParseJson(trimmed);
  if (parsed && isPlainObject(parsed)) {
    const key = normalizeToolName(name);
    if (isShellTool(key)) {
      const command = firstString(parsed, ["command", "cmd"]);
      if (command) {
        return { label: "Command", value: command };
      }
    }
    const primary = primaryToolField(key, parsed);
    if (primary) {
      return { label: labelForField(primary.field), value: primary.value };
    }
  }
  return extractQuotedField(trimmed, ["url", "path", "file_path", "query", "pattern", "command", "cmd"]);
}

export function prettyToolInputJson(inputPreview: string): string | null {
  const parsed = tryParseJson(inputPreview.trim());
  if (parsed === undefined) {
    return null;
  }
  if (isPlainObject(parsed) || Array.isArray(parsed)) {
    return JSON.stringify(parsed, null, 2);
  }
  if (typeof parsed === "string") {
    return parsed;
  }
  return null;
}

export function buildToolExpandedSections(
  name: string,
  inputPreview: string,
  outputPreview: string,
): ToolExpandedSection[] {
  const sections: ToolExpandedSection[] = [];
  const input = formatToolInput(name, inputPreview);
  if (input) {
    sections.push({ id: "input", ...input });
  }
  const output = formatToolOutput(outputPreview);
  if (output) {
    sections.push({ id: "output", label: "Output", ...output });
  }
  return sections;
}

function formatToolInput(
  name: string,
  inputPreview: string,
): { label: string; language: ToolPayloadLanguage; text: string } | null {
  const trimmed = inputPreview.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = tryParseJson(trimmed);
  if (parsed && isPlainObject(parsed)) {
    const key = normalizeToolName(name);
    if (key === "todo") {
      const todos = parseTodosFromRecord(parsed);
      if (todos) {
        return {
          label: "Todos",
          language: "text",
          text: todos
            .map((item) => {
              const mark = item.status === "completed" ? "x" : item.status === "in_progress" ? "/" : " ";
              return `[${mark}] ${item.content}`;
            })
            .join("\n"),
        };
      }
    }
    if (isShellTool(key)) {
      const command = firstString(parsed, ["command", "cmd"]);
      if (command) {
        return { label: "Command", language: "bash", text: command };
      }
    }

    const primary = primaryToolField(key, parsed);
    if (primary) {
      const remainingKeys = Object.keys(parsed).filter((field) => field !== primary.field);
      if (remainingKeys.length === 0) {
        return {
          label: labelForField(primary.field),
          language: primary.language,
          text: primary.value,
        };
      }
    }

    return {
      label: "Input",
      language: "json",
      text: JSON.stringify(parsed, null, 2),
    };
  }

  if (typeof parsed === "string") {
    const shell = isShellTool(normalizeToolName(name));
    return {
      label: shell ? "Command" : "Input",
      language: shell ? "bash" : "text",
      text: parsed,
    };
  }

  return { label: "Input", language: "text", text: trimmed };
}

function formatToolOutput(outputPreview: string): { language: ToolPayloadLanguage; text: string } | null {
  const trimmed = outputPreview.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = tryParseJson(trimmed);
  if (parsed !== undefined && (isPlainObject(parsed) || Array.isArray(parsed))) {
    return { language: "json", text: JSON.stringify(parsed, null, 2) };
  }
  return { language: "text", text: trimmed };
}

const PATH_FIELDS = ["path", "file_path", "filePath", "filename"];
const QUERY_FIELDS = ["query", "pattern", "glob", "url"];
const COMMAND_FIELDS = ["command", "cmd"];

function primaryToolField(
  toolKey: string,
  record: Record<string, unknown>,
): { field: string; value: string; language: ToolPayloadLanguage } | null {
  const fileish =
    toolKey.includes("read") ||
    toolKey === "edit" ||
    toolKey.includes("write") ||
    toolKey.includes("str_replace") ||
    toolKey.includes("apply_patch");
  const searchish =
    toolKey.includes("grep") ||
    toolKey.includes("search") ||
    toolKey.includes("glob") ||
    toolKey.includes("find") ||
    toolKey.includes("web") ||
    toolKey.includes("fetch");
  const ordered = fileish
    ? [...PATH_FIELDS, ...QUERY_FIELDS, ...COMMAND_FIELDS]
    : searchish
      ? [...QUERY_FIELDS, ...PATH_FIELDS, ...COMMAND_FIELDS]
      : [...COMMAND_FIELDS, ...PATH_FIELDS, ...QUERY_FIELDS];

  for (const field of ordered) {
    const value = record[field];
    if (typeof value === "string" && value.trim()) {
      return {
        field,
        value,
        language: COMMAND_FIELDS.includes(field) ? "bash" : "text",
      };
    }
  }
  return null;
}

const FIELD_LABELS: Record<string, string> = {
  command: "Command",
  cmd: "Command",
  path: "Path",
  file_path: "Path",
  filePath: "Path",
  filename: "Path",
  query: "Query",
  pattern: "Pattern",
  glob: "Glob",
  url: "URL",
};

function labelForField(field: string): string {
  return FIELD_LABELS[field] ?? capitalizePhrase(field.replace(/_/gu, " "));
}

function normalizeToolName(name: string): string {
  return name.trim().replace(/^mcp__/u, "").replace(/_/gu, " ").toLowerCase();
}

function isShellTool(key: string): boolean {
  return key === "bash" || key === "shell" || key === "run" || key.includes("terminal") || key.includes("exec");
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function parseTodosFromInput(inputPreview: string): PlanTodoItem[] | null {
  const parsed = tryParseJson(inputPreview.trim());
  if (!parsed || !isPlainObject(parsed)) {
    return null;
  }
  return parseTodosFromRecord(parsed);
}

function parseTodosFromRecord(record: Record<string, unknown>): PlanTodoItem[] | null {
  const parsed = parsePlanTodoList(record.todos);
  return parsed.ok ? parsed.todos : null;
}

function conciseChipText(label: string, value: string): string | null {
  const compact = compactWhitespace(value);
  if (!compact) {
    return null;
  }
  if (label === "Path") {
    return splitRelativePath(compact).name || compact;
  }
  if (label === "URL") {
    return urlChipText(compact);
  }
  return compact;
}

function urlChipText(value: string): string {
  try {
    const url = new URL(value);
    const last = url.pathname.split("/").filter(Boolean).at(-1);
    return last || url.hostname;
  } catch {
    return value;
  }
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(record: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function extractQuotedField(
  value: string,
  fields: readonly string[],
): { label: string; value: string } | null {
  for (const field of fields) {
    const match = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "u").exec(value);
    const extracted = match?.[1];
    if (extracted) {
      return { label: labelForField(field), value: unescapeJsonString(extracted) };
    }
  }
  return null;
}

const JSON_ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

function unescapeJsonString(value: string): string {
  return value.replace(/\\(["\\/bfnrt])/gu, (_, ch: string) => JSON_ESCAPES[ch] ?? ch);
}
