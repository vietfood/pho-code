import { describe, expect, test } from "bun:test";
import { emptyFeatureSnapshot, idleRunState, RUNTIME_EVENT_TYPES, type RuntimeEvent } from "@pho-code/protocol";
import { createDisposableStubHarnessRuntime, type HarnessRuntime } from "@pho-code/runtime";
import { createApplicationService, createMemoryMetadataStore, emptyMetadata } from "../src/index";

const workspaceA = "/tmp/ws-a";
const sessionA = { workspaceId: workspaceA, sessionId: "s-a" };

function sampleSnapshot(id: string, workspaceId = workspaceA) {
  return {
    session: {
      id,
      workspaceId,
      title: id,
      updatedAt: "2026-08-14T00:00:00.000Z",
    },
    workspace: {
      id: workspaceId,
      path: workspaceId,
      displayName: "ws",
      lastOpenedAt: "2026-08-14T00:00:00.000Z",
      projectResourcesApproved: true,
    },
    messages: [],
    run: idleRunState(),
    models: [],
    sessions: [
      { id: "s-a", workspaceId, title: "A", updatedAt: "2026-08-14T00:00:00.000Z" },
      { id: "s-b", workspaceId, title: "B", updatedAt: "2026-08-14T00:00:01.000Z" },
    ],
    features: emptyFeatureSnapshot(),
    thinkingLevel: "off" as const,
    availableThinkingLevels: ["off" as const],
    supportsThinking: false,
  };
}

