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
    expect(markup).toContain('data-testid="composer-rail"');
    expect(markup).toContain('data-testid="composer-rail-workspace"');
    expect(markup).toContain("piui");
    expect(markup).toContain(localMachineLabel(isMacDesktop()));
    expect(markup).toContain("Ask anything");
    expect(markup).toContain('data-testid="composer"');
    expect(markup).not.toContain('data-testid="transcript"');
    expect(markup).not.toContain("Start this session");
    expect(markup).toContain('data-right-overlay="true"');
    expect(markup).not.toContain("data-left-overlay");
  });

  test("insets the hero composer for collapsed overlay pills", () => {
    const bothPills = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot(),
        sidebarCollapsed: true,
        ...handlers,
      }),
    );
    expect(bothPills).toContain('data-left-overlay="true"');
    expect(bothPills).toContain('data-right-overlay="true"');

    const split = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot(),
        sidebarCollapsed: true,
        splitActive: true,
        onToggleSidebar: () => undefined,
        ...handlers,
      }),
    );
    expect(split).not.toContain("data-left-overlay");
    expect(split).not.toContain("data-right-overlay");
  });

  test("does not put Context prompt or changes controls in the chat header", () => {
    const emptyMarkup = renderToStaticMarkup(createElement(Conversation, { snapshot: snapshot(), ...handlers }));
    expect(emptyMarkup).not.toContain('data-testid="context-prompt-header"');
    expect(emptyMarkup).not.toContain('data-testid="toggle-change-review"');
    expect(emptyMarkup).not.toContain('data-testid="context-prompt-dialog"');

    const filledMarkup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          messages: [{ id: "m1", role: "user", blocks: [{ type: "text", text: "hello" }] }],
        }),
        ...handlers,
      }),
    );
    expect(filledMarkup).not.toContain('data-testid="context-prompt-header"');
    expect(filledMarkup).not.toContain("· Custom");
  });

  test("does not mark the header when this session’s context prompt is customized", () => {
    const markup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          contextPrompt: {
            customized: true,
            editable: true,
            preamble: "Custom preamble",
            defaultPreamble: "Default preamble",
            compiled: "Custom preamble",
            sections: [],
          },
        }),
        ...handlers,
      }),
    );
    expect(markup).not.toContain('data-testid="context-prompt-header"');
    expect(markup).not.toContain("· Custom");
  });

  test("does not show a changes header toggle when a review set exists", () => {
    const withoutReview = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot(),
        ...handlers,
        onOpenChangeReview: () => undefined,
      }),
    );
    expect(withoutReview).not.toContain('data-testid="toggle-change-review"');

    const withReview = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          changeReviews: [
            {
              workspaceId: "/tmp/ws",
              sessionId: "s1",
              runId: "r1",
              revision: 1,
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
                },
              ],
            },
          ],
        }),
        ...handlers,
        onOpenChangeReview: () => undefined,
      }),
    );
    expect(withReview).not.toContain('data-testid="toggle-change-review"');
    expect(withReview).not.toContain("Show changes");
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
    expect(markup).toContain("transcript-scroller");
    expect(markup).toContain("chat-column");
    // The chat header belongs to the region topbar, not the body.
    expect(markup).not.toContain('data-testid="chat-title"');
    expect(markup).not.toContain("max-w-3xl");
    expect(markup).not.toContain("scrollbar-gutter-both");
    expect(markup).not.toContain('data-testid="composer-rail-machine"');
    expect(markup).not.toContain('data-testid="composer-rail-workspace"');
  });

  test("shows toolbar usage and model selector chrome under the field", () => {
    const markup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          messages: [{ id: "m1", role: "user", blocks: [{ type: "text", text: "hello" }] }],
        }),
        ...handlers,
        onSessionModeChange: () => undefined,
        onPickImages: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="composer-toolbar"');
    expect(markup).toContain('data-testid="composer-usage-trigger"');
    expect(markup).toContain('data-testid="composer-context-ring"');
    expect(markup).not.toContain('data-testid="composer-usage-info"');
    expect(markup).not.toContain("composer-usage-input");
    expect(markup).not.toContain("composer-usage-cost");
    expect(markup).toContain('aria-label="Session usage 6.2%/200k, $0.042"');
    expect(markup).toContain('data-testid="composer-context-button"');
    expect(markup).toContain("composer-context-button is-agent");
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

  test("renders backend Fast mode as a separate toggle", () => {
    const markup = renderToStaticMarkup(createElement(Conversation, {
      snapshot: snapshot({ fastMode: { enabled: true, description: "Faster responses" } }),
      ...handlers,
      onFastModeChange: () => undefined,
    }));
    expect(markup).toContain('data-testid="fast-mode-toggle"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("composer-fast-toggle is-active");
  });

  test("renders skill tokens in user messages as chips with a book glyph", () => {
    const markup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          messages: [
            {
              id: "m1",
              role: "user",
              blocks: [{ type: "text", text: "/pho-code:repository-investigation please" }],
            },
          ],
        }),
        ...handlers,
      }),
    );
    expect(markup).toContain('data-skill-name="repository-investigation"');
    expect(markup).toContain("skill-chip");
    expect(markup).toContain("repository-investigation");
    expect(markup).toContain("please");
    expect(markup).toContain('title="Built in · repository-investigation"');
    expect(markup).toContain("M12 7v14");
    expect(markup).not.toContain(">Ph</span>");
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

  test("renders github repo urls in user messages as chips", () => {
    const markup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          messages: [
            {
              id: "m1",
              role: "user",
              blocks: [
                {
                  type: "text",
                  text: "learn my repo https://github.com/vietfood/comtam",
                },
              ],
            },
          ],
        }),
        ...handlers,
      }),
    );
    expect(markup).toContain('data-github-url="https://github.com/vietfood/comtam"');
    expect(markup).toContain("github-chip");
    expect(markup).toContain("vietfood/comtam");
    expect(markup).toContain("learn my repo ");
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
    expect(markup).not.toContain("Sending an image transmits it to the selected model provider.");
    expect(markup.indexOf('data-testid="composer-images"')).toBeLessThan(
      markup.indexOf('data-testid="composer"'),
    );
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

  test("shows shimmering Working text while the agent is waiting for tokens", () => {
    const markup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          messages: [{ id: "m1", role: "user", blocks: [{ type: "text", text: "hello" }] }],
          run: {
            status: "streaming",
            runId: "r1",
            streamingText: "\n  ",
            work: [],
            startedAt: "2026-08-13T00:00:00.000Z",
          },
        }),
        ...handlers,
      }),
    );
    expect(markup).toContain('data-testid="agent-working"');
    expect(markup).toContain("Working");
    expect(markup).toContain("working-shimmer");
    expect(markup).not.toContain('data-testid="thinking-star"');
    expect(markup).not.toContain("loading-state-grid");
    expect(markup).not.toContain("stream-caret");
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
    expect(markup).toContain("stream-caret");
    expect(markup).not.toContain("katex");
  });
});

describe("local machine label", () => {
  test("names macOS and other desktops honestly", () => {
    expect(localMachineLabel(true)).toBe("This Mac");
    expect(localMachineLabel(false)).toBe("This computer");
  });
});

describe("split-pane chat column", () => {
  test("keeps the capped chat column when the right sidebar is expanded", () => {
    const markup = renderToStaticMarkup(
      createElement(Conversation, {
        snapshot: snapshot({
          messages: [{ id: "m1", role: "user", blocks: [{ type: "text", text: "hello" }] }],
        }),
        splitActive: true,
        sidebarCollapsed: true,
        ...handlers,
      }),
    );
    // The column stays capped in split mode: the gap shrinks but never disappears.
    expect(markup).toContain("chat-column");
    expect(markup).not.toContain("data-chat-fill");
    // Sidebar pills and header actions render in the region topbar, not the body.
    expect(markup).not.toContain('data-testid="chat-title"');
    expect(markup).not.toContain("max-w-3xl");
    expect(markup).not.toContain('data-testid="app-sidebar-pill"');
  });
});
