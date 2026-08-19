import path from "node:path";
import {
  agentsSectionId,
  DEFAULT_CONTEXT_PROMPT_PREAMBLE,
  parseSessionKeyId,
  PI_DOCS_SECTION_BODY,
  PI_DOCS_SECTION_ID,
  sessionKeyId,
  toolSectionId,
  type ContextPromptSection,
  type SessionContextPrompt,
} from "@pho-code/protocol";

export const CONTEXT_PROMPT_CUSTOM_TYPE = "pho-code.context-prompt";

export interface ContextPromptCustomEntry {
  type: string;
  customType?: string;
  data?: unknown;
}

export interface ContextPromptCustomRecord {
  preamble: string;
  disabledSectionIds: string[];
  compiled: string;
  sections: ContextPromptSection[];
}

export interface ToolPromptSource {
  name: string;
  label?: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
}

export interface AgentsFileSource {
  path: string;
  content: string;
}

export function relativizeAgentsPath(filePath: string, cwd: string): string {
  const relative = path.relative(path.resolve(cwd), path.resolve(filePath)).split(path.sep).join("/");
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    return path.basename(filePath);
  }
  return relative;
}

export function toolSectionBody(tool: ToolPromptSource): string {
  const lines = [];
  if (tool.promptSnippet?.trim()) {
    lines.push(tool.promptSnippet.trim());
  }
  if (tool.description.trim()) {
    lines.push(tool.description.trim());
  }
  const guidelines = (tool.promptGuidelines ?? []).map((item) => item.trim()).filter((item) => item.length > 0);
  if (guidelines.length > 0) {
    lines.push(`Guidelines:\n${guidelines.map((item) => `- ${item}`).join("\n")}`);
  }
  return lines.join("\n\n");
}

export function liveContextPromptSections(
  cwd: string,
  tools: readonly ToolPromptSource[],
  agentsFiles: readonly AgentsFileSource[],
): ContextPromptSection[] {
  const sections: ContextPromptSection[] = [];
  for (const file of agentsFiles) {
    const relative = relativizeAgentsPath(file.path, cwd);
    sections.push({
      id: agentsSectionId(relative),
      kind: "agents",
      title: path.basename(relative),
      enabled: true,
      body: file.content,
    });
  }
  for (const tool of tools) {
    sections.push({
      id: toolSectionId(tool.name),
      kind: "tool",
      title: tool.label?.trim() || tool.name,
      enabled: true,
      body: toolSectionBody(tool),
    });
  }
  sections.push({
    id: PI_DOCS_SECTION_ID,
    kind: "optional",
    title: "Pi docs",
    enabled: true,
    body: PI_DOCS_SECTION_BODY,
  });
  return sections;
}

export function applyDisabledSectionIds(
  sections: readonly ContextPromptSection[],
  disabledSectionIds: readonly string[],
): ContextPromptSection[] {
  const disabled = new Set(disabledSectionIds);
  return sections.map((section) => ({ ...section, enabled: !disabled.has(section.id) }));
}

export function compileContextPrompt(input: {
  preamble: string;
  sections: readonly ContextPromptSection[];
  cwd: string;
}): string {
  const preamble = input.preamble.trim() || DEFAULT_CONTEXT_PROMPT_PREAMBLE;
  const enabled = input.sections.filter((section) => section.enabled);
  const tools = enabled.filter((section) => section.kind === "tool");
  const agents = enabled.filter((section) => section.kind === "agents");
  const docs = enabled.find((section) => section.id === PI_DOCS_SECTION_ID);
  const toolLines = tools
    .map((section) => {
      const firstLine = section.body.split("\n").find((line) => line.trim().length > 0)?.trim();
      return firstLine ? `- ${parseToolTitle(section)}: ${firstLine}` : `- ${parseToolTitle(section)}`;
    })
    .join("\n");
  const guidelines = uniqueGuidelines(enabled);
  const parts = [preamble];
  parts.push(`Available tools:\n${toolLines.length > 0 ? toolLines : "(none)"}`);
  parts.push("In addition to the tools above, you may have access to other custom tools depending on the project.");
  parts.push(`Guidelines:\n${guidelines.map((item) => `- ${item}`).join("\n")}`);
  if (docs) {
    parts.push(docs.body.trim());
  }
  if (agents.length > 0) {
    let context = "<project_context>\n\nProject-specific instructions and guidelines:\n\n";
    for (const file of agents) {
      const relative = file.id.startsWith("agents:") ? file.id.slice("agents:".length) : file.title;
      context += `<project_instructions path="${relative}">\n${file.body}\n</project_instructions>\n\n`;
    }
    context += "</project_context>";
    parts.push(context);
  }
  parts.push(`Current working directory: ${input.cwd.replace(/\\/g, "/")}`);
  return parts.join("\n\n");
}

