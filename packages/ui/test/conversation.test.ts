import { describe, expect, test, beforeEach } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyFeatureSnapshot, idleRunState, type SessionSnapshot } from "@pho-code/protocol";
import { Conversation } from "../src/conversation";
import { isMacDesktop, localMachineLabel } from "../src/lib/platform";
import { resetLiveRunStore } from "../src/lib/live-run-store";

const testModel = {
  provider: "deepseek",
  id: "echo",
  name: "Echo",
  contextWindow: 200_000,
  cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
};

function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    session: {
      id: "s1",
      workspaceId: "/tmp/ws",
      title: "New session",
      updatedAt: "2026-08-13T00:00:00.000Z",
    },
    workspace: {
      id: "/tmp/ws",
      path: "/tmp/ws",
      displayName: "piui",
      lastOpenedAt: "2026-08-13T00:00:00.000Z",
      projectResourcesApproved: true,
    },
    messages: [],
    run: idleRunState(),
    models: [testModel],
    model: testModel,
    sessions: [],
    features: emptyFeatureSnapshot(),
    thinkingLevel: "max",
    availableThinkingLevels: ["off", "low", "high", "max"],
    supportsThinking: true,
    usage: {
      input: 1_200,
      output: 800,
      cacheRead: 500,
      cacheWrite: 0,
      total: 2_500,
      costUsd: 0.042,
    },
    contextUsage: { tokens: 12_400, contextWindow: 200_000, percent: 6.2 },
    ...overrides,
  };
}

const handlers = {
  draft: "",
  onDraftChange: () => undefined,
  onSubmit: () => undefined,
  onStop: () => undefined,
  onModelChange: () => undefined,
  onThinkingChange: () => undefined,
};

beforeEach(() => {
  resetLiveRunStore();
});

