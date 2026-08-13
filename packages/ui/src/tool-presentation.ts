import type { ToolStatus } from "@pho-code/protocol";

export type WorkEntryIconName =
  | "terminal"
  | "eye"
  | "square-pen"
  | "search"
  | "globe"
  | "folder"
  | "wrench"
  | "bot";

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
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "running":
      return "running";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function toolWorkEntryHeading(name: string, status: ToolStatus): string {
  return capitalizePhrase(`${normalizeToolName(name)} ${toolStatusWord(status)}`);
}

export function toolWorkEntryIcon(name: string): WorkEntryIconName {
  const key = normalizeToolName(name);
  if (key === "bash" || key === "shell" || key.includes("terminal") || key.includes("exec")) {
    return "terminal";
  }
  if (key === "read" || key.includes("read_file") || key.includes("cat")) {
    return "eye";
  }
  if (
    key === "write" ||
    key === "edit" ||
    key.includes("write_file") ||
    key.includes("apply_patch") ||
    key.includes("str_replace")
  ) {
    return "square-pen";
  }
  if (key.includes("grep") || key.includes("search") || key.includes("glob") || key.includes("find")) {
    return "search";
  }
  if (key.includes("web") || key.includes("fetch") || key.includes("http")) {
    return "globe";
  }
  if (key.includes("ls") || key.includes("list") || key.includes("dir")) {
    return "folder";
  }
  return "wrench";
}

export function toolWorkEntryPreview(name: string, inputPreview: string, outputPreview: string): string | null {
  const fromInput = extractPreviewFromPayload(name, inputPreview);
  if (fromInput) {
    return fromInput;
  }
  const compactOutput = compactOneLine(outputPreview);
  if (compactOutput) {
    return compactOutput;
  }
  return compactOneLine(inputPreview);
}

export function buildToolExpandedSections(
  name: string,
  inputPreview: string,
  outputPreview: string,
): ToolExpandedSection[] {
  const sections: ToolExpandedSection[] = [];
  const input = formatToolInput(name, inputPreview);
  if (input) {
    sections.push({
      id: "input",
      label: input.label,
      language: input.language,
      text: input.text,
    });
  }
  const output = formatToolOutput(outputPreview);
  if (output) {
    sections.push({
      id: "output",
      label: "Output",
      language: output.language,
      text: output.text,
    });
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
    return {
      label: isShellTool(normalizeToolName(name)) ? "Command" : "Input",
      language: isShellTool(normalizeToolName(name)) ? "bash" : "text",
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

function primaryToolField(
  toolKey: string,
  record: Record<string, unknown>,
): { field: string; value: string; language: ToolPayloadLanguage } | null {
  const pathFields = ["path", "file_path", "filePath", "filename"];
  const queryFields = ["query", "pattern", "glob", "url"];
  const ordered =
    toolKey === "read" ||
    toolKey.includes("read") ||
    toolKey === "write" ||
    toolKey === "edit" ||
    toolKey.includes("write") ||
    toolKey.includes("str_replace") ||
    toolKey.includes("apply_patch")
      ? [...pathFields, ...queryFields, "command", "cmd"]
      : toolKey.includes("grep") ||
          toolKey.includes("search") ||
          toolKey.includes("glob") ||
          toolKey.includes("find") ||
          toolKey.includes("web") ||
          toolKey.includes("fetch")
        ? [...queryFields, ...pathFields, "command", "cmd"]
        : ["command", "cmd", ...pathFields, ...queryFields];

  for (const field of ordered) {
    const value = record[field];
    if (typeof value === "string" && value.trim()) {
      return {
        field,
        value,
        language: field === "command" || field === "cmd" ? "bash" : "text",
      };
    }
  }
  return null;
}

function labelForField(field: string): string {
  switch (field) {
    case "command":
    case "cmd":
      return "Command";
    case "path":
    case "file_path":
    case "filePath":
    case "filename":
      return "Path";
    case "query":
      return "Query";
    case "pattern":
      return "Pattern";
    case "glob":
      return "Glob";
    case "url":
      return "URL";
    default:
      return capitalizePhrase(field.replace(/_/gu, " "));
  }
}

function normalizeToolName(name: string): string {
  return name.trim().replace(/^mcp__/u, "").replace(/_/gu, " ").toLowerCase();
}

function isShellTool(key: string): boolean {
  return key === "bash" || key === "shell" || key.includes("terminal") || key.includes("exec");
}

function extractPreviewFromPayload(name: string, inputPreview: string): string | null {
  const trimmed = inputPreview.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const key = normalizeToolName(name);
    const candidates = [
      parsed.command,
      parsed.cmd,
      parsed.path,
      parsed.file_path,
      parsed.filePath,
      parsed.filename,
      parsed.query,
      parsed.pattern,
      parsed.url,
      parsed.glob,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return compactOneLine(candidate);
      }
    }
    if (isShellTool(key)) {
      const firstStringValue = Object.values(parsed).find(
        (value) => typeof value === "string" && value.trim(),
      );
      if (typeof firstStringValue === "string") {
        return compactOneLine(firstStringValue);
      }
    }
  } catch {
    // Fall through to raw one-line compacting.
  }
  return compactOneLine(trimmed);
}

function compactOneLine(value: string): string | null {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (!compact) {
    return null;
  }
  return compact.length > 120 ? `${compact.slice(0, 117)}…` : compact;
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
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