function createCatalogRuntime(options?: { onPrompt?: (sessionId: string) => void }) {
  const listeners = new Set<(event: RuntimeEvent) => void>();
  const runtime: HarnessRuntime = {
    ...createDisposableStubHarnessRuntime(),
    inspectWorkspace() {
      return Promise.resolve({
        workspace: sampleSnapshot("s-a").workspace,
        sessions: sampleSnapshot("s-a").sessions,
        models: [],
        features: emptyFeatureSnapshot(),
      });
    },
    listWorkspaceSessions() {
      return Promise.resolve(sampleSnapshot("s-a").sessions);
    },
    listSessionActivity() {
      return [];
    },
    createSession() {
      return Promise.resolve(sampleSnapshot("s-a"));
    },
    openSession(_workspaceId, sessionId) {
      return Promise.resolve(sampleSnapshot(sessionId));
    },
    inspectRemovableSession(key) {
      return Promise.resolve({ title: key.sessionId, fingerprint: `fp-${key.sessionId}` });
    },
    removeValidatedSession(input) {
      return Promise.resolve({ title: input.sessionId, method: "macos-trash" });
    },
    sendPrompt(input) {
      options?.onPrompt?.(input.sessionId);
      return Promise.resolve({
        sessionId: input.sessionId,
        workspaceId: input.workspaceId ?? workspaceA,
        runId: `run-${input.sessionId}`,
        admitted: true,
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    runtime,
    emit(event: RuntimeEvent) {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

describe("application session catalog", () => {
  test("archives and restores without dropping the Pi listing identity", async () => {
    const { runtime } = createCatalogRuntime();
    const store = createMemoryMetadataStore(emptyMetadata());
    const application = createApplicationService({
      runtime,
      versions: { electron: "43.4.0", embeddedNode: "24.18.1" },
      metadataStore: store,
    });
    await application.openPickedWorkspace(workspaceA);

    const archived = await application.archiveSession(sessionA);
    expect(archived.archived).toBe(true);
    expect(archived.sessionId).toBe("s-a");
    expect(await application.listWorkspaceSessions({ workspaceId: workspaceA })).toEqual([
      { id: "s-b", workspaceId: workspaceA, title: "B", updatedAt: "2026-08-14T00:00:01.000Z" },
    ]);
    expect(await application.listSessionCatalog({ workspaceId: workspaceA, scope: "archived" })).toEqual([archived]);

    const restored = await application.restoreSession(sessionA);
    expect(restored.archived).toBe(false);
    expect((await application.listWorkspaceSessions({ workspaceId: workspaceA })).map((entry) => entry.id)).toEqual([
      "s-a",
      "s-b",
    ]);
  });

  test("forwards a prompt to a background session after selection changes", async () => {
    const prompted: string[] = [];
    const { runtime } = createCatalogRuntime({ onPrompt: (sessionId) => prompted.push(sessionId) });
    const application = createApplicationService({
      runtime,
      versions: { electron: "43.4.0", embeddedNode: "24.18.1" },
      metadataStore: createMemoryMetadataStore(),
    });
    await application.openPickedWorkspace(workspaceA);
    await application.openSession({ workspaceId: workspaceA, sessionId: "s-a" });
    await application.openSession({ workspaceId: workspaceA, sessionId: "s-b" });
    await application.sendPrompt({
      workspaceId: workspaceA,
      sessionId: "s-a",
      text: "continue in A",
    });
    expect(prompted).toEqual(["s-a"]);
    expect(application.getBootstrapState().activeSession?.session.id).toBe("s-b");
  });

  test("does not replace the selected snapshot with a background settle", async () => {
    const { runtime, emit } = createCatalogRuntime();
    const application = createApplicationService({
      runtime,
      versions: { electron: "43.4.0", embeddedNode: "24.18.1" },
      metadataStore: createMemoryMetadataStore(),
    });
    await application.openPickedWorkspace(workspaceA);
    await application.openSession({ workspaceId: workspaceA, sessionId: "s-b" });
    application.subscribe(() => undefined);
    emit({
      protocolVersion: 1,
      sequence: 1,
      type: RUNTIME_EVENT_TYPES.runSettled,
      sessionId: "s-a",
      workspaceId: workspaceA,
      payload: sampleSnapshot("s-a"),
      occurredAt: "2026-08-14T00:00:02.000Z",
    });
    expect(application.getBootstrapState().activeSession?.session.id).toBe("s-b");
  });

  test("removes a prepared session only with a matching unexpired token", async () => {
    const { runtime } = createCatalogRuntime();
    const application = createApplicationService({
      runtime,
      versions: { electron: "43.4.0", embeddedNode: "24.18.1" },
      metadataStore: createMemoryMetadataStore(),
    });
    await application.openPickedWorkspace(workspaceA);
    const prepared = await application.prepareRemoveSession(sessionA);
    expect(prepared.title).toBe("s-a");
    expect(prepared.confirmationToken.length).toBeGreaterThan(0);
    expect(JSON.stringify(prepared)).not.toContain(".jsonl");
    await expect(
      application.removeSession({ ...sessionA, confirmationToken: "stale" }),
    ).rejects.toMatchObject({ code: "invalid_command" });
    const removed = await application.removeSession({
      ...sessionA,
      confirmationToken: prepared.confirmationToken,
    });
    expect(removed.recoverable).toBe(true);
    expect(removed.method).toBe("macos-trash");
    await expect(application.removeSession({ ...sessionA, confirmationToken: prepared.confirmationToken })).rejects.toMatchObject({
      code: "invalid_command",
    });
  });

  test("keeps archive metadata when runtime Trash fails", async () => {
    const { runtime } = createCatalogRuntime();
    runtime.removeValidatedSession = () => Promise.reject(new Error("injected trash failure"));
    const store = createMemoryMetadataStore(emptyMetadata());
    const application = createApplicationService({
      runtime,
      versions: { electron: "43.4.0", embeddedNode: "24.18.1" },
      metadataStore: store,
    });
    await application.openPickedWorkspace(workspaceA);
    await application.archiveSession(sessionA);
    const prepared = await application.prepareRemoveSession(sessionA);
    await expect(
      application.removeSession({ ...sessionA, confirmationToken: prepared.confirmationToken }),
    ).rejects.toThrow(/injected trash failure/);
    expect(await application.listSessionCatalog({ workspaceId: workspaceA, scope: "archived" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ sessionId: "s-a", archived: true })]),
    );
  });
});
