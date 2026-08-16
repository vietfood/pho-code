import {
  ASK_USER_QUESTION_TOOL_NAME,
  EXECUTE_PLAN_TOOL_NAME,
  TODO_TOOL_NAME,
  UPDATE_PLAN_DOCUMENT_TOOL_NAME,
  isSessionAgentMode,
  remainingPlanTodoCount,
  type PlanTodoItem,
  type SessionAgentMode,
  type SessionPlanSnapshot,
} from "@pho-code/protocol";
import { TRASH_TOOL_NAME } from "./trash-target";

export const PLAN_AGENT_CUSTOM_TYPE = "pho-code.plan-agent";
export const PLAN_EXECUTE_CUSTOM_TYPE = "pho-code.plan-execute";

export const PLAN_WRITE_TOOL_NAMES = ["write", "edit", TRASH_TOOL_NAME] as const;
const PLAN_WRITE_TOOL_SET: ReadonlySet<string> = new Set(PLAN_WRITE_TOOL_NAMES);
const PLAN_ALWAYS_TOOLS = [ASK_USER_QUESTION_TOOL_NAME, TODO_TOOL_NAME] as const;
const PLAN_MODE_TOOLS = [UPDATE_PLAN_DOCUMENT_TOOL_NAME, EXECUTE_PLAN_TOOL_NAME] as const;

export const PLAN_EXECUTE_PROMPT =
  "Execute the plan in the hidden plan document. File write and edit tools are available again. Tracked writes still go through change review. Shell is not sandboxed.";

export function isHiddenPlanExecutePrompt(text: string): boolean {
  return text === PLAN_EXECUTE_PROMPT;
}

export interface PlanAgentCustomEntry {
  type: string;
  customType?: string;
  data?: unknown;
}

export interface PlanAgentRecord {
  mode: SessionAgentMode;
  executing: boolean;
  documentMarkdown: string;
}

export function emptyPlanAgentRecord(): PlanAgentRecord {
  return {
    mode: "agent",
    executing: false,
    documentMarkdown: "",
  };
}

export function beginPlanExecuteRecord(current: PlanAgentRecord): PlanAgentRecord {
  return {
    mode: "agent",
    executing: true,
    documentMarkdown: current.documentMarkdown,
  };
}

export function isCursorSdkToolName(name: string): boolean {
  return name === "cursor" || name.startsWith("cursor_");
}

export function isPlanForbiddenTool(name: string): boolean {
  return PLAN_WRITE_TOOL_SET.has(name) || isCursorSdkToolName(name);
}

export function writesOffInPlan(record: PlanAgentRecord | undefined): boolean {
  return record?.mode === "plan" && record.executing !== true;
}

export type PlanExecuteRefusal = "already_executing" | "not_in_plan";

export function planExecuteRefusal(record: PlanAgentRecord): PlanExecuteRefusal | undefined {
  if (record.executing) {
    return "already_executing";
  }
  if (!writesOffInPlan(record)) {
    return "not_in_plan";
  }
  return undefined;
}

