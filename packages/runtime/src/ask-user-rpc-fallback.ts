/**
 * Sequential select/input walker used only when the questionnaire card cannot render.
 * Adapted from juicesharp `@juicesharp/rpiv-ask-user-question` 2.6.0 `rpc-fallback.ts` (MIT).
 */
import type { AskUserAnswer, AskUserQuestion } from "@pho-code/protocol";
import { ASK_USER_TYPE_SOMETHING_LABEL } from "./ask-user-question";

export type DialogSelectUI = {
  select: (title: string, options: string[]) => Promise<string | undefined>;
  input: (title: string, placeholder?: string) => Promise<string | undefined>;
};

const MULTI_SELECT_INSTRUCTIONS =
  'Enter the numbers of all that apply, comma-separated (e.g. "1,3"), or type a custom answer as plain text.';
const CUSTOM_ANSWER_TITLE = "Type your answer:";
const MULTI_SELECT_PLACEHOLDER = "1,3";
const MAX_PREVIEW_CHARS = 600;

export function hasDialogSelectUI(ui: unknown): ui is DialogSelectUI {
  const candidate = ui as Partial<DialogSelectUI> | null | undefined;
  return typeof candidate?.select === "function" && typeof candidate?.input === "function";
}

function formatOptionLine(option: AskUserQuestion["options"][number], index: number): string {
  return `${index + 1}. ${option.label} — ${option.description}`;
}

function parseIndex(token: string, count: number): number | null {
  const index = Number.parseInt(token, 10) - 1;
  return index >= 0 && index < count ? index : null;
}

function buildPreviewBlock(question: AskUserQuestion): string {
  const blocks = question.options.flatMap((option, index) =>
    option.preview && option.preview.length > 0
      ? [`--- ${index + 1}. ${option.label} preview ---\n${option.preview.slice(0, MAX_PREVIEW_CHARS)}`]
      : [],
  );
  return blocks.length > 0 ? `\n\n${blocks.join("\n\n")}` : "";
}

export async function runAskUserRpcQuestionnaire(
  ui: DialogSelectUI,
  questions: readonly AskUserQuestion[],
): Promise<{ answers: AskUserAnswer[]; cancelled: boolean }> {
  const answers: AskUserAnswer[] = [];
  for (let questionIndex = 0; questionIndex < questions.length; questionIndex += 1) {
    const question = questions[questionIndex];
    if (!question) {
      continue;
    }
    const header = question.header ? `[${question.header}] ` : "";
    const answer = question.multiSelect
      ? await askMultiSelect(ui, question, questionIndex, header)
      : await askSingleSelect(ui, question, questionIndex, header);
    if (answer === undefined) {
      return { answers, cancelled: true };
    }
    answers.push(answer);
  }
  return { answers, cancelled: false };
}

async function askSingleSelect(
  ui: DialogSelectUI,
  question: AskUserQuestion,
  questionIndex: number,
  header: string,
): Promise<AskUserAnswer | undefined> {
  const options = question.options.map(formatOptionLine);
  options.push(`${question.options.length + 1}. ${ASK_USER_TYPE_SOMETHING_LABEL}`);
  const chosen = await ui.select(`${header}${question.question}${buildPreviewBlock(question)}`, options);
  if (chosen == null) {
    return undefined;
  }
  const index = parseIndex(chosen, options.length);
  if (index == null) {
    return undefined;
  }
  if (index < question.options.length) {
    const option = question.options[index];
    if (!option) {
      return undefined;
    }
    return {
      questionIndex,
      question: question.question,
      kind: "option",
      answer: option.label,
      ...(option.preview && option.preview.length > 0 ? { preview: option.preview } : {}),
    };
  }
  const typed = await ui.input(`${header}${question.question}\n\n${CUSTOM_ANSWER_TITLE}`, "");
  if (typed == null) {
    return undefined;
  }
  return { questionIndex, question: question.question, kind: "custom", answer: typed };
}

async function askMultiSelect(
  ui: DialogSelectUI,
  question: AskUserQuestion,
  questionIndex: number,
  header: string,
): Promise<AskUserAnswer | undefined> {
  const list = question.options.map(formatOptionLine).join("\n");
  const value = await ui.input(
    `${header}${question.question}\n\n${list}\n\n${MULTI_SELECT_INSTRUCTIONS}`,
    MULTI_SELECT_PLACEHOLDER,
  );
  if (value == null) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { questionIndex, question: question.question, kind: "multi", answer: null, selected: [] };
  }
  const tokens = trimmed.split(/[,\s]+/).filter((token) => token.length > 0);
  const indices = tokens.map((token) => (/^\d+\.?$/.test(token) ? parseIndex(token, question.options.length) : null));
  if (indices.every((index): index is number => index != null)) {
    const selected: string[] = [];
    for (const index of indices) {
      const label = question.options[index]?.label;
      if (label && !selected.includes(label)) {
        selected.push(label);
      }
    }
    return { questionIndex, question: question.question, kind: "multi", answer: null, selected };
  }
  return { questionIndex, question: question.question, kind: "custom", answer: trimmed };
}
