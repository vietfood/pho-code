import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChangeDiffPage, ChangeReviewSetSnapshot } from "@pho-code/protocol";
import { ChangeReviewWindow } from "../src/change-review-window";
import {
  CHANGES_WINDOW_INSET_PX,
  clampChangesWindowFrame,
  defaultChangesWindowFrame,
  MIN_CHANGES_WINDOW_HEIGHT_PX,
  MIN_CHANGES_WINDOW_WIDTH_PX,
} from "../src/lib/change-window-frame";

const viewport = { width: 1440, height: 900 };

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
  return renderToStaticMarkup(
    createElement(ChangeReviewWindow, {
      review,
      diffs: { "packages/protocol/src/settings.ts": diff },
      contextLines: 3,
      onEnsureDiff: () => undefined,
      onApprove: () => undefined,
      onApproveAll: () => undefined,
      onExpand: () => undefined,
      ...overrides,
    }),
  );
}

describe("stacked changes pane", () => {
  test("stacks files in the sidebar with expand and visible diff tools", () => {
    const markup = render();
    expect(markup).toContain('data-testid="change-review-window"');
    expect(markup).not.toContain('data-testid="change-review-window-host"');
    expect(markup).toContain("working tree");
    expect(markup).toContain("2 files");
    expect(markup).toContain("composer.tsx");
    expect(markup).toContain("settings.ts");
    expect(markup).toContain('data-testid="change-review-window-file"');
    expect(markup).toContain('data-testid="change-review-expand-window"');
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

  test("keeps overlay chrome and hides search until tools are opened", () => {
    const markup = render({ variant: "overlay", onClose: () => undefined, onExpand: undefined });
    expect(markup).toContain('data-testid="change-review-window-host"');
    expect(markup).toContain('data-testid="change-review-window-close"');
    expect(markup).toContain('data-testid="change-review-window-maximize"');
    expect(markup).toContain('data-testid="change-review-window-tools"');
    expect(markup).toContain('data-testid="change-review-window-resize"');
    expect(markup).toContain("composer.tsx");
    expect(markup).toContain("settings.ts");
    expect(markup).not.toContain('data-testid="change-review-expand-window"');
    expect(markup).not.toContain('data-testid="change-review-search"');
    expect(markup).not.toContain('data-testid="change-review-whitespace"');
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

  test("anchors the default overlay to the right with air around it", () => {
    const frame = defaultChangesWindowFrame(viewport);
    expect(frame.width).toBeGreaterThanOrEqual(MIN_CHANGES_WINDOW_WIDTH_PX);
    expect(frame.height).toBeGreaterThanOrEqual(MIN_CHANGES_WINDOW_HEIGHT_PX);
    expect(frame.y).toBe(CHANGES_WINDOW_INSET_PX);
    expect(frame.x).toBe(viewport.width - frame.width - CHANGES_WINDOW_INSET_PX);
    expect(frame.x).toBeGreaterThan(viewport.width * 0.3);

    const offscreen = clampChangesWindowFrame({ x: 5_000, y: 5_000, width: 800, height: 600 }, viewport);
    expect(offscreen.x).toBeLessThanOrEqual(viewport.width - 96);
    expect(offscreen.y).toBeLessThanOrEqual(viewport.height - 96);

    const tiny = clampChangesWindowFrame({ x: 0, y: 0, width: 10, height: 10 }, viewport);
    expect(tiny.width).toBe(MIN_CHANGES_WINDOW_WIDTH_PX);
    expect(tiny.height).toBe(MIN_CHANGES_WINDOW_HEIGHT_PX);

    const small = clampChangesWindowFrame({ x: 0, y: 0, width: 800, height: 600 }, { width: 400, height: 300 });
    expect(small.width).toBe(MIN_CHANGES_WINDOW_WIDTH_PX);
    expect(small.height).toBe(MIN_CHANGES_WINDOW_HEIGHT_PX);
  });
});
