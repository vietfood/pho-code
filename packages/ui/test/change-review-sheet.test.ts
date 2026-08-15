import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CHANGE_REVIEW_COPY,
  formatChangedFileCount,
  type ChangeDiffPage,
  type ChangeReviewSetSnapshot,
} from "@pho-code/protocol";
import { ChangeReviewSheet } from "../src/change-review-sheet";
import { ToolRow } from "../src/tool-row";
import type { TranscriptToolBlock } from "@pho-code/protocol";

const pendingReview: ChangeReviewSetSnapshot = {
  workspaceId: "/tmp/ws",
  sessionId: "s1",
  runId: "r1",
  revision: 2,
  pendingCount: 1,
  approvedCount: 0,
  conflictCount: 0,
  unavailableCount: 0,
  fileCount: 1,
  filesTruncated: false,
  toolCallIds: ["call_edit"],
  updatedAt: "2026-08-15T00:00:00.000Z",
  files: [
    {
      relativePath: "tracked.txt",
      kind: "modified",
      status: "pending",
      firstToolCallId: "call_edit",
      latestToolCallId: "call_edit",
      startedAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
      beforeHash: "before",
      afterHash: "after",
    },
  ],
};

const diff: ChangeDiffPage = {
  relativePath: "tracked.txt",
  status: "pending",
  truncated: false,
  lineEnding: "lf",
  hunks: [
    {
      header: "@@ -1 +1 @@",
      lines: [
        { kind: "removed", text: "before", beforeLine: 1 },
        { kind: "added", text: "after from agent", afterLine: 1 },
      ],
    },
  ],
};