describe("empty session hero", () => {
  test("centers a hero composer with workspace and local machine context", () => {
    const markup = renderToStaticMarkup(createElement(Conversation, { snapshot: snapshot(), ...handlers }));
    expect(markup).toContain('data-testid="empty-session"');
    expect(markup).toContain('data-testid="session-context"');
    expect(markup).toContain("piui");
    expect(markup).toContain(localMachineLabel(isMacDesktop()));
    expect(markup).toContain("Ask anything");
    expect(markup).toContain("Send a message to start chatting in this workspace.");
    expect(markup).toContain('data-testid="composer"');
    expect(markup).not.toContain('data-testid="transcript"');
    expect(markup).not.toContain("Start this session");
  });

  test("docks the composer once the transcript has a message", () => {
    const markup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          messages: [{ id: "m1", role: "user", blocks: [{ type: "text", text: "hello" }] }],
        }),
        ...handlers,
      }),
    );
    expect(markup).not.toContain('data-testid="empty-session"');
    expect(markup).toContain('data-testid="transcript"');
    expect(markup).toContain("hello");
    expect(markup).toContain("Send follow-up");
    expect(markup).toContain("overflow-y-auto");
  });

  test("shows usage strip and model selector chrome", () => {
    const markup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          messages: [{ id: "m1", role: "user", blocks: [{ type: "text", text: "hello" }] }],
        }),
        ...handlers,
      }),
    );
    expect(markup).toContain('data-testid="composer-usage"');
    expect(markup).toContain("6.2%/200k");
    expect(markup).toContain("↑1.2k");
    expect(markup).toContain("↓800");
    expect(markup).toContain("R500");
    expect(markup).toContain("$0.042");
    expect(markup).toContain('data-testid="model-selector"');
    expect(markup).toContain('data-provider="deepseek"');
    expect(markup).toContain("M23.748 4.651");
    expect(markup).toContain('data-testid="thinking-selector"');
    expect(markup).toContain("composer-thinking-select is-max");
    expect(markup).toContain('data-composer-highlight="max"');
    expect(markup).toContain("Max");
  });

  test("renders @ references in user messages as mention chips", () => {
    const markup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          messages: [
            {
              id: "m1",
              role: "user",
              blocks: [{ type: "text", text: "Can you read @AGENTS.md" }],
            },
          ],
        }),
        ...handlers,
      }),
    );
    expect(markup).toContain('data-mention-path="AGENTS.md"');
    expect(markup).toContain("mention-chip");
    expect(markup).toContain("AGENTS.md");
    expect(markup).toContain("Can you read ");
  });

  test("renders quoted @ references with spaces as mention chips", () => {
    const markup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          messages: [
            {
              id: "m1",
              role: "user",
              blocks: [{ type: "text", text: 'Can you read @"KL divergence.md"' }],
            },
          ],
        }),
        ...handlers,
      }),
    );
    expect(markup).toContain('data-mention-path="KL divergence.md"');
    expect(markup).toContain("KL divergence.md");
  });

  test("renders admitted transcript images with a lightbox preview", () => {
    const preview =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const markup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          messages: [
            {
              id: "m1",
              role: "user",
              blocks: [
                { type: "text", text: "look at this" },
                { type: "image", name: "shot.png", mimeType: "image/png", previewDataUrl: preview },
              ],
            },
          ],
        }),
        ...handlers,
      }),
    );
    expect(markup).toContain('data-testid="transcript-image"');
    expect(markup).toContain('data-testid="markdown-image"');
    expect(markup).toContain(`src="${preview}"`);
    expect(markup).not.toContain('data-testid="transcript-image-placeholder"');
  });

  test("lets prepared composer images open a lightbox", () => {
    const preview =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const markup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot(),
        images: [
          {
            id: "img-1",
            name: "shot.png",
            mimeType: "image/png",
            byteLength: 80,
            width: 1,
            height: 1,
            previewDataUrl: preview,
          },
        ],
        ...handlers,
      }),
    );
    expect(markup).toContain('data-testid="prepared-image"');
    expect(markup).toContain('data-testid="markdown-image"');
    expect(markup).toContain(`src="${preview}"`);
    expect(markup).toContain('aria-label="Remove shot.png"');
  });

  test("keeps conversation chrome mounted while switching sessions", () => {
    const markup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          messages: [{ id: "m1", role: "user", blocks: [{ type: "text", text: "hello" }] }],
        }),
        switching: true,
        ...handlers,
      }),
    );
    expect(markup).toContain('data-testid="session-switching"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('data-testid="transcript"');
    expect(markup).toContain("hello");
  });

  test("shows steer and follow-up actions while a run is streaming", () => {
    const markup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          messages: [{ id: "m1", role: "user", blocks: [{ type: "text", text: "hello" }] }],
          run: { status: "streaming", runId: "r1", streamingText: "working", work: [] },
          queue: {
            steering: [{ text: "go left" }],
            followUp: [{ text: "then wrap up" }],
            steeringMode: "all",
            followUpMode: "all",
          },
        }),
        ...handlers,
      }),
    );
    expect(markup).toContain('data-testid="steer-button"');
    expect(markup).toContain("Steer current run");
    expect(markup).toContain('data-testid="follow-up-button"');
    expect(markup).toContain("Add follow-up");
    expect(markup).toContain("Steer or add a follow-up");
    expect(markup).toContain("Steer · go left");
    expect(markup).toContain("Follow-up · then wrap up");
    expect(markup).not.toContain('aria-label="Send"');
    const modelChunk = markup.slice(
      markup.indexOf('data-testid="model-selector"'),
      markup.indexOf('data-testid="model-selector"') + 220,
    );
    expect(modelChunk).toContain("disabled");
  });

  test("shows static Working text while the agent is waiting for tokens", () => {
    const markup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          messages: [{ id: "m1", role: "user", blocks: [{ type: "text", text: "hello" }] }],
          run: {
            status: "streaming",
            runId: "r1",
            streamingText: "",
            work: [],
            startedAt: "2026-08-13T00:00:00.000Z",
          },
        }),
        ...handlers,
      }),
    );
    expect(markup).toContain('data-testid="agent-working"');
    expect(markup).toContain("Working");
    expect(markup).not.toContain("loading-state-grid");
  });

  test("renders live tokens as sanitized markdown without KaTeX or Mermaid", () => {
    const markup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          messages: [{ id: "m1", role: "user", blocks: [{ type: "text", text: "hello" }] }],
          run: { status: "streaming", runId: "r1", streamingText: "**bold** and `code`", work: [] },
        }),
        ...handlers,
      }),
    );
    expect(markup).toContain('data-testid="streaming-text"');
    expect(markup).toContain('data-testid="markdown"');
    expect(markup).toContain("<strong>");
    expect(markup).toContain("<code>");
    expect(markup).toContain("streaming-caret");
    expect(markup).not.toContain("katex");
  });
});

describe("local machine label", () => {
  test("names macOS and other desktops honestly", () => {
    expect(localMachineLabel(true)).toBe("This Mac");
    expect(localMachineLabel(false)).toBe("This computer");
  });
});
