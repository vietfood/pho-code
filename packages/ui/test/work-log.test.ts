import { beforeEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  countWorkBlocks,
  formatWorkDuration,
  groupLiveWorkPhases,
  groupTranscriptSegments,
  groupWorkPhases,
  isTurnOutputText,
  lastTextBearingMessage,
  settledWorkSummary,
  turnTextOutput,
  workedForLabel,
  workPhaseSummary,
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

  test("groups a turn into narrative phases headed by pre-tool text", () => {
    const tool = (callId: string) => ({
      type: "tool" as const,
      callId,
      name: "bash",
      status: "completed" as const,
      inputPreview: "{}",
      outputPreview: "ok",
    });
    const phases = groupWorkPhases([
      { type: "thinking", text: "think A" },
      { type: "text", text: "search …" },
      tool("B"),
      tool("C"),
      { type: "thinking", text: "think D" },
      { type: "text", text: "editing tokens" },
      tool("E"),
      tool("F"),
      { type: "text", text: "Here is the answer." },
    ]);
    expect(phases).toHaveLength(2);
    expect(phases[0]?.narration?.text).toBe("search …");
    expect(phases[0]?.entries.map((entry) => (entry.type === "tool" ? entry.callId : entry.type))).toEqual([
      "thinking",
      "B",
      "C",
    ]);
    expect(phases[1]?.narration?.text).toBe("editing tokens");
    expect(phases[1]?.entries.map((entry) => (entry.type === "tool" ? entry.callId : entry.type))).toEqual([
      "thinking",
      "E",
      "F",
    ]);
  });

  test("keeps work before the first narration in an unlabeled phase", () => {
    const phases = groupWorkPhases([
      { type: "thinking", text: "think A" },
      {
        type: "tool",
        callId: "B",
        name: "bash",
        status: "completed",
        inputPreview: "{}",
        outputPreview: "ok",
      },
      { type: "text", text: "next step" },
      {
        type: "tool",
        callId: "C",
        name: "bash",
        status: "completed",
        inputPreview: "{}",
        outputPreview: "ok",
      },
    ]);
    expect(phases).toHaveLength(2);
    expect(phases[0]?.narration).toBeUndefined();
    expect(phases[0]?.entries).toHaveLength(2);
    expect(phases[1]?.narration?.text).toBe("next step");
    expect(phases[1]?.entries).toHaveLength(1);
  });

  test("absorbs a thinking-only lead-in into the first narrated phase", () => {
    const phases = groupWorkPhases([
      { type: "thinking", text: "think A" },
      { type: "text", text: "search …" },
      {
        type: "tool",
        callId: "B",
        name: "bash",
        status: "completed",
        inputPreview: "{}",
        outputPreview: "ok",
      },
    ]);
    expect(phases).toHaveLength(1);
    expect(phases[0]?.entries.map((entry) => entry.type)).toEqual(["thinking", "tool"]);
  });

  test("keeps consecutive narrations as separate phases, one possibly empty", () => {
    const phases = groupWorkPhases([
      { type: "text", text: "first thought" },
      { type: "text", text: "actually, search" },
      {
        type: "tool",
        callId: "B",
        name: "bash",
        status: "completed",
        inputPreview: "{}",
        outputPreview: "ok",
      },
    ]);
    expect(phases).toHaveLength(2);
    expect(phases[0]?.narration?.text).toBe("first thought");
    expect(phases[0]?.entries).toHaveLength(0);
    expect(phases[1]?.narration?.text).toBe("actually, search");
    expect(phases[1]?.entries).toHaveLength(1);
  });

  test("treats every live text entry as narration", () => {
    const phases = groupLiveWorkPhases([
      { type: "thinking", text: "think A" },
      { type: "text", text: "search …" },
      {
        type: "tool",
        callId: "B",
        name: "bash",
        status: "running",
        inputPreview: "{}",
        outputPreview: "",
      },
    ]);
    expect(phases).toHaveLength(1);
    expect(phases[0]?.narration?.text).toBe("search …");
    expect(phases[0]?.entries.map((entry) => entry.type)).toEqual(["thinking", "tool"]);
  });

  test("derives terse phase summaries from the phase's tools", () => {
    const tool = (callId: string, name: string, inputPreview = "") => ({
      type: "tool" as const,
      callId,
      name,
      status: "completed" as const,
      inputPreview,
      outputPreview: "",
    });
    expect(workPhaseSummary([tool("1", "edit", '{"path":"src/theme.css"}')])).toBe("editing theme.css");
    expect(
      workPhaseSummary([
        tool("1", "edit", '{"path":"a.ts"}'),
        tool("2", "write", '{"path":"b.ts"}'),
        tool("3", "edit", '{"path":"c.ts"}'),
      ]),
    ).toBe("editing 3 files");
    expect(workPhaseSummary([tool("1", "bash", '{"command":"npm run build --workspace packages/ui --force"}')])).toBe(
      "running npm run build --workspace packa…",
    );
    // Dominant activity wins on a mixed phase.
    expect(
      workPhaseSummary([
        tool("1", "grep", '{"pattern":"token"}'),
        tool("2", "edit", '{"path":"a.ts"}'),
        tool("3", "edit", '{"path":"b.ts"}'),
      ]),
    ).toBe("editing 2 files");
    // Web search and unknown tools stay clean without a target.
    expect(workPhaseSummary([tool("1", "web_search", '{"query":"pho code"}')])).toBe("searching the web");
    expect(workPhaseSummary([tool("1", "edit")])).toBe("editing");
    // No tools, no label.
    expect(workPhaseSummary([{ type: "thinking", text: "hmm" }])).toBeNull();
    expect(workPhaseSummary([])).toBeNull();
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
    expect(markup).not.toContain('data-testid="thinking-star"');
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
    expect(markup).not.toContain('data-testid="thinking-star"');
    expect(markup).not.toContain('data-testid="agent-loading"');
  });
});

