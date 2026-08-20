import {
  completedPlanTodoCount,
  parsePlanTodoList,
  type PlanTodoItem,
  type ToolStatus,
} from "@pho-code/protocol";
import { splitRelativePath } from "./lib/compact-path";

export interface ToolWorkEntryChip {
  text: string;
  title: string;
}

export type WorkEntryIconName =
  | "terminal"
  | "eye"
  | "square-pen"
  | "search"
  | "globe"
  | "folder"
  | "wrench"
  | "bot"
  | "list";

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

export function toolStatusWord(status: ToolStatus): string {
  return status;
}

export function toolWorkEntryHeading(name: string, status: ToolStatus): string {
  return capitalizePhrase(`${normalizeToolName(name)} ${toolStatusWord(status)}`);
}

const ICON_RULES: readonly [test: (key: string) => boolean, icon: WorkEntryIconName][] = [
  [(key) => key === "execute" || key === "execute_plan", "bot"],
  [isShellTool, "terminal"],
  [(key) => key === "read" || key.includes("read_file") || key.includes("cat"), "eye"],
  [
    (key) =>
      key === "write" || key === "edit" || key.includes("write_file") || key.includes("apply_patch") || key.includes("str_replace"),
    "square-pen",
  ],
  [(key) => key.includes("grep") || key.includes("search") || key.includes("glob") || key.includes("find"), "search"],
  [(key) => key.includes("web") || key.includes("fetch") || key.includes("http"), "globe"],
  [(key) => key.includes("ls") || key.includes("list") || key.includes("dir") || key.includes("trash"), "folder"],
  [(key) => key === "todo", "list"],
];

export function toolWorkEntryIcon(name: string): WorkEntryIconName {
  const key = normalizeToolName(name);
  return ICON_RULES.find(([test]) => test(key))?.[1] ?? "wrench";
}

export function toolWorkEntryChip(
  name: string,
  inputPreview: string,
  outputPreview = "",
): ToolWorkEntryChip | null {
  const key = normalizeToolName(name);
  if (key === "todo") {
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

  if (key === "ask user question") {
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
  return key === "bash" || key === "shell" || key.includes("terminal") || key.includes("exec");
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
