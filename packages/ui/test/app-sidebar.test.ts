import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { INTENDED_PI_SDK, PINNED_ELECTRON, PROTOCOL_VERSION } from "@pho-code/protocol";
import type { BootstrapState, RecentWorkspaceRecord, SessionCatalogEntry } from "@pho-code/protocol";
import { AppSidebar, CollapsedSidebarActions } from "../src/app-sidebar";

const noop = (): void => undefined;

function sampleBootstrap(): BootstrapState {
  return {
    protocolVersion: PROTOCOL_VERSION,
    appName: "Pho Code",
    appVersion: "0.0.0",
    milestone: "vertical-slice",
    capabilities: {
      piRuntime: true,
    },
    piRuntime: { status: "ready" },
    versions: {
      electron: PINNED_ELECTRON.version,
      embeddedNode: "24.18.1",
    },
    embeddedNodeCompatible: true,
    intendedPiSdk: {
      packageName: INTENDED_PI_SDK.packageName,
      version: INTENDED_PI_SDK.version,
      enginesNode: INTENDED_PI_SDK.enginesNode,
    },
    recentWorkspaces: [],
    sessions: [],
    models: [],
  };
}

function sampleProject(id: string, displayName: string): RecentWorkspaceRecord {
  return {
    id,
    path: `/tmp/${id}`,
    displayName,
    lastOpenedAt: "2026-08-15T00:00:00.000Z",
  };
}

function sampleSession(workspaceId: string, sessionId: string, title: string): SessionCatalogEntry {
  return {
    workspaceId,
    sessionId,
    title,
    updatedAt: "2026-08-15T00:00:00.000Z",
    archived: false,
    activity: {
      workspaceId,
      sessionId,
      phase: "idle",
      selected: false,
      archived: false,
      unread: false,
      updatedAt: "2026-08-15T00:00:00.000Z",
    },
  };
}

function sidebarProps(overrides: Partial<Parameters<typeof AppSidebar>[0]> = {}) {
  return {
    projects: [] as RecentWorkspaceRecord[],
    sessionsByWorkspace: {},
    bootstrap: sampleBootstrap(),
    onAddProject: noop,
    onNewSession: noop,
    onOpenSession: noop,
    onArchiveSession: noop,
    onRemoveSession: noop,
    onRemoveProject: noop,
    onExpandProject: noop,
    onReorderProjects: noop,
    onOpenSettings: noop,
    onGoHome: noop,
    onToggleCollapsed: noop,
    busy: false,
    ...overrides,
  };
}

