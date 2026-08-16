/**
 * Schema, validation, and LLM envelope for `ask_user_question`.
 * Adapted from juicesharp `@juicesharp/rpiv-ask-user-question` 2.6.0
 * `tool/validate-questionnaire.ts`, `tool/response-envelope.ts`, and `tool/format-answer.ts`
 * (MIT). Reserved labels, structured error codes, and the decline vs host-failure
 * split follow that package; Pho Code does not bake the npm package or pi-tui.
 */
import {
  ASK_USER_MAX_HEADER_CHARS,
  ASK_USER_MAX_LABEL_CHARS,
  ASK_USER_MAX_OPTIONS,
  ASK_USER_MAX_QUESTIONS,
  ASK_USER_MIN_OPTIONS,
  ASK_USER_RESERVED_LABELS,
  ASK_USER_TEXT_FIELD_MAX_BYTES,
  utf8ByteLength,
  type AskUserAnswer,
  type AskUserErrorCode,
  type AskUserQuestion,
  type AskUserQuestionnaireDetails,
} from "@pho-code/protocol";

export const ASK_USER_DECLINE_MESSAGE = "User declined to answer questions";
export const ASK_USER_HOST_FAILURE_MESSAGE =
  "The owner never saw these questions because the questionnaire could not be shown. Do not treat this as a decline. Ask the questions in chat instead.";
export const ASK_USER_ENVELOPE_PREFIX = "User has answered your questions:";
export const ASK_USER_ENVELOPE_SUFFIX = "You can now continue with the user's answers in mind.";
export const ASK_USER_NO_INPUT_PLACEHOLDER = "(no input)";
export const ASK_USER_TYPE_SOMETHING_LABEL = "Type something.";

const RESERVED_LABEL_SET: ReadonlySet<string> = new Set(ASK_USER_RESERVED_LABELS);

export const ERROR_NO_QUESTIONS = "Error: At least one question is required";
export const ERROR_TOO_MANY_QUESTIONS = `Error: At most ${ASK_USER_MAX_QUESTIONS} questions are allowed per invocation`;
export const ERROR_DUPLICATE_QUESTION = "Error: Question text must be unique within an invocation";
export const ERROR_TOO_FEW_OPTIONS = `Error: Each question requires at least ${ASK_USER_MIN_OPTIONS} options`;
export const ERROR_TOO_MANY_OPTIONS = `Error: Each question allows at most ${ASK_USER_MAX_OPTIONS} options`;
export const ERROR_RESERVED_LABEL = `Error: Option label is reserved (${ASK_USER_RESERVED_LABELS.join(", ")})`;
export const ERROR_DUPLICATE_OPTION_LABEL = "Error: Option labels must be unique within a question";
export const ERROR_HEADER_INVALID = `Error: Each question header must be 1–${ASK_USER_MAX_HEADER_CHARS} characters`;
export const ERROR_LABEL_INVALID = `Error: Each option label must be 1–${ASK_USER_MAX_LABEL_CHARS} characters`;
export const ERROR_TEXT_TOO_LONG = `Error: Preview, notes, and custom answers must be at most ${ASK_USER_TEXT_FIELD_MAX_BYTES} bytes`;

export type AskUserValidationResult = { ok: true } | { ok: false; error: AskUserErrorCode; message: string };

export interface AskUserToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: AskUserQuestionnaireDetails;
}

export function validateAskUserQuestionnaire(params: { questions: AskUserQuestion[] }): AskUserValidationResult {
  const questions = params.questions;
  if (questions.length === 0) {
    return { ok: false, error: "no_questions", message: ERROR_NO_QUESTIONS };
  }
  if (questions.length > ASK_USER_MAX_QUESTIONS) {
    return { ok: false, error: "too_many_questions", message: ERROR_TOO_MANY_QUESTIONS };
  }

  const seenQuestions = new Set<string>();
  for (const question of questions) {
    if (seenQuestions.has(question.question)) {
      return { ok: false, error: "duplicate_question", message: ERROR_DUPLICATE_QUESTION };
    }
    seenQuestions.add(question.question);
    const header = question.header.trim();
    if (header.length < 1 || header.length > ASK_USER_MAX_HEADER_CHARS) {
      return { ok: false, error: "header_invalid", message: ERROR_HEADER_INVALID };
    }
    if (question.options.length < ASK_USER_MIN_OPTIONS) {
      return { ok: false, error: "empty_options", message: ERROR_TOO_FEW_OPTIONS };
    }
    if (question.options.length > ASK_USER_MAX_OPTIONS) {
      return { ok: false, error: "too_many_options", message: ERROR_TOO_MANY_OPTIONS };
    }
    const seenLabels = new Set<string>();
    for (const option of question.options) {
      if (RESERVED_LABEL_SET.has(option.label)) {
        return { ok: false, error: "reserved_label", message: ERROR_RESERVED_LABEL };
      }
      if (option.label.trim().length < 1 || option.label.length > ASK_USER_MAX_LABEL_CHARS) {
        return { ok: false, error: "label_invalid", message: ERROR_LABEL_INVALID };
      }
      if (seenLabels.has(option.label)) {
        return { ok: false, error: "duplicate_option_label", message: ERROR_DUPLICATE_OPTION_LABEL };
      }
      seenLabels.add(option.label);
      const oversize =
        utf8ByteLength(option.description) > ASK_USER_TEXT_FIELD_MAX_BYTES ||
        (option.preview !== undefined && utf8ByteLength(option.preview) > ASK_USER_TEXT_FIELD_MAX_BYTES);
      if (oversize) {
        return { ok: false, error: "text_too_long", message: ERROR_TEXT_TOO_LONG };
      }
    }
  }

  return { ok: true };
}

