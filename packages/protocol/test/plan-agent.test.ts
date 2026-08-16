import { describe, expect, test } from "bun:test";
import {
  ASK_USER_RESERVED_LABELS,
  ASK_USER_TEXT_FIELD_MAX_BYTES,
  askUserOptionLetter,
  isAskUserAnswer,
  isAskUserQuestion,
  jsonRoundTrip,
  parseAskUserAnswers,
  parseAskUserQuestions,
  utf8ByteLength,
  type AskUserQuestion,
  type HostDialogRequest,
  type ResolveHostDialogInput,
} from "../src/index";

const sampleQuestions: AskUserQuestion[] = [
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

describe("ask-user protocol", () => {
  test("questionnaire host dialog requests survive a JSON round trip", () => {
    const request: HostDialogRequest = {
      requestId: "q-1",
      kind: "questionnaire",
      title: "The agent has a question",
      questions: sampleQuestions,
      workspaceId: "ws",
      sessionId: "s1",
    };
    expect(jsonRoundTrip(request)).toEqual(request);
    expect(parseAskUserQuestions(request.questions)).toEqual(sampleQuestions);
  });

  test("questionnaire resolve payloads carry JSON-safe answers", () => {
    const input: ResolveHostDialogInput = {
      requestId: "q-1",
      answers: [
        {
          questionIndex: 0,
          question: sampleQuestions[0]!.question,
          kind: "option",
          answer: "Patch",
        },
        {
          questionIndex: 1,
          question: sampleQuestions[1]!.question,
          kind: "custom",
          answer: "Call out the permission boundary.",
          notes: "Keep it short.",
        },
      ],
    };
    expect(jsonRoundTrip(input)).toEqual(input);
    expect(parseAskUserAnswers(input.answers)).toEqual(input.answers);
  });

  test("rejects reserved labels and oversized text fields at the protocol boundary", () => {
    expect(ASK_USER_RESERVED_LABELS).toContain("Other");
    expect(isAskUserQuestion({ question: "Q?", header: "H", options: [{ label: "A" }] })).toBe(false);
    expect(isAskUserAnswer({ questionIndex: 0, question: "Q?", kind: "chat", answer: "x" })).toBe(false);
    expect(utf8ByteLength("é")).toBe(2);
    expect(ASK_USER_TEXT_FIELD_MAX_BYTES).toBe(8192);
    expect(askUserOptionLetter(0)).toBe("A");
    expect(askUserOptionLetter(3)).toBe("D");
    expect(askUserOptionLetter(4)).toBeNull();
  });
});
