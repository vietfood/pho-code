import {
  ASK_USER_OPTION_LETTERS,
  askUserOptionLetter,
  type AskUserAnswer,
  type AskUserQuestion,
} from "@pho-code/protocol";

export type AskUserCardPhase = "question" | "review";

export interface AskUserDraft {
  selectedLabels: string[];
  customText: string;
  notes: string;
}

export function emptyAskUserDraft(): AskUserDraft {
  return { selectedLabels: [], customText: "", notes: "" };
}

export function createAskUserDrafts(count: number): AskUserDraft[] {
  return Array.from({ length: count }, () => emptyAskUserDraft());
}

export function shortcutOptionIndex(key: string, optionCount: number): number | null {
  const letter = key.length === 1 ? key.toUpperCase() : "";
  const letterIndex = ASK_USER_OPTION_LETTERS.indexOf(letter as (typeof ASK_USER_OPTION_LETTERS)[number]);
  if (letterIndex >= 0 && letterIndex < optionCount) {
    return letterIndex;
  }
  if (/^[1-4]$/.test(key)) {
    const digitIndex = Number.parseInt(key, 10) - 1;
    if (digitIndex >= 0 && digitIndex < optionCount) {
      return digitIndex;
    }
  }
  return null;
}

/** Letter/digit option shortcuts must not fire while the owner is typing a custom answer. */
export function isAskUserTextEntryTarget(tagName: string, inputType?: string, contentEditable?: boolean): boolean {
  if (contentEditable === true) {
    return true;
  }
  const tag = tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") {
    return true;
  }
  if (tag !== "input") {
    return false;
  }
  const type = (inputType ?? "text").toLowerCase();
  switch (type) {
    case "checkbox":
    case "radio":
    case "button":
    case "submit":
    case "reset":
    case "file":
    case "hidden":
      return false;
    default:
      return true;
  }
}

export function isAskUserDraftAnswered(question: AskUserQuestion, draft: AskUserDraft): boolean {
  if (draft.customText.trim().length > 0) {
    return true;
  }
  if (question.multiSelect) {
    return draft.selectedLabels.length > 0;
  }
  return draft.selectedLabels.length === 1;
}

export function unansweredAskUserHeaders(questions: readonly AskUserQuestion[], drafts: readonly AskUserDraft[]): string[] {
  return questions.flatMap((question, index) => {
    const draft = drafts[index] ?? emptyAskUserDraft();
    return isAskUserDraftAnswered(question, draft) ? [] : [question.header];
  });
}

export function canSubmitAskUserCard(
  questions: readonly AskUserQuestion[],
  drafts: readonly AskUserDraft[],
  phase: AskUserCardPhase,
): boolean {
  const allAnswered = questions.every((question, index) => isAskUserDraftAnswered(question, drafts[index] ?? emptyAskUserDraft()));
  if (!allAnswered) {
    return false;
  }
  if (questions.length > 1 && phase !== "review") {
    return false;
  }
  return true;
}

export function selectAskUserOption(draft: AskUserDraft, label: string, multiSelect: boolean): AskUserDraft {
  if (multiSelect) {
    const selected = draft.selectedLabels.includes(label)
      ? draft.selectedLabels.filter((entry) => entry !== label)
      : [...draft.selectedLabels, label];
    return { ...draft, selectedLabels: selected, customText: "" };
  }
  return { ...draft, selectedLabels: [label], customText: "" };
}

export function setAskUserCustomText(draft: AskUserDraft, customText: string): AskUserDraft {
  return { ...draft, customText, selectedLabels: customText.trim().length > 0 ? [] : draft.selectedLabels };
}

export function draftToAskUserAnswer(questionIndex: number, question: AskUserQuestion, draft: AskUserDraft): AskUserAnswer {
  const notes = draft.notes.trim();
  const custom = draft.customText.trim();
  if (custom.length > 0) {
    return {
      questionIndex,
      question: question.question,
      kind: "custom",
      answer: custom,
      ...(notes.length > 0 ? { notes } : {}),
    };
  }
  if (question.multiSelect) {
    return {
      questionIndex,
      question: question.question,
      kind: "multi",
      answer: null,
      selected: [...draft.selectedLabels],
      ...(notes.length > 0 ? { notes } : {}),
    };
  }
  const label = draft.selectedLabels[0] ?? "";
  const option = question.options.find((entry) => entry.label === label);
  return {
    questionIndex,
    question: question.question,
    kind: "option",
    answer: label,
    ...(option?.preview && option.preview.length > 0 ? { preview: option.preview } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
}

export function draftsToAskUserAnswers(questions: readonly AskUserQuestion[], drafts: readonly AskUserDraft[]): AskUserAnswer[] {
  return questions.map((question, index) => draftToAskUserAnswer(index, question, drafts[index] ?? emptyAskUserDraft()));
}

export { askUserOptionLetter };
