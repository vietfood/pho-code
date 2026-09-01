import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentTaskSnapshot } from "@pho-code/protocol";
import { TaskPanel } from "../src/task-panel";

const task: AgentTaskSnapshot = {
  brief: {
    revision: "r1",
    status: "active",
    updatedAt: "2026-09-01T00:00:00.000Z",
    updatedBy: "agent",
    objective: "Finish V5 end to end",
    constraints: ["Preserve Plan authority"],
    acceptanceCriteria: [
      { id: "tests", text: "Machine verification passes" },
      { id: "owner", text: "Owner verifies with a real model later" },
    ],
    assumptions: [],
    openQuestions: [],
    nonGoals: [],
  },
  evidence: {
    id: "pack",
    runId: "run",
    briefRevision: "r1",
    generatedAt: "2026-09-01T00:00:01.000Z",
    items: [{
      id: "brief",
      providerId: "task-brief",
      sourceId: "r1",
      title: "Current Task Brief",
      excerpt: "bounded evidence",
      relevance: 1,
      freshness: "current",
      contentHash: "hash",
      selectionReason: "Required current context",
    }],
    omittedCount: 1,
    failedProviders: [],
    estimatedTokens: 4,
    characterCount: 16,
    truncated: false,
  },
  verification: {
    records: [{
      id: "v1",
      sourceAdapterId: "pho-code-settled-tools",
      criterionId: "tests",
      outcome: "passed",
      summary: "Focused tests passed",
      freshness: "current",
      observedAt: "2026-09-01T00:00:02.000Z",
    }],
    truncated: false,
  },
  completion: {
    id: "c1",
    briefRevision: "r1",
    status: "incomplete",
    createdAt: "2026-09-01T00:00:03.000Z",
    criteria: [
      { criterionId: "tests", outcome: "passed", verificationIds: ["v1"] },
      { criterionId: "owner", outcome: "unverified", verificationIds: [], note: "Real-model review remains" },
    ],
  },
};

describe("TaskPanel", () => {
  test("renders authoritative brief, evidence, verification, and completion state", () => {
    const markup = renderToStaticMarkup(createElement(TaskPanel, {
      task,
      onSave: () => undefined,
      onReset: () => undefined,
      onRecordVerification: () => undefined,
      onAcceptGaps: () => undefined,
    }));
    expect(markup).toContain('data-testid="task-panel"');
    expect(markup).toContain("Finish V5 end to end");
    expect(markup).toContain("Selected excerpts enter the model request");
    expect(markup).toContain("Current Task Brief");
    expect(markup).toContain("Focused tests passed");
    expect(markup).toContain("Source: pho-code-settled-tools");
    expect(markup).toContain("Real-model review remains");
    expect(markup).toContain("Accept disclosed gaps");
    expect(markup).toContain('data-testid="owner-verification-form"');
  });

  test("opens the bounded Task Brief editor for a supported empty task", () => {
    const markup = renderToStaticMarkup(createElement(TaskPanel, {
      task: { verification: { records: [], truncated: false } },
      onSave: () => undefined,
    }));
    expect(markup).toContain('data-testid="task-brief-editor"');
    expect(markup).toContain("Acceptance criteria");
    expect(markup).toContain("One item per line");
    expect(markup).toContain("Save Task Brief");
  });

  test("keeps live-run task state inspect-only", () => {
    const markup = renderToStaticMarkup(createElement(TaskPanel, {
      task,
      idle: false,
      onSave: () => undefined,
      onReset: () => undefined,
      onRecordVerification: () => undefined,
      onAcceptGaps: () => undefined,
    }));
    expect(markup).not.toContain('data-testid="owner-verification-form"');
    expect(markup).not.toContain("Accept disclosed gaps");
    expect(markup).not.toContain("Reset brief");
  });
});
