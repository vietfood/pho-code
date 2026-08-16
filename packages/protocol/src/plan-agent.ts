export const ASK_USER_QUESTION_TOOL_NAME = "ask_user_question";

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
