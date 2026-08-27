import { describe, expect, test } from "bun:test";
import type { WorkspaceSummary } from "@pho-code/protocol";
import { createSessionSelection } from "../src/session-selection";

const workspace = (path: string): WorkspaceSummary => ({
  id: path,
  path,
  displayName: path,
  lastOpenedAt: "2026-08-27T00:00:00.000Z",
  projectResourcesApproved: true,
});

type FakeSession = { id: string; workspace: WorkspaceSummary };
const session = (id: string, path: string): FakeSession => ({ id, workspace: workspace(path) });

describe("session selection", () => {
  test("starts empty", () => {
    const selection = createSessionSelection<FakeSession>();
    expect(selection.current).toBeUndefined();
    expect(selection.lastWorkspace).toBeUndefined();
    expect(selection.activeWorkspacePath()).toBeUndefined();
  });

  test("select records the session and its workspace together", () => {
    const selection = createSessionSelection<FakeSession>();
    const live = session("s1", "/tmp/a");
    selection.select(live);
    expect(selection.current).toBe(live);
    expect(selection.lastWorkspace?.path).toBe("/tmp/a");
  });

  test("clearing the selection keeps the workspace fallback", () => {
    const selection = createSessionSelection<FakeSession>();
    selection.select(session("s1", "/tmp/a"));
    selection.clear();
    expect(selection.current).toBeUndefined();
    // Global commands still need a workspace after the last chat closes.
    expect(selection.activeWorkspacePath()).toBe("/tmp/a");
  });

  test("clearIf only clears the matching session", () => {
    const selection = createSessionSelection<FakeSession>();
    const live = session("s1", "/tmp/a");
    selection.select(live);

    selection.clearIf(session("s2", "/tmp/b"));
    expect(selection.current).toBe(live);

    selection.clearIf(live);
    expect(selection.current).toBeUndefined();
  });

  test("rebind swaps the controller without touching the workspace fallback", () => {
    const selection = createSessionSelection<FakeSession>();
    selection.select(session("s1", "/tmp/a"));
    const reopened = session("s1", "/tmp/moved");
    selection.rebind(reopened);
    expect(selection.current).toBe(reopened);
    expect(selection.lastWorkspace?.path).toBe("/tmp/a");
  });

  test("rememberWorkspace returns the path it replaced", () => {
    const selection = createSessionSelection<FakeSession>();
    expect(selection.rememberWorkspace(workspace("/tmp/a"))).toBeUndefined();
    expect(selection.rememberWorkspace(workspace("/tmp/b"))).toBe("/tmp/a");
    expect(selection.lastWorkspace?.path).toBe("/tmp/b");
  });

  test("the active workspace prefers the selection over the fallback", () => {
    const selection = createSessionSelection<FakeSession>();
    selection.rememberWorkspace(workspace("/tmp/browsed"));
    expect(selection.activeWorkspacePath()).toBe("/tmp/browsed");

    selection.select(session("s1", "/tmp/chat"));
    expect(selection.activeWorkspacePath()).toBe("/tmp/chat");

    selection.clear();
    expect(selection.activeWorkspacePath()).toBe("/tmp/chat");
  });

  test("selecting a session in another workspace moves the fallback with it", () => {
    const selection = createSessionSelection<FakeSession>();
    selection.select(session("s1", "/tmp/a"));
    selection.select(session("s2", "/tmp/b"));
    expect(selection.lastWorkspace?.path).toBe("/tmp/b");
    expect(selection.activeWorkspacePath()).toBe("/tmp/b");
  });
});
