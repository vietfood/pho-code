import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyFeatureSnapshot, idleRunState, type SessionSnapshot } from "@pho-code/protocol";
import { Conversation } from "../src/conversation";
import { isMacDesktop, localMachineLabel } from "../src/lib/platform";

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
    models: [{ provider: "test", id: "echo", name: "Echo" }],
    model: { provider: "test", id: "echo", name: "Echo" },
    sessions: [],
    features: emptyFeatureSnapshot(),
    thinkingLevel: "high",
    availableThinkingLevels: ["off", "high"],
    supportsThinking: true,
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
  });
});

describe("local machine label", () => {
  test("names macOS and other desktops honestly", () => {
    expect(localMachineLabel(true)).toBe("This Mac");
    expect(localMachineLabel(false)).toBe("This computer");
  });
});
