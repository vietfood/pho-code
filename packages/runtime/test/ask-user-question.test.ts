import { describe, expect, test } from "bun:test";
import type { AskUserQuestion } from "@pho-code/protocol";
import {
  ASK_USER_DECLINE_MESSAGE,
  ASK_USER_HOST_FAILURE_MESSAGE,
  ERROR_RESERVED_LABEL,
  buildAskUserQuestionnaireResponse,
  validateAskUserQuestionnaire,
} from "../src/ask-user-question";
import { presentAskUserQuestionnaire } from "../src/ask-user-present";
import { runAskUserRpcQuestionnaire } from "../src/ask-user-rpc-fallback";

const questions: AskUserQuestion[] = [
  {
    question: "Which approach should we use?",
    header: "Approach",
    options: [
      { label: "Rewrite", description: "Replace the module." },
      { label: "Patch", description: "Minimal surgical edits." },
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

describe("ask-user validation and envelope", () => {
  test("rejects reserved Other before UI", () => {
    const result = validateAskUserQuestionnaire({
      questions: [
        {
          question: "Pick one?",
          header: "Choice",
          options: [
            { label: "Other", description: "Not allowed." },
            { label: "Keep", description: "Stay the course." },
          ],
        },
      ],
    });
    expect(result).toEqual({ ok: false, error: "reserved_label", message: ERROR_RESERVED_LABEL });
  });

  test("builds an answered envelope from mixed option and custom answers", () => {
    const result = buildAskUserQuestionnaireResponse(
      {
        cancelled: false,
        answers: [
          {
            questionIndex: 0,
            question: questions[0]!.question,
            kind: "option",
            answer: "Patch",
          },
          {
            questionIndex: 1,
            question: questions[1]!.question,
            kind: "custom",
            answer: "Keep the permission boundary.",
          },
        ],
      },
      questions,
    );
    expect(result.details.cancelled).toBe(false);
    expect(result.content[0]?.text).toContain("Patch");
    expect(result.content[0]?.text).toContain("Keep the permission boundary.");
    expect(result.content[0]?.text).not.toContain(ASK_USER_DECLINE_MESSAGE);
  });

  test("uses the never-saw string for host failure, not decline", () => {
    const result = buildAskUserQuestionnaireResponse(
      { answers: [], cancelled: true, error: "host_failure" },
      questions,
    );
    expect(result.content[0]?.text).toBe(ASK_USER_HOST_FAILURE_MESSAGE);
    expect(result.content[0]?.text).not.toContain(ASK_USER_DECLINE_MESSAGE);
    expect(result.details.error).toBe("host_failure");
  });
});

describe("ask-user presentation", () => {
  test("prefers the questionnaire card when the host implements it", async () => {
    const presented = await presentAskUserQuestionnaire({
      hasUI: true,
      questions,
      ui: {
        questionnaire: async () => ({
          cancelled: false,
          answers: [
            { questionIndex: 0, question: questions[0]!.question, kind: "option", answer: "Patch" },
            { questionIndex: 1, question: questions[1]!.question, kind: "custom", answer: "typed" },
          ],
        }),
      },
    });
    expect(presented.cancelled).toBe(false);
    expect(presented.answers[0]?.answer).toBe("Patch");
  });

  test("falls back to select/input when the card cannot render", async () => {
    const presented = await presentAskUserQuestionnaire({
      hasUI: true,
      questions: [questions[0]!],
      ui: {
        questionnaire: async () => undefined,
        select: async (_title: string, options: string[]) => options[1],
        input: async () => undefined,
      },
    });
    expect(presented.cancelled).toBe(false);
    expect(presented.answers[0]).toMatchObject({ kind: "option", answer: "Patch" });
  });

  test("returns host failure when the card throws and no walker exists", async () => {
    const presented = await presentAskUserQuestionnaire({
      hasUI: true,
      questions,
      ui: {
        questionnaire: async () => {
          throw new Error("render failed");
        },
      },
    });
    expect(presented).toEqual({ answers: [], cancelled: true, error: "host_failure" });
  });
});

describe("ask-user rpc walker", () => {
  test("walks Type something as a custom answer", async () => {
    const result = await runAskUserRpcQuestionnaire(
      {
        select: async (_title, options) => options.at(-1),
        input: async () => "typed answer",
      },
      [questions[0]!],
    );
    expect(result).toEqual({
      cancelled: false,
      answers: [{ questionIndex: 0, question: questions[0]!.question, kind: "custom", answer: "typed answer" }],
    });
  });
});