describe("app sidebar project groups", () => {
  test("renders project names as quiet group headings without folder glyphs", () => {
    const garden = sampleProject("/tmp/garden", "Garden");
    const notes = sampleProject("/tmp/notes", "Notes");
    const markup = renderToStaticMarkup(
      createElement(
        AppSidebar,
        sidebarProps({
          projects: [garden, notes],
          activeWorkspaceId: garden.id,
          selectedSessionId: "s1",
          sessionsByWorkspace: {
            [garden.id]: [sampleSession(garden.id, "s1", "Plan the beds")],
            [notes.id]: [],
          },
        }),
      ),
    );

    expect(markup).not.toContain("lucide-folder-open");
    expect(markup).not.toContain("lucide-folder ");
    expect(markup).not.toContain("lucide-chevron-down");
    expect(markup).toContain('data-testid="project-item"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("Collapse Garden");
    expect(markup).toContain("Expand Notes");
    expect(markup).toContain("Plan the beds");
  });

  test("each project group offers an inline new-session control and a session count", () => {
    const garden = sampleProject("/tmp/garden", "Garden");
    const markup = renderToStaticMarkup(
      createElement(
        AppSidebar,
        sidebarProps({
          projects: [garden],
          activeWorkspaceId: garden.id,
          sessionsByWorkspace: {
            [garden.id]: [sampleSession(garden.id, "s1", "Plan the beds")],
          },
        }),
      ),
    );

    expect(markup).toContain('data-testid="project-new-session-inline"');
    expect(markup).toContain('aria-label="New session in Garden"');
    expect(markup).toContain("lucide-plus");
    expect(markup).toContain('data-testid="project-session-count"');
  });

  test("session rows lead with a state dot rather than a chat glyph", () => {
    const garden = sampleProject("/tmp/garden", "Garden");
    const markup = renderToStaticMarkup(
      createElement(
        AppSidebar,
        sidebarProps({
          projects: [garden],
          activeWorkspaceId: garden.id,
          selectedSessionId: "s1",
          sessionsByWorkspace: {
            [garden.id]: [
              sampleSession(garden.id, "s1", "Plan the beds"),
              sampleSession(garden.id, "s2", "Water the beds"),
            ],
          },
        }),
      ),
    );

    expect(markup).not.toContain("lucide-message-square");
    expect(markup).toContain('data-testid="session-dot"');
    expect(markup).toContain('data-filled="true"');
    expect(markup).toContain('data-filled="false"');
  });

  test("session rows show an archive button instead of a three-dot menu", () => {
    const garden = sampleProject("/tmp/garden", "Garden");
    const markup = renderToStaticMarkup(
      createElement(
        AppSidebar,
        sidebarProps({
          projects: [garden],
          activeWorkspaceId: garden.id,
          selectedSessionId: "s1",
          sessionsByWorkspace: {
            [garden.id]: [sampleSession(garden.id, "s1", "Plan the beds")],
          },
        }),
      ),
    );

    expect(markup).toContain('data-testid="session-archive"');
    expect(markup).toContain('aria-label="Archive Plan the beds"');
    expect(markup).toContain("title=\"Archive chat\"");
    expect(markup).toContain("lucide-archive");
    expect(markup).not.toContain("lucide-ellipsis");
    expect(markup).not.toContain('data-testid="session-actions"');
    expect(markup).not.toContain("aria-haspopup");
  });

  test("drops the Projects heading so project names carry the grouping", () => {
    const garden = sampleProject("/tmp/garden", "Garden");
    const markup = renderToStaticMarkup(
      createElement(
        AppSidebar,
        sidebarProps({
          projects: [garden],
          activeWorkspaceId: garden.id,
          sessionsByWorkspace: { [garden.id]: [] },
        }),
      ),
    );

    expect(markup).not.toContain('data-testid="projects-heading"');
    expect(markup).not.toContain(">Projects</h2>");
    expect(markup).toContain('data-testid="project-list"');
  });

  test("renders Settings and About as start-aligned icon-only controls", () => {
    const markup = renderToStaticMarkup(createElement(AppSidebar, sidebarProps()));
    const footerMatch = markup.match(
      /<div class="flex min-w-0 justify-start gap-1 overflow-hidden border-t border-sidebar-border px-2 py-2">[\s\S]*?<\/div>/,
    );
    expect(footerMatch).not.toBeNull();
    const footer = footerMatch?.[0] ?? "";
    expect(footer).toContain('data-testid="open-settings"');
    expect(footer).toContain('data-testid="bootstrap-state"');
    expect(footer).toContain('aria-label="Settings"');
    expect(footer).toContain('aria-label="About · 0.0.0"');
    expect(footer).toContain("size-7");
    expect(footer).not.toContain(">Settings<");
    expect(footer).not.toContain(">About · 0.0.0<");
  });

  test("emphasises New session and keeps the other actions at normal weight", () => {
    const garden = sampleProject("/tmp/garden", "Garden");
    const markup = renderToStaticMarkup(
      createElement(
        AppSidebar,
        sidebarProps({
          projects: [garden],
          activeWorkspaceId: garden.id,
          sessionsByWorkspace: { [garden.id]: [] },
        }),
      ),
    );

    const row = (testId: string): string =>
      markup.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? "";

    expect(row("new-session")).toContain("font-medium");
    expect(row("new-session")).toContain(" bg-sidebar-row-hover");
    expect(row("go-home")).toContain("font-normal");
    expect(row("go-home")).not.toContain(" bg-sidebar-row-hover");
    expect(row("add-project")).toContain("font-normal");
    for (const testId of ["new-session", "go-home", "add-project"]) {
      expect(row(testId)).toContain("text-[13px]");
      expect(row(testId)).toContain("tracking-[-0.01em]");
      expect(row(testId)).toContain("gap-2.5");
      expect(row(testId)).toContain("h-7");
      expect(row(testId)).toContain("rounded-lg");
    }
  });

  test("renders a compact overlay pill when collapsed", () => {
    const garden = sampleProject("/tmp/garden", "Garden");
    const markup = renderToStaticMarkup(
      createElement(
        AppSidebar,
        sidebarProps({
          collapsed: true,
          projects: [garden],
          activeWorkspaceId: garden.id,
          sessionsByWorkspace: { [garden.id]: [] },
        }),
      ),
    );

    expect(markup).toContain('data-testid="app-sidebar"');
    expect(markup).toContain('data-collapsed="true"');
    expect(markup).toContain('data-testid="app-sidebar-pill"');
    expect(markup).toContain("rounded-2xl");
    expect(markup).toContain('data-testid="go-home"');
    expect(markup).toContain('data-testid="add-project"');
    expect(markup).toContain('data-testid="new-session"');
    expect(markup).toContain('data-testid="open-settings"');
    expect(markup).toContain("Home");
    expect(markup).toContain("Open folder");
    expect(markup).toContain("New session");
    expect(markup).toContain("Settings");
    expect(markup).not.toContain('data-testid="projects-heading"');
    expect(markup).not.toContain('data-testid="project-list"');
    expect(markup).not.toContain('data-testid="bootstrap-state"');
    expect(markup).not.toContain('data-testid="sidebar-resize"');
  });

  test("hides the overlay pill when collapsed without overlay chrome", () => {
    const markup = renderToStaticMarkup(
      createElement(
        AppSidebar,
        sidebarProps({
          collapsed: true,
          overlay: false,
          projects: [sampleProject("/tmp/garden", "Garden")],
        }),
      ),
    );
    expect(markup).toContain('data-testid="app-sidebar"');
    expect(markup).toContain('data-collapsed="true"');
    expect(markup).toContain('data-overlay="false"');
    expect(markup).not.toContain('data-testid="app-sidebar-pill"');
    expect(markup).not.toContain('data-testid="go-home"');
  });

  test("renders collapsed actions as a header row", () => {
    const markup = renderToStaticMarkup(
      createElement(CollapsedSidebarActions, {
        layout: "header",
        busy: false,
        canNewSession: true,
        homeActive: false,
        onGoHome: noop,
        onAddProject: noop,
        onNewSession: noop,
        onOpenSettings: noop,
      }),
    );
    expect(markup).toContain('data-testid="app-sidebar-header-actions"');
    expect(markup).toContain('data-testid="go-home"');
    expect(markup).toContain('data-testid="add-project"');
    expect(markup).toContain('data-testid="new-session"');
    expect(markup).toContain('data-testid="open-settings"');
    expect(markup).not.toContain("rounded-2xl");
    expect(markup).not.toContain('data-testid="app-sidebar-pill"');
  });

  test("marks Home as the current page on the welcome launcher", () => {
    const markup = renderToStaticMarkup(createElement(AppSidebar, sidebarProps({ homeActive: true })));
    expect(markup).toContain('data-testid="go-home"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain(">Home<");
  });
});