describe("change review sheet", () => {
  test("renders pending unified diff and honest already-applied copy", () => {
    const markup = renderToStaticMarkup(
      createElement(ChangeReviewSheet, {
        review: pendingReview,
        selectedPath: "tracked.txt",
        diff,
        onSelectPath: () => undefined,
        onApprove: () => undefined,
        onApproveAll: () => undefined,
      }),
    );
    expect(markup).toContain(CHANGE_REVIEW_COPY.trackedOnly);
    expect(markup).toContain(CHANGE_REVIEW_COPY.alreadyApplied);
    expect(markup).not.toContain("<h2");
    expect(markup).not.toContain('data-testid="change-review-close"');
    expect(markup).not.toContain('data-testid="change-review-rail"');
    expect(markup).not.toContain('data-testid="right-sidebar"');
    expect(markup).toContain("tracked.txt");
    expect(markup).toContain("Edited");
    expect(markup).toContain("+1");
    expect(markup).toContain("-1");
    expect(markup).toContain("Pending");
    expect(markup).toContain('data-kind="removed"');
    expect(markup).toContain("before");
    expect(markup).toContain('data-kind="added"');
    expect(markup).toContain("after from agent");
    expect(markup).toContain('data-testid="change-review-approve"');
    expect(markup).toContain('data-testid="change-review-undo"');
    expect(markup).toContain(CHANGE_REVIEW_COPY.notAllChanges);
    expect(markup).toContain("change-review-diff");
    expect(markup).not.toContain('data-testid="change-review-resize"');
    expect(markup).not.toContain("Resize review sidebar");
    expect(markup).not.toContain('data-testid="change-review-undo-all"');
    expect(markup).not.toContain("Before");
    expect(markup).not.toContain("All changes");
    expect(markup).not.toContain("change-review-pane");
  });

  test("shows a per-file Undo preview and never offers Undo all", async () => {
    const twoPending = {
      ...pendingReview,
      pendingCount: 2,
      fileCount: 2,
      files: [
        pendingReview.files[0]!,
        { ...pendingReview.files[0]!, relativePath: "other.txt", firstToolCallId: "call_write", latestToolCallId: "call_write" },
      ],
    };
    const markup = renderToStaticMarkup(
      createElement(ChangeReviewSheet, {
        review: twoPending,
        selectedPath: "tracked.txt",
        diff,
        undoPreview: {
          workspaceId: "/tmp/ws",
          sessionId: "s1",
          runId: "r1",
          relativePath: "tracked.txt",
          action: "restore",
          previewToken: "token",
          expiresAt: "2026-08-15T00:05:00.000Z",
          effect: "Restore the exact bytes captured before the agent edit.",
        },
        onSelectPath: () => undefined,
        onApprove: () => undefined,
        onApproveAll: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="change-review-undo-preview"');
    expect(markup).toContain("Restore the exact bytes captured before the agent edit.");
    expect(markup).toContain('data-testid="change-review-undo-confirm"');
    expect(markup).toContain("Restore");
    expect(markup).toContain('data-testid="change-review-approve-all"');
    expect(markup).not.toContain('data-testid="change-review-undo-all"');
  });

  test("shows unmodified-line separators and nested path in the unified card", () => {
    const nested = {
      ...pendingReview,
      files: [{ ...pendingReview.files[0]!, relativePath: "src/change-record.ts" }],
    };
    const markup = renderToStaticMarkup(
      createElement(ChangeReviewSheet, {
        review: nested,
        selectedPath: "src/change-record.ts",
        diff: {
          relativePath: "src/change-record.ts",
          status: "pending",
          truncated: false,
          hunks: [
            {
              header: "@@ -12,4 +12,6 @@",
              lines: [
                { kind: "context", text: "export function apply(", beforeLine: 12, afterLine: 12 },
                { kind: "removed", text: "  currentHash: string", beforeLine: 13 },
                { kind: "added", text: "  probe: WorkspaceFileProbe", afterLine: 13 },
              ],
            },
          ],
        },
        onSelectPath: () => undefined,
        onApprove: () => undefined,
        onApproveAll: () => undefined,
      }),
    );
    expect(markup).toContain("Edited");
    expect(markup).toContain("src/change-record.ts");
    expect(markup).toContain("11 unmodified lines");
    expect(markup).not.toContain("@@ -12,4 +12,6 @@");
  });

  test("shows approved and conflict states without Approve for non-pending files", () => {
    const approved = {
      ...pendingReview,
      pendingCount: 0,
      approvedCount: 1,
      files: [{ ...pendingReview.files[0]!, status: "approved" as const }],
    };
    const approvedMarkup = renderToStaticMarkup(
      createElement(ChangeReviewSheet, {
        review: approved,
        selectedPath: "tracked.txt",
        diff: { ...diff, status: "approved" },
        onSelectPath: () => undefined,
        onApprove: () => undefined,
        onApproveAll: () => undefined,
      }),
    );
    expect(approvedMarkup).toContain("Approved");
    expect(approvedMarkup).not.toContain('data-testid="change-review-approve"');
    expect(approvedMarkup).not.toContain('data-testid="change-review-undo"');

    const conflicted = {
      ...pendingReview,
      pendingCount: 0,
      conflictCount: 1,
      files: [{ ...pendingReview.files[0]!, status: "conflict" as const }],
    };
    const conflictMarkup = renderToStaticMarkup(
      createElement(ChangeReviewSheet, {
        review: conflicted,
        selectedPath: "tracked.txt",
        diff: { ...diff, status: "conflict" },
        onSelectPath: () => undefined,
        onApprove: () => undefined,
        onApproveAll: () => undefined,
      }),
    );
    expect(conflictMarkup).toContain("Conflict");
    expect(conflictMarkup).not.toContain('data-testid="change-review-approve"');
    expect(conflictMarkup).not.toContain('data-testid="change-review-undo"');
  });

  test("unavailable files show capture diagnostic instead of hunks", () => {
    const unavailable = {
      ...pendingReview,
      pendingCount: 0,
      unavailableCount: 1,
      files: [{ ...pendingReview.files[0]!, status: "unavailable" as const, limitation: "capture-failed" as const }],
    };
    const markup = renderToStaticMarkup(
      createElement(ChangeReviewSheet, {
        review: unavailable,
        selectedPath: "tracked.txt",
        diff: { relativePath: "tracked.txt", status: "unavailable", hunks: [], truncated: false, limitation: "capture-failed" },
        onSelectPath: () => undefined,
        onApprove: () => undefined,
        onApproveAll: () => undefined,
      }),
    );
    expect(markup).toContain("Recovery was not captured");
  });

  test("hides Approve all when the displayed file list is truncated", () => {
    const truncated = {
      ...pendingReview,
      pendingCount: 2,
      fileCount: 80,
      filesTruncated: true,
      files: [
        pendingReview.files[0]!,
        { ...pendingReview.files[0]!, relativePath: "other.txt" },
      ],
    };
    const markup = renderToStaticMarkup(
      createElement(ChangeReviewSheet, {
        review: truncated,
        selectedPath: "tracked.txt",
        diff,
        onSelectPath: () => undefined,
        onApprove: () => undefined,
        onApproveAll: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="change-review-approve"');
    expect(markup).not.toContain('data-testid="change-review-approve-all"');
    expect(markup).toContain("The file list is truncated");
    expect(markup).toContain('data-testid="change-review-file"');
  });
});

describe("tool row review opener", () => {
  test("shows a changed-file count and opener for write/edit cards", () => {
    const block: TranscriptToolBlock = {
      type: "tool",
      callId: "call_edit",
      name: "edit",
      status: "completed",
      inputPreview: '{"path":"tracked.txt"}',
      outputPreview: "ok",
    };
    const markup = renderToStaticMarkup(
      createElement(ToolRow, { block, reviewCount: 1, onOpenReview: () => undefined }),
    );
    expect(markup).toContain(formatChangedFileCount(1));
    expect(markup).toContain('data-testid="tool-open-review"');
  });
});
