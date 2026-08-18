import { describe, expect, test } from "bun:test";
import {
  ASK_USER_RESERVED_LABELS,
  ASK_USER_TEXT_FIELD_MAX_BYTES,
  PLAN_DOCUMENT_MAX_BYTES,
  askUserOptionLetter,
  emptySessionPlanSnapshot,
  isAskUserAnswer,
  isAskUserQuestion,
  isSessionAgentMode,
  jsonRoundTrip,
  parseAskUserAnswers,
  parseAskUserQuestions,
  parsePlanTodoList,
  parsePlanTodosFromToolPreview,
  planDocumentTooLarge,
  withLivePlanTodos,
  utf8ByteLength,
  type AskUserQuestion,
  type HostDialogRequest,
  type ResolveHostDialogInput,
  type SessionPlanSnapshot,
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

describe("plan-agent session protocol", () => {
  test("mode and snapshot stay JSON-safe with Agent as the default", () => {
    expect(isSessionAgentMode("plan")).toBe(true);
    expect(isSessionAgentMode("agent")).toBe(true);
    expect(isSessionAgentMode("ask")).toBe(false);
    const snapshot: SessionPlanSnapshot = emptySessionPlanSnapshot();
    expect(snapshot.mode).toBe("agent");
    expect(snapshot.executing).toBe(false);
    expect(jsonRoundTrip(snapshot)).toEqual(snapshot);
  });

  test("rejects plan documents over the 256 KiB bound", () => {
    expect(planDocumentTooLarge("ok")).toBe(false);
    expect(PLAN_DOCUMENT_MAX_BYTES).toBe(256 * 1024);
    expect(planDocumentTooLarge("x".repeat(PLAN_DOCUMENT_MAX_BYTES + 1))).toBe(true);
  });

  test("rejects two in_progress todos and oversized content", () => {
    expect(
      parsePlanTodoList([
        { id: "a", content: "One", status: "in_progress" },
        { id: "b", content: "Two", status: "in_progress" },
      ]).ok,
    ).toBe(false);
    expect(parsePlanTodoList([{ id: "a", content: "x".repeat(201), status: "pending" }]).ok).toBe(false);
    expect(parsePlanTodoList([]).ok).toBe(true);
    expect(parsePlanTodoList("nope")).toEqual({
      ok: false,
      error: "invalid_list",
      message: "todos must be an array. Use todos: [] to clear the list.",
    });
  });

  test("parses live todo tool previews onto the session plan snapshot", () => {
    const todos = [
      { id: "1", content: "Inspect", status: "completed" as const },
      { id: "2", content: "Verify", status: "in_progress" as const },
    ];
    expect(parsePlanTodosFromToolPreview(JSON.stringify({ todos }))).toEqual(todos);
    expect(parsePlanTodosFromToolPreview("")).toBeUndefined();
    expect(parsePlanTodosFromToolPreview("{")).toBeUndefined();
    expect(
      withLivePlanTodos(
        { mode: "plan", executing: true, documentMarkdown: "# Plan", todos: [], remainingCount: 0 },
        todos,
      ),
    ).toMatchObject({
      mode: "plan",
      executing: true,
      documentMarkdown: "# Plan",
      todos,
      remainingCount: 1,
    });
  });
});
