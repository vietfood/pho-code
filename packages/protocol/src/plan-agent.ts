export const ASK_USER_QUESTION_TOOL_NAME = "ask_user_question";
export const UPDATE_PLAN_DOCUMENT_TOOL_NAME = "update_plan_document";
export const TODO_TOOL_NAME = "todo";
export const EXECUTE_PLAN_TOOL_NAME = "execute_plan";

export const SESSION_AGENT_MODES = ["plan", "agent"] as const;
export type SessionAgentMode = (typeof SESSION_AGENT_MODES)[number];

export const PLAN_TODO_STATUSES = ["pending", "in_progress", "completed"] as const;
export type PlanTodoStatus = (typeof PLAN_TODO_STATUSES)[number];

export const PLAN_DOCUMENT_MAX_BYTES = 256 * 1024;
export const PLAN_TODO_MAX_ITEMS = 50;
export const PLAN_TODO_MAX_CONTENT_CHARS = 200;

export interface PlanTodoItem {
  id: string;
  content: string;
  status: PlanTodoStatus;
}

export interface SessionPlanSnapshot {
  mode: SessionAgentMode;
  executing: boolean;
  documentMarkdown: string;
  todos: PlanTodoItem[];
  remainingCount: number;
}

export interface SetSessionModeInput {
  sessionId: string;
  workspaceId?: string;
  mode: SessionAgentMode;
}

export interface UpdateSessionPlanDocumentInput {
  sessionId: string;
  workspaceId?: string;
  documentMarkdown: string;
}

export interface ExecuteSessionPlanInput {
  sessionId: string;
  workspaceId?: string;
}

export function isSessionAgentMode(value: unknown): value is SessionAgentMode {
  return value === "plan" || value === "agent";
}

export function isPlanTodoStatus(value: unknown): value is PlanTodoStatus {
  switch (value) {
    case "pending":
    case "in_progress":
    case "completed":
      return true;
    default:
      return false;
  }
}

export type PlanTodoErrorCode =
  | "too_many_items"
  | "content_too_long"
  | "duplicate_id"
  | "invalid_id"
  | "invalid_content"
  | "too_many_in_progress"
  | "invalid_status"
  | "invalid_list";

export function isPlanTodoItem(value: unknown): value is PlanTodoItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.content === "string" && isPlanTodoStatus(record.status);
}

export function remainingPlanTodoCount(todos: readonly PlanTodoItem[]): number {
  let remaining = 0;
  for (const item of todos) {
    if (item.status === "pending" || item.status === "in_progress") {
      remaining += 1;
    }
  }
  return remaining;
}

export function completedPlanTodoCount(todos: readonly PlanTodoItem[]): number {
  let completed = 0;
  for (const item of todos) {
    if (item.status === "completed") {
      completed += 1;
    }
  }
  return completed;
}

export function inProgressPlanTodo(todos: readonly PlanTodoItem[]): PlanTodoItem | undefined {
  return todos.find((item) => item.status === "in_progress");
}

export function parsePlanTodoList(value: unknown):
  | { ok: true; todos: PlanTodoItem[] }
  | { ok: false; error: PlanTodoErrorCode; message: string } {
  if (!Array.isArray(value)) {
    return { ok: false, error: "invalid_list", message: "todos must be an array. Use todos: [] to clear the list." };
  }
  if (value.length > PLAN_TODO_MAX_ITEMS) {
    return {
      ok: false,
      error: "too_many_items",
      message: `At most ${PLAN_TODO_MAX_ITEMS} todos are allowed.`,
    };
  }
  const todos: PlanTodoItem[] = [];
  const seenIds = new Set<string>();
  let inProgress = 0;
  for (const entry of value) {
    if (!isPlanTodoItem(entry)) {
      if (entry && typeof entry === "object" && !Array.isArray(entry) && !isPlanTodoStatus((entry as { status?: unknown }).status)) {
        return { ok: false, error: "invalid_status", message: 'Each todo status must be "pending", "in_progress", or "completed".' };
      }
      return {
        ok: false,
        error: "invalid_id",
        message: "Each todo needs a string id, string content, and status.",
      };
    }
    const id = entry.id.trim();
    const content = entry.content.trim();
    if (id.length === 0) {
      return { ok: false, error: "invalid_id", message: "Each todo id must be a non-empty string." };
    }
    if (seenIds.has(id)) {
      return { ok: false, error: "duplicate_id", message: `Duplicate todo id "${id}".` };
    }
    if (content.length === 0) {
      return { ok: false, error: "invalid_content", message: "Each todo needs non-empty content." };
    }
    if (content.length > PLAN_TODO_MAX_CONTENT_CHARS) {
      return {
        ok: false,
        error: "content_too_long",
        message: `Todo content must be at most ${PLAN_TODO_MAX_CONTENT_CHARS} characters.`,
      };
    }
    if (entry.status === "in_progress") {
      inProgress += 1;
      if (inProgress > 1) {
        return { ok: false, error: "too_many_in_progress", message: "At most one todo can be in_progress." };
      }
    }
    seenIds.add(id);
    todos.push({ id, content, status: entry.status });
  }
  return { ok: true, todos };
}

