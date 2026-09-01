import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  emptyFeatureSnapshot,
  idleRunState,
  type SessionSnapshot,
  type TranscriptCompactionBoundary,
  type TranscriptMessage,
} from "@pho-code/protocol";
import { groupTranscriptSegments } from "../src/lib/work-log";
import { Transcript } from "../src/transcript";
import { CompactionSection } from "../src/composer-usage";

function userMessage(id: string, text: string): TranscriptMessage {
  return { id, role: "user", blocks: [{ type: "text", text }] };
}

function assistantMessage(id: string, text: string): TranscriptMessage {
  return { id, role: "assistant", blocks: [{ type: "text", text }] };
}

function boundary(id: string, overrides: Partial<TranscriptCompactionBoundary> = {}): TranscriptCompactionBoundary {
  return {
    kind: "compaction",
    id,
    createdAt: "2026-09-01T00:05:00.000Z",
    tokensBefore: 12_400,
    hasSummary: true,
    fromHook: false,
    ...overrides,
  };
}

function snapshotWith(messages: SessionSnapshot["messages"]): SessionSnapshot {
  return {
    session: {
      id: "s1",
      workspaceId: "/tmp/ws",
      title: "Session",
      updatedAt: "2026-09-01T00:08:41.000Z",
    },
    workspace: {
      id: "/tmp/ws",
      path: "/tmp/ws",
      displayName: "ws",
      lastOpenedAt: "2026-09-01T00:00:00.000Z",
      projectResourcesApproved: true,
    },
    messages,
    run: idleRunState(),
    models: [],
    sessions: [],
    features: emptyFeatureSnapshot(),
    thinkingLevel: "off",
    availableThinkingLevels: ["off"],
    supportsThinking: false,
    compaction: { status: "idle", cancelable: false },
  };
}

describe("transcript grouping around compaction boundaries", () => {
  test("a boundary is a hard separator that never merges adjacent assistant work", () => {
    const segments = groupTranscriptSegments([
      userMessage("u1", "first"),
      assistantMessage("a1", "old answer"),
      assistantMessage("a2", "old follow-up"),
      boundary("c1"),
      userMessage("u2", "second"),
      assistantMessage("a3", "new answer"),
    ]);
    expect(segments.map((segment) => segment.kind)).toEqual([
      "user",
      "assistantTurn",
      "compaction",
      "user",
      "assistantTurn",
    ]);
    const before = segments[1];
    const after = segments[4];
    if (before?.kind === "assistantTurn" && after?.kind === "assistantTurn") {
      expect(before.messages.map((message) => message.id)).toEqual(["a1", "a2"]);
      expect(after.messages.map((message) => message.id)).toEqual(["a3"]);
    }
    const marker = segments[2];
    if (marker?.kind === "compaction") {
      expect(marker.boundary.id).toBe("c1");
    }
  });

  test("consecutive boundaries and a leading boundary stay distinct segments", () => {
    const segments = groupTranscriptSegments([
      boundary("c1"),
      boundary("c2", { hasSummary: false }),
      userMessage("u1", "hi"),
    ]);
    expect(segments.map((segment) => segment.kind)).toEqual(["compaction", "compaction", "user"]);
  });
});

