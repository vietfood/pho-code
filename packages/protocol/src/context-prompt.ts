export const CONTEXT_PROMPT_SECTION_KINDS = ["agents", "tool", "optional"] as const;

export type ContextPromptSectionKind = (typeof CONTEXT_PROMPT_SECTION_KINDS)[number];

export const PI_DOCS_SECTION_ID = "optional:pi-docs";

export const DEFAULT_CONTEXT_PROMPT_PREAMBLE =
  "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.";

export const PI_DOCS_SECTION_BODY = `Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- When asked about: extensions, themes, skills, prompt templates, TUI components, keybindings, SDK integrations, custom providers, adding models, pi packages, environment variables
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs`;

/** Same bound as assistant rewrite; the compiled prompt may be larger from context files. */
export const MAX_CONTEXT_PROMPT_PREAMBLE_CHARS = 100_000;

export interface ContextPromptSection {
  id: string;
  kind: ContextPromptSectionKind;
  title: string;
  enabled: boolean;
  body: string;
}

/** One compiled system prompt A for this session, plus the structured editor projection. */
export interface SessionContextPrompt {
  customized: boolean;
  editable: boolean;
  preamble: string;
  defaultPreamble: string;
  sections: ContextPromptSection[];
  compiled: string;
}

export interface UpdateSessionContextPromptInput {
  backendId?: string;
  sessionId: string;
  workspaceId?: string;
  preamble?: string;
  disabledSectionIds?: string[];
  reset?: boolean;
}

export function toolSectionId(name: string): string {
  return `tool:${name}`;
}

export function agentsSectionId(relativePath: string): string {
  return `agents:${relativePath}`;
}

export function emptySessionContextPrompt(): SessionContextPrompt {
  return {
    customized: false,
    editable: true,
    preamble: DEFAULT_CONTEXT_PROMPT_PREAMBLE,
    defaultPreamble: DEFAULT_CONTEXT_PROMPT_PREAMBLE,
    sections: [],
    compiled: DEFAULT_CONTEXT_PROMPT_PREAMBLE,
  };
}