describe("narrative work phases in the transcript", () => {
  test("live run renders narration as a prose phase heading above indented entries", () => {
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
      messages: [],
      run: {
        runId: "r1",
        status: "streaming",
        streamingText: "Writing the answer…",
        startedAt: "2026-08-13T00:08:00.000Z",
        work: [
          { type: "thinking", text: "think A" },
          { type: "text", text: "search …" },
          {
            type: "tool",
            callId: "t1",
            name: "bash",
            status: "completed",
            inputPreview: '{"command":"ls"}',
            outputPreview: "ok",
          },
        ],
      },
      models: [],
      sessions: [],
      features: emptyFeatureSnapshot(),
      thinkingLevel: "off",
      availableThinkingLevels: ["off"],
      supportsThinking: false,
    };

    const markup = renderToStaticMarkup(createElement(Transcript, { snapshot }));
    expect(markup).toContain('data-testid="live-work"');
    expect(markup).toContain('data-testid="work-phase"');
    expect(markup).toContain('data-testid="work-narration"');
    // Narration prose heads the phase; a terse tool-derived label sits above the indented entries.
    expect(markup).toContain('data-testid="work-phase-summary"');
    expect(markup).toContain("running ls");
    expect(markup.indexOf("search …")).toBeLessThan(markup.indexOf('data-testid="work-phase-summary"'));
    expect(markup.indexOf('data-testid="work-phase-summary"')).toBeLessThan(markup.indexOf('data-testid="tool-card"'));
    // The thinking that produced the narration sits inside the same phase.
    expect(markup.indexOf("search …")).toBeLessThan(markup.indexOf('data-testid="thinking-block"'));
    // The post-tool tail still streams below the work phases.
    expect(markup).toContain('data-testid="streaming-text"');
    expect(markup).toContain("Writing the answer…");
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
