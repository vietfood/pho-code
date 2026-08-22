import { beforeEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  countWorkBlocks,
  formatWorkDuration,
  groupTranscriptSegments,
  isTurnOutputText,
  isWorkLogBlock,
  lastTextBearingMessage,
  settledWorkSummary,
  turnTextOutput,
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

  test("treats text before a later tool as work-log narration", () => {
    const blocks = [
      { type: "thinking" as const, text: "plan" },
      { type: "text" as const, text: "I'll look around." },
      {
        type: "tool" as const,
        callId: "t1",
        name: "bash",
        status: "completed" as const,
        inputPreview: "{}",
        outputPreview: "ok",
      },
      { type: "text" as const, text: "Here is the answer." },
    ];
    expect(isWorkLogBlock(blocks, 0)).toBe(true);
    expect(isWorkLogBlock(blocks, 1)).toBe(true);
    expect(isTurnOutputText(blocks, 1)).toBe(false);
    expect(isTurnOutputText(blocks, 3)).toBe(true);
    expect(turnTextOutput(blocks)).toBe("Here is the answer.");
  });

  test("keeps all text when a turn never called a tool", () => {
    const blocks = [
      { type: "thinking" as const, text: "plan" },
      { type: "text" as const, text: "Hello." },
      { type: "text" as const, text: "More." },
    ];
    expect(isTurnOutputText(blocks, 1)).toBe(true);
    expect(isTurnOutputText(blocks, 2)).toBe(true);
    expect(turnTextOutput(blocks)).toBe("Hello.\n\nMore.");
  });

  test("picks the last message that still has post-tool text", () => {
    const last = lastTextBearingMessage([
      {
        id: "a1",
        role: "assistant",
        blocks: [
          { type: "text", text: "I'll look around." },
          {
            type: "tool",
            callId: "t1",
            name: "bash",
            status: "completed",
            inputPreview: "{}",
            outputPreview: "ok",
          },
        ],
      },
      {
        id: "a2",
        role: "assistant",
        blocks: [{ type: "text", text: "Here is the answer." }],
      },
    ]);
    expect(last?.id).toBe("a2");
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
    expect(markup).toContain('data-testid="working-star"');
    expect(markup).not.toContain("working-shimmer");
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
    expect(markup).toContain("working-shimmer");
    expect(markup).toContain('data-testid="working-star"');
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
          blocks: [
            { type: "thinking", text: "hidden thought from first assistant message" },
            { type: "text", text: "I'll look around." },
          ],
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
    expect(markup).not.toContain("I'll look around.");
    expect(markup).toContain('data-testid="copy-assistant-output"');
    expect(markup).toContain('aria-label="Copy"');
    expect(markup).not.toContain(">Copy</span>");
    expect(markup).not.toContain('data-testid="edit-assistant-output"');
    expect(markup).not.toContain("hidden thought from first assistant message");
    expect(markup).not.toContain("Bash completed");
    expect(markup).not.toContain('data-testid="work-narration"');
    // One turn-level toggle, not one per assistant message.
    expect(markup.match(/data-testid="work-log-toggle"/gu)?.length).toBe(1);
  });

  test("offers icon-only Edit next to Copy when rewrite is available and marks rewritten output", () => {
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
    expect(markup).toContain('aria-label="Edit"');
    expect(markup).not.toContain(">Edit</span>");
    expect(markup).toContain('data-testid="rewritten-assistant-output"');
    expect(markup).toContain("Edited");
    expect(markup).toContain("x^2");
  });
});
