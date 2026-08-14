import { describeToolInputTarget, prettyToolInputJson } from "./tool-presentation";

export interface PermissionPromptTarget {
  label: string;
  value: string;
}

export interface PermissionPromptPresentation {
  summary: string;
  target: PermissionPromptTarget | null;
  caution: string | null;
  showRaw: boolean;
  rawDetail: string;
}

const ASK_KINDS = ["bash command", "tool", "MCP target", "skill", "access to skill"] as const;
type AskKind = (typeof ASK_KINDS)[number];

const ASK_PATTERN =
  /^(Current agent|Agent '(?<agent>[^']+)') requested (?<kind>bash command|tool|MCP target|skill|access to skill) '(?<name>[^']+)'(?<rest>.*)$/su;

export function presentPermissionMessage(message: string): PermissionPromptPresentation {
  const trimmed = message.trim();
  if (!trimmed) {
    return { summary: "", target: null, caution: null, showRaw: false, rawDetail: "" };
  }
  if (isFollowUpPrompt(trimmed)) {
    return { summary: trimmed, target: null, caution: null, showRaw: false, rawDetail: trimmed };
  }

  const parsed = parsePermissionAsk(trimmed);
  if (!parsed) {
    if (looksLikeDumpedRequest(trimmed)) {
      const json = extractInlineJson(trimmed);
      return {
        summary: "The agent requested an action that needs your approval.",
        target: describeToolInputTarget("", json ?? ""),
        caution: null,
        showRaw: true,
        rawDetail: prettyRawDetail(json, trimmed),
      };
    }
    return { summary: trimmed, target: null, caution: null, showRaw: false, rawDetail: trimmed };
  }

  return {
    summary: parsed.summary,
    target: parsed.target,
    caution: parsed.caution,
    showRaw: true,
    rawDetail: parsed.rawDetail,
  };
}

function isFollowUpPrompt(message: string): boolean {
  return (
    message.startsWith("Apply this session grant") || message.startsWith("Share why this request was denied")
  );
}

function looksLikeDumpedRequest(message: string): boolean {
  return /with input\s+[`{]/u.test(message) || (message.includes("{") && message.length > 160);
}

function parsePermissionAsk(message: string): {
  summary: string;
  target: PermissionPromptTarget | null;
  caution: string | null;
  rawDetail: string;
} | null {
  const match = ASK_PATTERN.exec(message);
  if (!match?.groups) {
    return null;
  }
  const kind = asAskKind(match.groups.kind);
  const name = match.groups.name;
  const agent = match.groups.agent;
  if (!kind || !name) {
    return null;
  }

  const { rest, allow } = splitAllowSuffix(match.groups.rest ?? "");
  const json = extractInlineJson(rest);
  const target = specificTarget(
    name,
    describeToolInputTarget(name, json ?? "") ?? targetFromAsk({ kind, name, rest }),
  );
  const caution = cautionFromAsk(rest, allow);
  const summary = summarizeAsk({ kind, name, agent, allow, target });
  return {
    summary,
    target,
    caution,
    rawDetail: prettyRawDetail(json, message),
  };
}

function asAskKind(value: string | undefined): AskKind | null {
  if (!value) {
    return null;
  }
  return ASK_KINDS.includes(value as AskKind) ? (value as AskKind) : null;
}

function splitAllowSuffix(rest: string): { rest: string; allow: string | null } {
  const match = rest.match(/^(.*)\.\s+(Allow this .+)$/su);
  if (!match) {
    return { rest: rest.trim(), allow: null };
  }
  return { rest: (match[1] ?? "").trim(), allow: match[2] ?? null };
}

function extractInlineJson(value: string): string | null {
  const match = /with input\s+`?(\{[\s\S]*?)`?(?=\s*\.\s+Allow this |\s*$)/u.exec(value);
  const json = match?.[1]?.trim();
  if (!json) {
    return null;
  }
  return json.replace(/[.…]+$/u, (ending) => (ending.includes("…") ? "…" : ending));
}

function specificTarget(
  name: string,
  target: PermissionPromptTarget | null,
): PermissionPromptTarget | null {
  if (!target) {
    return null;
  }
  if (target.value === name && (target.label === "Tool" || target.label === "Skill" || target.label === "MCP")) {
    return null;
  }
  return target;
}

function prettyRawDetail(json: string | null, fallback: string): string {
  if (!json) {
    return fallback;
  }
  return prettyToolInputJson(json) ?? json;
}

function targetFromAsk(input: { kind: AskKind; name: string; rest: string }): PermissionPromptTarget | null {
  switch (input.kind) {
    case "bash command": {
      const fullCommand = quotedAfter(input.rest, "full command:");
      return { label: "Command", value: fullCommand ?? input.name };
    }
    case "access to skill": {
      const via = quotedAfter(input.rest, "via");
      return via ? { label: "Path", value: via } : { label: "Skill", value: input.name };
    }
    case "skill":
      return { label: "Skill", value: input.name };
    case "MCP target":
      return { label: "MCP", value: compactRemainder(input.rest) ?? input.name };
    case "tool": {
      const path = quotedAfter(input.rest, "path") ?? quotedAfter(input.rest, "for");
      if (path) {
        return { label: "Path", value: path };
      }
      const pattern = quotedAfter(input.rest, "pattern");
      if (pattern) {
        return { label: "Pattern", value: pattern };
      }
      return { label: "Tool", value: input.name };
    }
    default: {
      const exhaustive: never = input.kind;
      return exhaustive;
    }
  }
}

function cautionFromAsk(rest: string, allow: string | null): string | null {
  if (allow?.includes("external directory") || rest.includes("outside working directory")) {
    const cwd = quotedAfter(rest, "outside working directory");
    return cwd
      ? `This path is outside the working directory (${cwd}).`
      : "This path is outside the working directory.";
  }
  return null;
}

function summarizeAsk(input: {
  kind: AskKind;
  name: string;
  agent?: string;
  allow: string | null;
  target: PermissionPromptTarget | null;
}): string {
  const who = input.agent ? `Agent '${input.agent}'` : "The agent";
  return `${who} ${summarizeAction(input)}`;
}

function summarizeAction(input: {
  kind: AskKind;
  name: string;
  allow: string | null;
  target: PermissionPromptTarget | null;
}): string {
  switch (input.kind) {
    case "bash command":
      return input.allow?.includes("external directory")
        ? "wants to run a shell command that reaches outside the workspace."
        : "wants to run a shell command.";
    case "skill":
      return `wants to load the skill “${input.name}”.`;
    case "access to skill":
      return `wants to read files for the skill “${input.name}”.`;
    case "MCP target":
      return `wants to call MCP tool “${input.name}”.`;
    case "tool":
      return summarizeToolAction(input.name, input.target, input.allow);
    default: {
      const exhaustive: never = input.kind;
      return exhaustive;
    }
  }
}

function summarizeToolAction(
  name: string,
  target: PermissionPromptTarget | null,
  allow: string | null,
): string {
  const key = name.trim().toLowerCase();
  if (allow?.includes("path access")) {
    return "wants to access a file path.";
  }
  if (allow?.includes("external directory")) {
    return "wants to use a path outside the workspace.";
  }
  if (key === "bash" || key === "shell") {
    return "wants to run a shell command.";
  }
  if (key.includes("fetch") || key.includes("web search")) {
    return summarizeFetchAction(key, target);
  }
  if (key.includes("search") || key.includes("grep") || key.includes("find") || key === "ls") {
    return "wants to search the workspace.";
  }
  if (key === "read" || key.includes("read ")) {
    return "wants to read a file.";
  }
  if (key === "write" || key.includes("write ")) {
    return "wants to write a file.";
  }
  if (key === "edit" || key.includes("edit") || key.includes("str replace")) {
    return "wants to edit a file.";
  }
  if (key.includes("trash")) {
    return "wants to move a file to Trash.";
  }
  if (key.startsWith("github")) {
    return `wants to use GitHub (${name}).`;
  }
  return `wants to use the “${name}” tool.`;
}

function summarizeFetchAction(key: string, target: PermissionPromptTarget | null): string {
  if (key.includes("search")) {
    return "wants to search the web.";
  }
  const origin = target?.label === "URL" ? fetchOrigin(target.value) : null;
  if (origin) {
    return `wants to fetch a file from ${origin}.`;
  }
  return "wants to fetch content from the web.";
}

function fetchOrigin(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./u, "");
    if (host === "github.com" || host === "raw.githubusercontent.com" || host === "gist.github.com") {
      return "GitHub";
    }
    if (host === "youtube.com" || host === "youtu.be") {
      return "YouTube";
    }
    return host || null;
  } catch {
    if (/github\.com|raw\.githubusercontent\.com/u.test(url)) {
      return "GitHub";
    }
    return null;
  }
}

function quotedAfter(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`${escaped}\\s+'([^']+)'`, "u").exec(text);
  return match?.[1] ?? null;
}

function compactRemainder(rest: string): string | null {
  const compact = rest.replace(/^with\s+/u, "").replace(/\s+/gu, " ").trim();
  return compact.length > 0 ? compact : null;
}
