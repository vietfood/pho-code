import type { AskUserQuestion, AskUserQuestionnaireDetails } from "@pho-code/protocol";
import { hasDialogSelectUI, runAskUserRpcQuestionnaire } from "./ask-user-rpc-fallback";

export type QuestionnaireHostUI = {
  questionnaire: (
    questions: readonly AskUserQuestion[],
    opts?: { signal?: AbortSignal },
  ) => Promise<AskUserQuestionnaireDetails | undefined>;
};

export function hasQuestionnaireHostUI(ui: unknown): ui is QuestionnaireHostUI {
  return typeof (ui as QuestionnaireHostUI | null | undefined)?.questionnaire === "function";
}

export async function presentAskUserQuestionnaire(input: {
  ui: unknown;
  hasUI: boolean;
  questions: readonly AskUserQuestion[];
  signal?: AbortSignal;
}): Promise<AskUserQuestionnaireDetails> {
  if (!input.hasUI) {
    return { answers: [], cancelled: true, error: "no_ui" };
  }
  if (hasQuestionnaireHostUI(input.ui)) {
    try {
      const result = await input.ui.questionnaire(input.questions, {
        ...(input.signal ? { signal: input.signal } : {}),
      });
      if (result !== undefined) {
        return result;
      }
    } catch {
      if (input.signal?.aborted) {
        return { answers: [], cancelled: true };
      }
      return { answers: [], cancelled: true, error: "host_failure" };
    }
  }
  if (hasDialogSelectUI(input.ui)) {
    return runAskUserRpcQuestionnaire(input.ui, input.questions);
  }
  return { answers: [], cancelled: true, error: "host_failure" };
}