describe("compaction boundary row", () => {
  test("renders the label, reason, token title, and summary toggle", () => {
    const markup = renderToStaticMarkup(
      createElement(Transcript, {
        snapshot: snapshotWith([
          userMessage("u1", "hello"),
          boundary("c1", { reason: "manual", estimatedTokensAfter: 3_100 }),
          assistantMessage("a1", "continued"),
        ]),
        onReadCompactionDetail: () => Promise.reject(new Error("not needed")),
      }),
    );
    expect(markup).toContain('data-testid="compaction-boundary"');
    expect(markup).toContain('data-compaction-id="c1"');
    expect(markup).toContain("Context compacted");
    expect(markup).toContain("· Manual");
    expect(markup).toContain("12,400 → ~3,100 tokens");
    expect(markup).toContain('data-testid="compaction-summary-toggle"');
    expect(markup).toContain("Show summary");
    expect(markup).toContain('aria-expanded="false"');
    // Collapsed by default: no summary surface in the static tree.
    expect(markup).not.toContain('data-testid="compaction-summary"');
    // Messages on both sides still render.
    expect(markup).toContain("hello");
    expect(markup).toContain("continued");
  });

  test("omits the toggle and reason when the boundary has no summary or reason", () => {
    const markup = renderToStaticMarkup(
      createElement(Transcript, {
        snapshot: snapshotWith([boundary("c2", { hasSummary: false })]),
      }),
    );
    expect(markup).toContain('data-testid="compaction-boundary"');
    expect(markup).toContain("Context compacted");
    expect(markup).toContain('title="12,400 tokens"');
    expect(markup).not.toContain('data-testid="compaction-summary-toggle"');
    expect(markup).not.toContain("· Manual");
  });

  test("a hook cutover boundary is marked as compacted from notes with honest copy", () => {
    const markup = renderToStaticMarkup(
      createElement(Transcript, {
        snapshot: snapshotWith([boundary("c3", { fromHook: true, reason: "manual" })]),
      }),
    );
    expect(markup).toContain("Context compacted from notes");
    expect(markup).toContain("· Manual");
    expect(markup).toContain("Earlier work left the model context and stays searchable.");
    expect(markup).not.toContain("Context compacted<");
  });
});

describe("composer usage compaction action", () => {
  test("offers Compact context while idle", () => {
    const markup = renderToStaticMarkup(
      createElement(CompactionSection, {
        action: {
          state: { status: "idle", cancelable: false },
          onCompact: () => undefined,
          onCancel: () => undefined,
        },
      }),
    );
    expect(markup).toContain('data-testid="composer-usage-compaction"');
    expect(markup).toContain('data-testid="compact-context"');
    expect(markup).toContain("Compact context");
    expect(markup).not.toContain("disabled");
    expect(markup).not.toContain('data-testid="compact-unavailable"');
    // Honest current-vs-cumulative copy rides along.
    expect(markup).toContain("current window");
    expect(markup).toContain("cumulative");
  });

  test("explains why Compact is unavailable", () => {
    const markup = renderToStaticMarkup(
      createElement(CompactionSection, {
        action: {
          state: { status: "idle", cancelable: false },
          disabledReason: "Wait for the current run to finish before compacting.",
          onCompact: () => undefined,
          onCancel: () => undefined,
        },
      }),
    );
    expect(markup).toContain('data-testid="compact-context"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('data-testid="compact-unavailable"');
    expect(markup).toContain("Wait for the current run to finish before compacting.");
  });

  test("shows busy status and Cancel only while cancelable", () => {
    const cancelable = renderToStaticMarkup(
      createElement(CompactionSection, {
        action: {
          state: {
            status: "compacting",
            reason: "manual",
            startedAt: "2026-09-01T00:00:00.000Z",
            cancelable: true,
          },
          onCompact: () => undefined,
          onCancel: () => undefined,
        },
      }),
    );
    expect(cancelable).toContain("Compacting…");
    expect(cancelable).toContain('role="status"');
    expect(cancelable).toContain('data-testid="cancel-compaction"');
    expect(cancelable).not.toContain('data-testid="compact-context"');

    // Automatic compaction belongs to the run: no dedicated cancel control.
    const automatic = renderToStaticMarkup(
      createElement(CompactionSection, {
        action: {
          state: {
            status: "compacting",
            reason: "threshold",
            startedAt: "2026-09-01T00:00:00.000Z",
            cancelable: false,
          },
          onCompact: () => undefined,
          onCancel: () => undefined,
        },
      }),
    );
    expect(automatic).toContain("Compacting…");
    expect(automatic).not.toContain('data-testid="cancel-compaction"');
  });
});
