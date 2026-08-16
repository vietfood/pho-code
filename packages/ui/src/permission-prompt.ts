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
  const action = summarizeAction(input);
  if (input.agent) {
    return `Agent '${input.agent}' wants to ${action}`;
  }
  return capitalizeSentence(action);
}

function capitalizeSentence(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value[0]!.toUpperCase() + value.slice(1);
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
        ? "run a shell command that reaches outside the workspace."
        : "run a shell command.";
    case "skill":
      return `load the skill “${input.name}”.`;
    case "access to skill":
      return `read files for the skill “${input.name}”.`;
    case "MCP target":
      return `call MCP tool “${input.name}”.`;
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
    return "access a file path.";
  }
  if (allow?.includes("external directory")) {
    return "use a path outside the workspace.";
  }
  if (key === "bash" || key === "shell") {
    return "run a shell command.";
  }
  if (key.includes("fetch") || key.includes("web search")) {
    return summarizeFetchAction(key, target);
  }
  if (key.includes("search") || key.includes("grep") || key.includes("find") || key === "ls") {
    return "search the workspace.";
  }
  if (key === "read" || key.includes("read ")) {
    return "read a file.";
  }
  if (key === "write" || key.includes("write ")) {
    return "write a file.";
  }
  if (key === "edit" || key.includes("edit") || key.includes("str replace")) {
    return "edit a file.";
  }
  if (key.includes("trash")) {
    return "move a file to Trash.";
  }
  if (key.startsWith("github")) {
    return `use GitHub (${name}).`;
  }
  return `use the “${name}” tool.`;
}

function summarizeFetchAction(key: string, target: PermissionPromptTarget | null): string {
  if (key.includes("search")) {
    return "search the web.";
  }
  const origin = target?.label === "URL" ? fetchOrigin(target.value) : null;
  if (origin) {
    return `fetch a file from ${origin}.`;
  }
  return "fetch content from the web.";
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

export const PERMISSION_APPROVE_ONCE = "Yes";
export const PERMISSION_DENY = "No";
export const PERMISSION_DENY_WITH_REASON = "No, provide reason";

export interface PermissionChoice {
  label: string;
  value: string;
}

/**
 * Permission-system RPC options are verbose Yes/No pairs. Collapse them to
 * Allow once / Allow for this session / No, provide reason for the dock card.
 */
export function presentPermissionChoices(options: readonly string[]): PermissionChoice[] {
  if (!isPermissionDecisionOptions(options)) {
    return options.map((value) => ({ label: value, value }));
  }
  return [
    { label: "Allow once", value: PERMISSION_APPROVE_ONCE },
    { label: "Allow for this session", value: options[1] ?? "Yes, for this session" },
    { label: PERMISSION_DENY_WITH_REASON, value: PERMISSION_DENY_WITH_REASON },
  ];
}

export function isPermissionDecisionOptions(options: readonly string[]): boolean {
  return (
    options.length === 4 &&
    options[0] === PERMISSION_APPROVE_ONCE &&
    options[2] === PERMISSION_DENY &&
    options[3] === PERMISSION_DENY_WITH_REASON &&
    typeof options[1] === "string" &&
    options[1].length > 0
  );
}

export function permissionSelectResolution(
  selected: string,
  reason: string,
): { selected: string; value?: string } {
  if (selected === PERMISSION_DENY_WITH_REASON) {
    return { selected, value: reason };
  }
  return { selected };
}
