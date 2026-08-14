import { beforeEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  countWorkBlocks,
  formatWorkDuration,
  groupTranscriptSegments,
  settledWorkSummary,
  workedForLabel,
} from "../src/lib/work-log";
import { WorkLogToggle } from "../src/work-log-toggle";
import { Transcript } from "../src/transcript";
import { emptyFeatureSnapshot, idleRunState, type SessionSnapshot } from "@pho-code/protocol";
import { resetLiveRunStore } from "../src/lib/live-run-store";

beforeEach(() => {
  resetLiveRunStore();
});

describe("work log helpers", () => {
  test("counts thoughts and tools", () => {
    expect(
      countWorkBlocks([
        { type: "thinking", text: "a" },
        { type: "tool", callId: "1", name: "bash", status: "completed", inputPreview: "", outputPreview: "" },
        { type: "text", text: "done" },
        { type: "thinking", text: "b" },
      ]),
    ).toEqual({ thoughts: 2, tools: 1, steps: 3 });
  });

  test("formats durations and cute settled activity summaries", () => {
    expect(formatWorkDuration(41_000)).toBe("41s");
    expect(formatWorkDuration(8 * 60_000 + 41_000)).toBe("8m 41s");
    expect(settledWorkSummary(2, 1)).toBe("Thought, then peeked");
    expect(settledWorkSummary(1, 0)).toBe("Had a quick think");
    expect(settledWorkSummary(0, 3)).toBe("Looked around a bit");
    expect(
      workedForLabel({
        live: false,
        thoughts: 2,
        tools: 1,
      }),
    ).toBe("Thought, then peeked");
    expect(
      workedForLabel({
        live: true,
        startedAt: "2026-08-13T00:00:00.000Z",
        nowMs: Date.parse("2026-08-13T00:01:12.000Z"),
      }),
    ).toBe("Working for 1m 12s");
  });

  test("groups consecutive assistant messages into one turn", () => {
    const segments = groupTranscriptSegments([
      { id: "u1", role: "user", blocks: [{ type: "text", text: "hi" }] },
      {
        id: "a1",
        role: "assistant",
        blocks: [{ type: "thinking", text: "plan" }],
        createdAt: "2026-08-13T00:00:00.000Z",
      },
      {
        id: "a2",
        role: "assistant",
        blocks: [
          {
            type: "tool",
            callId: "t1",
            name: "bash",
            status: "completed",
            inputPreview: "{}",
            outputPreview: "ok",
          },
          { type: "text", text: "done" },
        ],
        createdAt: "2026-08-13T00:01:00.000Z",
      },
      { id: "u2", role: "user", blocks: [{ type: "text", text: "next" }] },
    ]);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toMatchObject({ kind: "user" });
    expect(segments[1]).toMatchObject({ kind: "assistantTurn" });
    if (segments[1]?.kind === "assistantTurn") {
      expect(segments[1].messages).toHaveLength(2);
    }
    expect(segments[2]).toMatchObject({ kind: "user" });
  });
});

describe("work log toggle", () => {
  test("renders the settled activity label", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkLogToggle, {
        label: "Thought, then peeked",
        expanded: false,
        onToggle: () => undefined,
      }),
    );
    expect(markup).toContain("Thought, then peeked");
    expect(markup).toContain('data-testid="work-log-toggle"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('data-testid="agent-loading"');
  });

  test("keeps the Working label while a run is live", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkLogToggle, {
        label: "Working",
        expanded: true,
        live: true,
        startedAt: new Date().toISOString(),
        onToggle: () => undefined,
      }),
    );
    expect(markup).toContain("Working");
    expect(markup).not.toContain('data-testid="agent-loading"');
  });
});

describe("assistant turn work collapse", () => {
  test("collapses an entire multi-message turn behind one activity summary control", () => {
    const snapshot: SessionSnapshot = {
      session: {
        id: "s1",
        workspaceId: "/tmp/ws",
        title: "Session",
        updatedAt: "2026-08-13T00:08:41.000Z",
      },
      workspace: {
        id: "/tmp/ws",
        path: "/tmp/ws",
        displayName: "ws",
        lastOpenedAt: "2026-08-13T00:00:00.000Z",
        projectResourcesApproved: true,
      },
      messages: [
        {
          id: "a1",
          role: "assistant",
          createdAt: "2026-08-13T00:00:00.000Z",
          blocks: [{ type: "thinking", text: "hidden thought from first assistant message" }],
        },
        {
          id: "a2",
          role: "assistant",
          createdAt: "2026-08-13T00:08:41.000Z",
          blocks: [
            {
              type: "tool",
              callId: "t1",
              name: "bash",
              status: "completed",
              inputPreview: '{"command":"ls"}',
              outputPreview: "ok",
            },
            { type: "text", text: "Final answer only." },
          ],
        },
      ],
      run: idleRunState(),
      models: [],
      sessions: [],
      features: emptyFeatureSnapshot(),
      thinkingLevel: "off",
      availableThinkingLevels: ["off"],
      supportsThinking: false,
    };

    const markup = renderToStaticMarkup(createElement(Transcript, { snapshot }));
    expect(markup).toContain('data-testid="assistant-turn"');
    expect(markup).toContain("Thought, then peeked");
    expect(markup).not.toContain("Worked for");
    expect(markup).toContain("Final answer only.");
    expect(markup).toContain('data-testid="copy-assistant-output"');
    expect(markup).toContain('aria-label="Copy"');
    expect(markup).not.toContain('data-testid="edit-assistant-output"');
    expect(markup).not.toContain("hidden thought from first assistant message");
    expect(markup).not.toContain("Bash completed");
    // One turn-level toggle, not one per assistant message.
    expect(markup.match(/data-testid="work-log-toggle"/gu)?.length).toBe(1);
  });

  test("offers Edit next to Copy when rewrite is available and marks rewritten output", () => {
    const snapshot: SessionSnapshot = {
      session: {
        id: "s1",
        workspaceId: "/tmp/ws",
        title: "Session",
        updatedAt: "2026-08-13T00:08:41.000Z",
      },
      workspace: {
        id: "/tmp/ws",
        path: "/tmp/ws",
        displayName: "ws",
        lastOpenedAt: "2026-08-13T00:00:00.000Z",
        projectResourcesApproved: true,
      },
      messages: [
        {
          id: "a1",
          role: "assistant",
          createdAt: "2026-08-13T00:00:00.000Z",
          blocks: [{ type: "text", text: "$$x^2$$", originalText: "broken latex" }],
        },
      ],
      run: idleRunState(),
      models: [],
      sessions: [],
      features: emptyFeatureSnapshot(),
      thinkingLevel: "off",
      availableThinkingLevels: ["off"],
      supportsThinking: false,
    };

    const markup = renderToStaticMarkup(
      createElement(Transcript, { snapshot, onRewrite: () => undefined }),
    );
    expect(markup).toContain('data-testid="edit-assistant-output"');
    expect(markup).toContain('data-testid="rewritten-assistant-output"');
    expect(markup).toContain("Edited");
    expect(markup).toContain("x^2");
  });
});