export function planExecuteRefusalMessage(reason: PlanExecuteRefusal): string {
  switch (reason) {
    case "already_executing":
      return "Execute is already running.";
    case "not_in_plan":
      return "execute_plan is available in Plan mode only. The owner can click Execute on the Plan surface, or switch to Plan first.";
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

export function formatPlanTodoLines(todos: readonly PlanTodoItem[]): string {
  return todos.map((item) => `- [${item.status}] ${item.id}: ${item.content}`).join("\n");
}

export function planExecuteStartedMessage(remainingTodos: readonly PlanTodoItem[]): string {
  const remainingBlock =
    remainingTodos.length > 0
      ? `Remaining todo steps:\n\n${formatPlanTodoLines(remainingTodos)}`
      : "No remaining todos; follow the Plan document.";
  return `Execute started. File write and edit tools are available. Tracked writes still go through change review. Shell is not sandboxed.\n\n${remainingBlock}`;
}

export function planExecuteFinishedByTodos(record: PlanAgentRecord, todos: readonly PlanTodoItem[]): boolean {
  return record.executing && remainingPlanTodoCount(todos) === 0;
}

export function intersectPlanActiveTools(input: {
  registeredNames: readonly string[];
  contextEnabledNames: readonly string[] | undefined;
  mode: SessionAgentMode;
  executing: boolean;
}): string[] {
  const registered = new Set(input.registeredNames);
  const contextEnabled = input.contextEnabledNames
    ? new Set(input.contextEnabledNames.filter((name) => registered.has(name)))
    : registered;
  const writesOff = input.mode === "plan" && !input.executing;
  const names: string[] = [];
  for (const name of input.registeredNames) {
    if (!contextEnabled.has(name)) {
      continue;
    }
    if (writesOff && isPlanForbiddenTool(name)) {
      continue;
    }
    if (!writesOff && name === EXECUTE_PLAN_TOOL_NAME) {
      continue;
    }
    names.push(name);
  }
  const extras = writesOff ? [...PLAN_ALWAYS_TOOLS, ...PLAN_MODE_TOOLS] : [...PLAN_ALWAYS_TOOLS];
  for (const name of extras) {
    if (registered.has(name) && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

export function collectPlanAgentRecord(entries: readonly unknown[]): PlanAgentRecord | undefined {
  let current: PlanAgentRecord | undefined;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as PlanAgentCustomEntry;
    if (record.type !== "custom" || record.customType !== PLAN_AGENT_CUSTOM_TYPE) {
      continue;
    }
    const parsed = parsePlanAgentRecord(record.data);
    if (parsed) {
      current = parsed;
    }
  }
  return current;
}

export function projectSessionPlan(
  record: PlanAgentRecord | undefined,
  todos: readonly PlanTodoItem[] = [],
): SessionPlanSnapshot {
  const list = [...todos];
  return {
    mode: record?.mode ?? "agent",
    executing: record?.executing === true,
    documentMarkdown: record?.documentMarkdown ?? "",
    todos: list,
    remainingCount: remainingPlanTodoCount(list),
  };
}

export function planModeContextMessage(documentMarkdown: string): string {
  const document = documentMarkdown.trim();
  return `[PLAN MODE ACTIVE]
You are in Plan mode. This is a tool-set policy, not a sandbox.

Restrictions:
- Built-in write, edit, and move_to_trash tools are disabled, including under YOLO.
- Cursor SDK tools are disabled until they are proven read-only.
- Bash and other remaining tools stay available and still go through permission dialogs. Shell is not boxed.

Use ask_user_question when requirements are ambiguous.
Use todo to track remaining steps; Execute reads that same list.
Write or replace the Plan document with update_plan_document. That sidebar document is the source of truth for Execute — do not rely on a "Plan:" heading in chat.
When the owner asks to execute, implement, or go ahead with the plan, call execute_plan. Do not start write or edit until that tool succeeds or the owner clicks Execute. Do not call execute_plan unprompted.

${document.length > 0 ? `Current plan document:\n\n${document}` : "The plan document is empty. Explore, ask, and write it before the owner Executes."}`;
}

export function planExecuteContextMessage(
  documentMarkdown: string,
  remainingTodos: readonly PlanTodoItem[] = [],
): string {
  const document = documentMarkdown.trim();
  const remainingBlock =
    remainingTodos.length > 0
      ? `Remaining todo steps (source of truth for this Execute run):\n\n${formatPlanTodoLines(remainingTodos)}`
      : "";
  const documentBlock =
    document.length > 0
      ? `Plan document:\n\n${document}`
      : remainingTodos.length > 0
        ? ""
        : "The plan document is empty. Use the conversation for remaining steps.";
  return `[EXECUTING PLAN]
File write and edit tools are restored for this run. Tracked writes still go through change review. Shell is not sandboxed.

${[remainingBlock, documentBlock].filter((block) => block.length > 0).join("\n\n")}`;
}

function parsePlanAgentRecord(value: unknown): PlanAgentRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as {
    mode?: unknown;
    executing?: unknown;
    documentMarkdown?: unknown;
  };
  if (!isSessionAgentMode(candidate.mode)) {
    return undefined;
  }
  if (typeof candidate.executing !== "boolean" || typeof candidate.documentMarkdown !== "string") {
    return undefined;
  }
  return {
    mode: candidate.mode,
    executing: candidate.executing,
    documentMarkdown: candidate.documentMarkdown,
  };
}
