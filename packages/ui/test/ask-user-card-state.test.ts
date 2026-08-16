import { describe, expect, test } from "bun:test";
import {
  canSubmitAskUserCard,
  createAskUserDrafts,
  draftsToAskUserAnswers,
  isAskUserDraftAnswered,
  selectAskUserOption,
  setAskUserCustomText,
  shortcutOptionIndex,
  unansweredAskUserHeaders,
} from "../src/lib/ask-user-card-state";
import type { AskUserQuestion } from "@pho-code/protocol";

const questions: AskUserQuestion[] = [
  {
    question: "Which approach should we use?",
    header: "Approach",
    options: [
      { label: "Rewrite", description: "Replace the module." },
      { label: "Patch", description: "Minimal surgical edits." },
      { label: "Defer", description: "Leave it for later." },
    ],
  },
  {
    question: "What should the commit message emphasize?",
    header: "Commit",
    options: [
      { label: "Fix", description: "Bugfix wording." },
      { label: "Refactor", description: "Structure-only wording." },
    ],
  },
];

describe("ask-user card state", () => {
  test("maps letter and digit shortcuts onto A/B/C/D", () => {
    expect(shortcutOptionIndex("b", 3)).toBe(1);
    expect(shortcutOptionIndex("2", 3)).toBe(1);
    expect(shortcutOptionIndex("D", 3)).toBeNull();
    expect(shortcutOptionIndex("4", 4)).toBe(3);
  });

  test("blocks submit until every question is answered and review is reached", () => {
    const drafts = createAskUserDrafts(2);
    expect(canSubmitAskUserCard(questions, drafts, "question")).toBe(false);
    drafts[0] = selectAskUserOption(drafts[0]!, "Patch", false);
    expect(unansweredAskUserHeaders(questions, drafts)).toEqual(["Commit"]);
    drafts[1] = setAskUserCustomText(drafts[1]!, "Keep the permission boundary.");
    expect(isAskUserDraftAnswered(questions[1]!, drafts[1]!)).toBe(true);
    expect(canSubmitAskUserCard(questions, drafts, "question")).toBe(false);
    expect(canSubmitAskUserCard(questions, drafts, "review")).toBe(true);
    expect(draftsToAskUserAnswers(questions, drafts)).toEqual([
      {
        questionIndex: 0,
        question: "Which approach should we use?",
        kind: "option",
        answer: "Patch",
      },
      {
        questionIndex: 1,
        question: "What should the commit message emphasize?",
        kind: "custom",
        answer: "Keep the permission boundary.",
      },
    ]);
  });
});