export function projectSessionContextPrompt(input: {
  cwd: string;
  tools: readonly ToolPromptSource[];
  agentsFiles: readonly AgentsFileSource[];
  liveSystemPrompt: string;
  record: ContextPromptCustomRecord | undefined;
  editable: boolean;
}): SessionContextPrompt {
  const liveSections = liveContextPromptSections(input.cwd, input.tools, input.agentsFiles);
  const defaults = { defaultPreamble: DEFAULT_CONTEXT_PROMPT_PREAMBLE };
  if (!input.record) {
    return {
      ...defaults,
      customized: false,
      editable: input.editable,
      preamble: DEFAULT_CONTEXT_PROMPT_PREAMBLE,
      sections: liveSections,
      compiled: input.liveSystemPrompt.trim() || DEFAULT_CONTEXT_PROMPT_PREAMBLE,
    };
  }
  if (!input.editable) {
    return {
      ...defaults,
      customized: true,
      editable: false,
      preamble: input.record.preamble,
      sections: input.record.sections,
      compiled: input.record.compiled,
    };
  }
  const sections = applyDisabledSectionIds(liveSections, input.record.disabledSectionIds);
  return {
    ...defaults,
    customized: true,
    editable: true,
    preamble: input.record.preamble,
    sections,
    compiled: compileContextPrompt({
      preamble: input.record.preamble,
      sections,
      cwd: input.cwd,
    }),
  };
}

export function lookupCompiledContextPrompt(
  compiledByKey: ReadonlyMap<string, string>,
  input: { cwd: string; sessionId: string },
): string | undefined {
  const exact = compiledByKey.get(sessionKeyId({ workspaceId: input.cwd, sessionId: input.sessionId }));
  if (exact !== undefined) {
    return exact;
  }
  for (const [key, value] of compiledByKey) {
    const parsed = parseSessionKeyId(key);
    if (parsed?.sessionId === input.sessionId) {
      return value;
    }
  }
  return undefined;
}

export function collectContextPromptRecord(
  entries: readonly ContextPromptCustomEntry[],
): ContextPromptCustomRecord | undefined {
  let current: ContextPromptCustomRecord | undefined;
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== CONTEXT_PROMPT_CUSTOM_TYPE) {
      continue;
    }
    const parsed = parseContextPromptRecord(entry.data);
    if (parsed === "reset") {
      current = undefined;
      continue;
    }
    if (parsed) {
      current = parsed;
    }
  }
  return current;
}

export function enabledToolNames(sections: readonly ContextPromptSection[]): string[] {
  const names: string[] = [];
  for (const section of sections) {
    if (section.kind !== "tool" || !section.enabled) {
      continue;
    }
    const name = parseToolTitle(section);
    if (name) {
      names.push(name);
    }
  }
  return names;
}

function parseContextPromptRecord(value: unknown): ContextPromptCustomRecord | "reset" | undefined {
  if (value === null) {
    return "reset";
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as {
    reset?: unknown;
    preamble?: unknown;
    disabledSectionIds?: unknown;
    compiled?: unknown;
    sections?: unknown;
  };
  if (candidate.reset === true) {
    return "reset";
  }
  if (typeof candidate.preamble !== "string" || typeof candidate.compiled !== "string") {
    return undefined;
  }
  if (!Array.isArray(candidate.disabledSectionIds) || !candidate.disabledSectionIds.every((id) => typeof id === "string")) {
    return undefined;
  }
  if (!Array.isArray(candidate.sections)) {
    return undefined;
  }
  const sections: ContextPromptSection[] = [];
  for (const item of candidate.sections) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const section = item as {
      id?: unknown;
      kind?: unknown;
      title?: unknown;
      enabled?: unknown;
      body?: unknown;
    };
    if (
      typeof section.id !== "string" ||
      (section.kind !== "agents" && section.kind !== "tool" && section.kind !== "optional") ||
      typeof section.title !== "string" ||
      typeof section.body !== "string" ||
      typeof section.enabled !== "boolean"
    ) {
      continue;
    }
    sections.push({
      id: section.id,
      kind: section.kind,
      title: section.title,
      enabled: section.enabled,
      body: section.body,
    });
  }
  return {
    preamble: candidate.preamble,
    disabledSectionIds: [...candidate.disabledSectionIds],
    compiled: candidate.compiled,
    sections,
  };
}

function parseToolTitle(section: ContextPromptSection): string {
  return section.id.startsWith("tool:") ? section.id.slice("tool:".length) : section.title;
}

function uniqueGuidelines(sections: readonly ContextPromptSection[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const add = (item: string) => {
    const trimmed = item.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    result.push(trimmed);
  };
  for (const section of sections) {
    if (section.kind !== "tool" || !section.enabled) {
      continue;
    }
    const block = section.body.split("Guidelines:\n")[1];
    if (!block) {
      continue;
    }
    for (const line of block.split("\n")) {
      const match = line.match(/^-\s+(.*)$/u);
      if (match?.[1]) {
        add(match[1]);
      }
    }
  }
  add("Be concise in your responses");
  add("Show file paths clearly when working with files");
  return result;
}