export function buildAskUserToolResult(text: string, details: AskUserQuestionnaireDetails): AskUserToolResult {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

export function buildAskUserDeclineResult(answers: AskUserAnswer[] = []): AskUserToolResult {
  return buildAskUserToolResult(ASK_USER_DECLINE_MESSAGE, { answers, cancelled: true });
}

export function buildAskUserHostFailureResult(error: Extract<AskUserErrorCode, "no_ui" | "host_failure">): AskUserToolResult {
  return buildAskUserToolResult(ASK_USER_HOST_FAILURE_MESSAGE, {
    answers: [],
    cancelled: true,
    error,
  });
}

export function buildAskUserValidationResult(validation: Extract<AskUserValidationResult, { ok: false }>): AskUserToolResult {
  return buildAskUserToolResult(validation.message, {
    answers: [],
    cancelled: true,
    error: validation.error,
  });
}

export function formatAskUserAnswerScalar(answer: AskUserAnswer): string {
  switch (answer.kind) {
    case "multi":
      return answer.selected && answer.selected.length > 0 ? answer.selected.join(", ") : ASK_USER_NO_INPUT_PLACEHOLDER;
    case "custom":
      return answer.answer && answer.answer.length > 0 ? answer.answer : ASK_USER_NO_INPUT_PLACEHOLDER;
    case "option":
      return answer.answer ?? ASK_USER_NO_INPUT_PLACEHOLDER;
    default: {
      const exhaustive: never = answer.kind;
      return exhaustive;
    }
  }
}

export function buildAskUserAnswerSegment(answer: AskUserAnswer): string {
  const parts = [`"${answer.question}"="${formatAskUserAnswerScalar(answer)}"`];
  if (answer.preview && answer.preview.length > 0) {
    parts.push(`selected preview: ${answer.preview}`);
  }
  if (answer.notes && answer.notes.length > 0) {
    parts.push(`user notes: ${answer.notes}`);
  }
  return `${parts.join(". ")}.`;
}

export function buildAskUserQuestionnaireResponse(
  result: AskUserQuestionnaireDetails | null | undefined,
  questions: readonly AskUserQuestion[],
): AskUserToolResult {
  if (!result || result.cancelled) {
    if (result?.error === "no_ui" || result?.error === "host_failure") {
      return buildAskUserHostFailureResult(result.error);
    }
    return buildAskUserDeclineResult(result?.answers ?? []);
  }
  const segments: string[] = [];
  for (let index = 0; index < questions.length; index += 1) {
    const answer = result.answers.find((entry) => entry.questionIndex === index);
    if (answer) {
      segments.push(buildAskUserAnswerSegment(answer));
    }
  }
  if (segments.length === 0) {
    return buildAskUserDeclineResult(result.answers);
  }
  return buildAskUserToolResult(`${ASK_USER_ENVELOPE_PREFIX} ${segments.join(" ")} ${ASK_USER_ENVELOPE_SUFFIX}`, result);
}

export function submittedAnswersMatchQuestions(
  questions: readonly AskUserQuestion[],
  answers: readonly AskUserAnswer[],
): boolean {
  if (answers.length !== questions.length) {
    return false;
  }
  return answers.every((answer, index) => {
    const question = questions[index];
    if (!question || answer.questionIndex !== index || answer.question !== question.question) {
      return false;
    }
    if (answer.notes !== undefined && utf8ByteLength(answer.notes) > ASK_USER_TEXT_FIELD_MAX_BYTES) {
      return false;
    }
    switch (answer.kind) {
      case "option": {
        const option = question.options.find((entry) => entry.label === answer.answer);
        return Boolean(option) && (answer.selected === undefined || answer.selected.length === 0);
      }
      case "custom":
        return (
          typeof answer.answer === "string" &&
          utf8ByteLength(answer.answer) <= ASK_USER_TEXT_FIELD_MAX_BYTES &&
          (answer.selected === undefined || answer.selected.length === 0)
        );
      case "multi":
        return (
          Array.isArray(answer.selected) &&
          answer.selected.every((label) => question.options.some((option) => option.label === label)) &&
          answer.answer === null
        );
      default: {
        const exhaustive: never = answer.kind;
        return exhaustive;
      }
    }
  });
}
