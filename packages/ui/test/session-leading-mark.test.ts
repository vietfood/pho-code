import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectContextMenu } from "../src/project-context-menu";
import { LoadingDots } from "../src/loading-dots";
import { SessionLeadingMark } from "../src/session-leading-mark";
import type { SessionActivitySummary } from "@pho-code/protocol";

describe("project context menu", () => {
  test("offers new session, a compact pathname, and remove project", () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectContextMenu, {
        x: 8,
        y: 12,
        path: "/Users/lenguyen/Documents/Workspace/Garden",
        busy: false,
        onNewSession: () => undefined,
        onRemove: () => undefined,
        onClose: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="project-context-menu"');
    expect(markup).toContain("New session");
    expect(markup).toContain("Copy pathname");
    expect(markup).toContain("Remove project");
    expect(markup).toContain("Garden");
    expect(markup).toContain('data-menu-key="n"');
    expect(markup).toContain('data-menu-key="c"');
    expect(markup).toContain('data-menu-key="d"');
    expect(markup).toContain("app-menu__item--danger");
    expect(markup).not.toContain("lucide-");
    expect(markup).not.toContain("Archive chat");
    expect(markup).not.toContain("Move chat to Trash");
  });
});

describe("session leading mark", () => {
  test("uses the 3×3 running mark while the agent is working", () => {
    const activity: SessionActivitySummary = {
      workspaceId: "/tmp/ws",
      sessionId: "s1",
      phase: "working",
      selected: false,
      archived: false,
      unread: false,
      updatedAt: "2026-08-14T00:00:00.000Z",
    };
    const markup = renderToStaticMarkup(createElement(SessionLeadingMark, { activity }));
    expect(markup).toContain('data-testid="session-activity"');
    expect(markup).toContain('data-activity="working"');
    expect(markup).toContain("loading-dots");
    expect(markup).not.toContain('data-testid="session-dot"');
  });

  test("shows a hollow dot when idle and a filled dot when the row is selected", () => {
    const idle = renderToStaticMarkup(createElement(SessionLeadingMark, { activity: undefined }));
    expect(idle).toContain('data-testid="session-dot"');
    expect(idle).toContain('data-filled="false"');
    expect(idle).not.toContain("lucide-message-square");
    expect(idle).not.toContain("loading-dots");

    const selected = renderToStaticMarkup(
      createElement(SessionLeadingMark, { activity: undefined, selected: true }),
    );
    expect(selected).toContain('data-filled="true"');
  });
});

describe("loading dots", () => {
  test("renders nine marks with an accessible label", () => {
    const markup = renderToStaticMarkup(createElement(LoadingDots, { label: "Working" }));
    expect(markup).toContain("loading-dots");
    expect(markup.split("loading-dots__mark").length - 1).toBe(9);
    expect(markup).toContain("Working");
  });
});
