import { describe, expect, test } from "bun:test";
import {
  applyRuntimeEvent,
  blockingReviewStatuses,
  CHANGE_LEDGER_DISCLOSURE,
  CHANGE_REVIEW_COPY,
  changeScopeEquals,
  emptyConversationState,
  formatChangedFileCount,
  isChangeScope,
  isJsonSafeValue,
  isPersistableRelativePath,
  isUntrackedChangePath,
  jsonRoundTrip,
  parseChangeDiffCursor,
  parseChangeFileViewCursor,
  requireChangeContextLines,
  requireChangeRelativePath,
  requireChangeRelativePaths,
  requireChangeScope,
  reviewSummaryForToolCall,
  latestChangeReview,
  reviewFileCount,
  RUNTIME_EVENT_TYPES,
  type ChangeReviewSetSummary,
} from "../src/index";
import { HARNESS_ERROR_CODES } from "../src/errors";

function sampleReview(runId = "run-1"): ChangeReviewSetSummary {
  return {
    workspaceId: "/tmp/ws",
    sessionId: "s1",
    runId,
    revision: 1,
    pendingCount: 1,
    approvedCount: 0,
    conflictCount: 0,
    unavailableCount: 0,
    fileCount: 1,
    filesTruncated: false,
    toolCallIds: ["call_write"],
    updatedAt: "2026-08-15T00:00:00.000Z",
    files: [
      {
        relativePath: "note.txt",
        kind: "created",
        status: "pending",
        firstToolCallId: "call_write",
        latestToolCallId: "call_write",
        startedAt: "2026-08-15T00:00:00.000Z",
        updatedAt: "2026-08-15T00:00:00.000Z",
        afterHash: "abc",
        byteLengthAfter: 5,
      },
    ],
  };
}

