import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChangeDiffPage, ChangeReviewSetSnapshot } from "@pho-code/protocol";
import { ChangeReviewTileTitle, ChangeReviewWindow } from "../src/change-review-window";

const review: ChangeReviewSetSnapshot = {
  workspaceId: "/Users/dev/Workspace/pho-code",
  sessionId: "s1",
  runId: "r1",
  revision: 3,
  pendingCount: 1,
  approvedCount: 0,
  conflictCount: 0,
  unavailableCount: 0,
  fileCount: 2,
  filesTruncated: false,
  toolCallIds: ["call_edit"],
  updatedAt: "2026-08-15T00:00:00.000Z",
  files: [
    {
      relativePath: "packages/ui/src/composer.tsx",
      kind: "modified",
      status: "pending",
      firstToolCallId: "call_edit",
      latestToolCallId: "call_edit",
      startedAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
      beforeHash: "before",
      afterHash: "after",
    },
    {
      relativePath: "packages/protocol/src/settings.ts",
      kind: "modified",
      status: "conflict",
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
  relativePath: "packages/protocol/src/settings.ts",
  status: "pending",
  truncated: false,
  hunks: [
    {
      header: "@@ -34,4 +34,4 @@",
      lines: [
        { kind: "context", text: "export const MAX_CHAT_FONT_SIZE = 20;", beforeLine: 34, afterLine: 34 },
        { kind: "removed", text: "export const DEFAULT_CHAT_FONT_SIZE = 14;", beforeLine: 35 },
        { kind: "added", text: "export const DEFAULT_CHAT_FONT_SIZE = 15;", afterLine: 35 },
      ],
    },
  ],
};

function render(overrides: Partial<Parameters<typeof ChangeReviewWindow>[0]> = {}) {
  const reviewSnapshot = overrides.review === undefined ? review : overrides.review;
  return renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(ChangeReviewTileTitle, { review: reviewSnapshot }),
      createElement(ChangeReviewWindow, {
        review,
        diffs: { "packages/protocol/src/settings.ts": diff },
        contextLines: 3,
        onEnsureDiff: () => undefined,
        onApprove: () => undefined,
        onApproveAll: () => undefined,
        ...overrides,
      }),
    ),
  );
}

describe("stacked changes pane", () => {
  test("stacks files with tile chrome and visible diff tools", () => {
    const markup = render();
    expect(markup).toContain('data-testid="change-review-window"');
    expect(markup).not.toContain('data-testid="change-review-window-host"');
    expect(markup).toContain("working tree");
    expect(markup).toContain("2 files");
    expect(markup).toContain("composer.tsx");
    expect(markup).toContain("settings.ts");
    expect(markup).toContain('data-testid="change-review-window-file"');
    expect(markup).toContain('data-testid="change-review-window-title"');
    expect(markup).not.toContain('data-testid="change-review-expand-window"');
    expect(markup).not.toContain('data-testid="change-review-window-close"');
    expect(markup).not.toContain('data-testid="change-review-window-maximize"');
    expect(markup).not.toContain('data-testid="change-review-window-tools"');
    expect(markup).not.toContain('data-testid="change-review-window-resize"');
    expect(markup).toContain('data-testid="change-review-search"');
    expect(markup).toContain('data-testid="change-review-diff"');
    expect(markup).toContain('data-testid="change-review-approve"');
    expect(markup).toContain('data-testid="change-review-approve-all"');
    expect(markup).toContain("2 of 2 awaiting review");
  });

  test("keeps retention honesty behind a collapsed information control", () => {
    const markup = render();
    expect(markup).toContain('data-testid="change-retention-disclosure-trigger"');
    expect(markup).toContain('data-testid="change-retention-disclosure"');
    // Substrings, not the whole constant: the copy's apostrophe is HTML-escaped in markup.
    expect(markup).toContain("not encrypted at rest");
    expect(markup).toContain("250 MiB ledger budget");
    // Collapsed `details`, so the paragraph never occupies the review layout.
    expect(markup).toContain("<details");
    expect(markup).not.toContain("<details open");
  });

  test("shows the empty review copy inside the window chrome", () => {
    const markup = render({
      review: null,
      diffs: {},
    });
    expect(markup).toContain('data-testid="change-review-empty"');
    expect(markup).toContain("working tree");
    expect(markup).toContain("0 files");
    expect(markup).not.toContain('data-testid="change-review-expand-window"');
  });

  test("shows word-level marks only on the bytes that changed", () => {
    const markup = render();
    expect(markup).toContain('data-kind="removed"');
    expect(markup).toContain('data-kind="added"');
    expect(markup).toContain('data-changed="true"');
    expect(markup).toContain("export const DEFAULT_CHAT_FONT_SIZE = ");
    expect(markup).not.toContain("export const DEFAULT_CHAT_FONT_SIZE = 15;</span>");
  });

  test("offers gap expansion only when the caller can fetch file lines", () => {
    expect(render()).not.toContain('data-testid="change-review-expand-gap"');
    const expandable = render({ onRequestFileLines: async () => ["a", "b"] });
    expect(expandable).toContain('data-testid="change-review-expand-gap"');
    expect(expandable).toContain("33 unmodified lines");
  });
});
