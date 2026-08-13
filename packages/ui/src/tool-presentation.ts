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

export function buildToolExpandedBody(inputPreview: string, outputPreview: string): string | null {
  const blocks: string[] = [];
  if (inputPreview.trim()) {
    blocks.push(inputPreview.trim());
  }
  if (outputPreview.trim()) {
    blocks.push(outputPreview.trim());
  }
  return blocks.length > 0 ? blocks.join("\n\n") : null;
}

function normalizeToolName(name: string): string {
  return name.trim().replace(/^mcp__/u, "").replace(/_/gu, " ").toLowerCase();
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
    if (key.includes("bash") || key.includes("shell")) {
      const firstString = Object.values(parsed).find((value) => typeof value === "string" && value.trim());
      if (typeof firstString === "string") {
        return compactOneLine(firstString);
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