export function emptySessionPlanSnapshot(): SessionPlanSnapshot {
  return {
    mode: "agent",
    executing: false,
    documentMarkdown: "",
    todos: [],
    remainingCount: 0,
  };
}

export function planDocumentTooLarge(markdown: string): boolean {
  return utf8ByteLength(markdown) > PLAN_DOCUMENT_MAX_BYTES;
}

export const ASK_USER_MAX_QUESTIONS = 4;
export const ASK_USER_MIN_OPTIONS = 2;
export const ASK_USER_MAX_OPTIONS = 4;
export const ASK_USER_MAX_HEADER_CHARS = 16;
export const ASK_USER_MAX_LABEL_CHARS = 60;
export const ASK_USER_TEXT_FIELD_MAX_BYTES = 8 * 1024;

/** Runtime sentinels plus Claude-parity "Other". Authoring any of these is rejected. */
export const ASK_USER_RESERVED_LABELS = ["Other", "Type something.", "Next"] as const;
export type AskUserReservedLabel = (typeof ASK_USER_RESERVED_LABELS)[number];

export const ASK_USER_OPTION_LETTERS = ["A", "B", "C", "D"] as const;
export type AskUserOptionLetter = (typeof ASK_USER_OPTION_LETTERS)[number];

export type AskUserErrorCode =
  | "no_ui"
  | "host_failure"
  | "no_questions"
  | "empty_options"
  | "too_many_questions"
  | "too_many_options"
  | "duplicate_question"
  | "duplicate_option_label"
  | "reserved_label"
  | "header_invalid"
  | "label_invalid"
  | "text_too_long";

export type AskUserAnswerKind = "option" | "custom" | "multi";

export interface AskUserOption {
  label: string;
  description: string;
  preview?: string;
}

export interface AskUserQuestion {
  question: string;
  header: string;
  options: AskUserOption[];
  multiSelect?: boolean;
}

export interface AskUserAnswer {
  questionIndex: number;
  question: string;
  kind: AskUserAnswerKind;
  answer: string | null;
  selected?: string[];
  notes?: string;
  preview?: string;
}

export interface AskUserQuestionnaireDetails {
  answers: AskUserAnswer[];
  cancelled: boolean;
  error?: AskUserErrorCode;
}

export function askUserOptionLetter(index: number): AskUserOptionLetter | null {
  return ASK_USER_OPTION_LETTERS[index] ?? null;
}

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }
  return bytes;
}

export function isAskUserErrorCode(value: unknown): value is AskUserErrorCode {
  switch (value) {
    case "no_ui":
    case "host_failure":
    case "no_questions":
    case "empty_options":
    case "too_many_questions":
    case "too_many_options":
    case "duplicate_question":
    case "duplicate_option_label":
    case "reserved_label":
    case "header_invalid":
    case "label_invalid":
    case "text_too_long":
      return true;
    default:
      return false;
  }
}

export function isAskUserAnswerKind(value: unknown): value is AskUserAnswerKind {
  switch (value) {
    case "option":
    case "custom":
    case "multi":
      return true;
    default:
      return false;
  }
}

export function isAskUserOption(value: unknown): value is AskUserOption {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.label !== "string" || typeof record.description !== "string") {
    return false;
  }
  if (record.preview !== undefined && typeof record.preview !== "string") {
    return false;
  }
  return true;
}

export function isAskUserQuestion(value: unknown): value is AskUserQuestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.question !== "string" || typeof record.header !== "string") {
    return false;
  }
  if (!Array.isArray(record.options) || !record.options.every(isAskUserOption)) {
    return false;
  }
  if (record.multiSelect !== undefined && typeof record.multiSelect !== "boolean") {
    return false;
  }
  return true;
}

export function isAskUserAnswer(value: unknown): value is AskUserAnswer {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.questionIndex !== "number" || !Number.isInteger(record.questionIndex)) {
    return false;
  }
  if (typeof record.question !== "string" || !isAskUserAnswerKind(record.kind)) {
    return false;
  }
  if (record.answer !== null && typeof record.answer !== "string") {
    return false;
  }
  if (record.selected !== undefined) {
    if (!Array.isArray(record.selected) || !record.selected.every((entry) => typeof entry === "string")) {
      return false;
    }
  }
  if (record.notes !== undefined && typeof record.notes !== "string") {
    return false;
  }
  if (record.preview !== undefined && typeof record.preview !== "string") {
    return false;
  }
  return true;
}

export function parseAskUserQuestions(value: unknown): AskUserQuestion[] | null {
  if (!Array.isArray(value) || !value.every(isAskUserQuestion)) {
    return null;
  }
  return value;
}

export function parseAskUserAnswers(value: unknown): AskUserAnswer[] | null {
  if (!Array.isArray(value) || !value.every(isAskUserAnswer)) {
    return null;
  }
  return value;
}
