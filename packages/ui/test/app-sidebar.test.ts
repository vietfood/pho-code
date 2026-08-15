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

describe("app sidebar project folders", () => {
  test("uses an open folder glyph for the expanded project and a closed folder for collapsed ones", () => {
    const garden = sampleProject("/tmp/garden", "Garden");
    const notes = sampleProject("/tmp/notes", "Notes");
    const markup = renderToStaticMarkup(
      createElement(AppSidebar, {
        projects: [garden, notes],
        activeWorkspaceId: garden.id,
        selectedSessionId: "s1",
        sessionsByWorkspace: {
          [garden.id]: [sampleSession(garden.id, "s1", "Plan the beds")],
          [notes.id]: [],
        },
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
        onToggleCollapsed: noop,
        busy: false,
      }),
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
});
