import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { INTENDED_PI_SDK, PINNED_ELECTRON, PROTOCOL_VERSION } from "@pho-code/protocol";
import type { BootstrapState, RecentWorkspaceRecord, SessionCatalogEntry } from "@pho-code/protocol";
import { AppSidebar } from "../src/app-sidebar";

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

describe("app sidebar project folders", () => {
  test("uses an open folder glyph for the expanded project and a closed folder for collapsed ones", () => {
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

    expect(markup).toContain("lucide-folder-open");
    expect(markup).toContain("lucide-folder ");
    expect(markup).not.toContain("lucide-chevron-down");
    expect(markup).toContain('data-testid="project-item"');
    expect(markup).toContain('data-testid="project-collapse"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("Collapse Garden");
    expect(markup).toContain("Expand Notes");
    expect(markup).toContain("Plan the beds");
  });

  test("renders a Projects heading at the project-row type size aligned with folder glyphs", () => {
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

    const headingMatch = markup.match(/<h2[^>]*data-testid="projects-heading"[^>]*>Projects<\/h2>/);
    expect(headingMatch).not.toBeNull();
    const heading = headingMatch?.[0] ?? "";
    expect(heading).toContain("px-2");
    expect(heading).toContain("text-sm");
    expect(heading).toContain("h-8");
    expect(heading).not.toContain("pl-8");
    expect(heading).not.toContain("text-[11px]");
  });

  test("renders Settings and About as start-aligned icon-only controls", () => {
    const markup = renderToStaticMarkup(createElement(AppSidebar, sidebarProps()));
    const footerMatch = markup.match(
      /<div class="flex min-w-0 justify-start gap-1 overflow-hidden px-2 py-2">[\s\S]*?<\/div>/,
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

  test("marks Home as the current page on the welcome launcher", () => {
    const markup = renderToStaticMarkup(createElement(AppSidebar, sidebarProps({ homeActive: true })));
    expect(markup).toContain('data-testid="go-home"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain(">Home<");
  });
});