describe("change-review protocol", () => {
  test("rejects malformed cursors, arrays, and relativePaths before runtime work", () => {
    expect(() => parseChangeDiffCursor("nope", "getChangeDiff")).toThrow(
      expect.objectContaining({ code: HARNESS_ERROR_CODES.invalidCommand }),
    );
    expect(() => parseChangeFileViewCursor("hunk:0", "getChangeFileView")).toThrow(
      expect.objectContaining({ code: HARNESS_ERROR_CODES.invalidCommand }),
    );
    expect(() => requireChangeRelativePaths([1, 2] as never, "approveChanges")).toThrow(
      expect.objectContaining({ code: HARNESS_ERROR_CODES.invalidCommand }),
    );
    expect(() => requireChangeRelativePaths(["a.txt", "a.txt"], "approveChanges")).toThrow(
      expect.objectContaining({ code: HARNESS_ERROR_CODES.invalidCommand }),
    );
    expect(() => requireChangeRelativePath("../escape.txt", "getChangeDiff")).toThrow(
      expect.objectContaining({ code: HARNESS_ERROR_CODES.invalidCommand }),
    );
    expect(() => requireChangeContextLines(99, "getChangeDiff")).toThrow(
      expect.objectContaining({ code: HARNESS_ERROR_CODES.invalidCommand }),
    );
    expect(isPersistableRelativePath(".pho-code-untracked/outside-abcd")).toBe(true);
    expect(isUntrackedChangePath(".pho-code-untracked/outside-abcd")).toBe(true);
    expect(CHANGE_REVIEW_COPY.captureCapped).toContain("tracked-file limit");
    expect(CHANGE_REVIEW_COPY.ledgerUnreadable).toContain("unreadable");
    expect(CHANGE_REVIEW_COPY.undoMetadata).toBe("");
  });

  test("accepts a complete scope and rejects incomplete identities", () => {
    expect(isChangeScope({ workspaceId: "/tmp/ws", sessionId: "s1", runId: "r1" })).toBe(true);
    expect(isChangeScope({ workspaceId: "/tmp/ws", sessionId: "s1" })).toBe(false);
    expect(() => requireChangeScope({ sessionId: "s1" }, "getChangeReviewSet")).toThrow(
      expect.objectContaining({ code: HARNESS_ERROR_CODES.invalidCommand }),
    );
  });

  test("review summaries stay JSON-safe and join by toolCallId", () => {
    const summary = sampleReview();
    expect(isJsonSafeValue(summary)).toBe(true);
    expect(jsonRoundTrip(summary)).toEqual(summary);
    expect(reviewSummaryForToolCall([summary], "call_write")?.runId).toBe("run-1");
    expect(reviewSummaryForToolCall([summary], "other")).toBeUndefined();
    expect(latestChangeReview([summary, { ...summary, runId: "run-2", updatedAt: "2026-08-16T00:00:00.000Z" }])?.runId).toBe(
      "run-2",
    );
    expect(CHANGE_REVIEW_COPY.alreadyApplied).toBe("");
    expect(CHANGE_REVIEW_COPY.trackedOnly).toBe("Changes");
    expect(CHANGE_REVIEW_COPY.notAllChanges).toBe("");
    expect(CHANGE_LEDGER_DISCLOSURE).toContain("application data");
    expect(CHANGE_LEDGER_DISCLOSURE).toContain("250 MiB");
    expect(CHANGE_LEDGER_DISCLOSURE).toContain("Approve or Undo");
    expect(formatChangedFileCount(1)).toBe("1 file");
    expect(formatChangedFileCount(2)).toBe("2 files");
    expect(reviewFileCount({ ...summary, fileCount: 80, filesTruncated: true })).toBe(80);
  });

  test("blocking statuses cover pending recovery and exclude approved", () => {
    expect(blockingReviewStatuses("pending")).toBe(true);
    expect(blockingReviewStatuses("conflict")).toBe(true);
    expect(blockingReviewStatuses("approved")).toBe(false);
    expect(blockingReviewStatuses("unavailable")).toBe(false);
  });

  test("changeReviewUpdated patches the owning snapshot without mixing scopes", () => {
    const snapshot = {
      session: {
        id: "s1",
        workspaceId: "/tmp/ws",
        title: "New session",
        updatedAt: "2026-08-15T00:00:00.000Z",
      },
      workspace: {
        id: "/tmp/ws",
        path: "/tmp/ws",
        displayName: "ws",
        lastOpenedAt: "2026-08-15T00:00:00.000Z",
        projectResourcesApproved: true,
      },
      messages: [],
      run: { status: "streaming" as const, runId: "run-live", streamingText: "", work: [] },
      models: [],
      sessions: [],
      features: { features: [] },
      thinkingLevel: "off" as const,
      availableThinkingLevels: ["off" as const],
      supportsThinking: false,
    };
    let state = applyRuntimeEvent(emptyConversationState(), {
      protocolVersion: 1,
      sequence: 1,
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      payload: snapshot,
      occurredAt: "2026-08-15T00:00:00.000Z",
    });
    const review = sampleReview("run-bg");
    state = applyRuntimeEvent(state, {
      protocolVersion: 1,
      sequence: 2,
      type: RUNTIME_EVENT_TYPES.changeReviewUpdated,
      workspaceId: "/tmp/ws",
      sessionId: "s1",
      runId: "run-bg",
      payload: review,
      occurredAt: "2026-08-15T00:00:01.000Z",
    });
    expect(state.snapshot?.changeReviews).toEqual([review]);
    const updated = { ...review, revision: 2, pendingCount: 0, approvedCount: 1 };
    updated.files = [{ ...review.files[0]!, status: "approved" }];
    state = applyRuntimeEvent(state, {
      protocolVersion: 1,
      sequence: 3,
      type: RUNTIME_EVENT_TYPES.changeReviewUpdated,
      workspaceId: "/tmp/ws",
      sessionId: "s1",
      runId: "run-bg",
      payload: updated,
      occurredAt: "2026-08-15T00:00:02.000Z",
    });
    expect(state.snapshot?.changeReviews).toHaveLength(1);
    expect(state.snapshot?.changeReviews?.[0]?.revision).toBe(2);
    expect(changeScopeEquals(review, updated)).toBe(true);
  });
});
