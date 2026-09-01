import { describe, expect, test } from "bun:test";
import {
  HARNESS_ERROR_CODES,
  emptyFeatureSnapshot,
  isJsonSafeValue,
  jsonRoundTrip,
  PINNED_ELECTRON,
  type ResolveHostDialogInput,
} from "@pho-code/protocol";
import {
  createDisposableStubHarnessRuntime,
  type HarnessRuntime,
  type InspectWorkspaceInput,
} from "@pho-code/runtime";
import { createApplicationService, createMemoryMetadataStore } from "../src/index";

function createTestApplication(
  runtime: HarnessRuntime = createDisposableStubHarnessRuntime(),
  versions = {
    appVersion: "0.0.0",
    electron: PINNED_ELECTRON.version,
    embeddedNode: "24.18.1",
  },
) {
  return createApplicationService({
    runtime,
    versions,
    metadataStore: createMemoryMetadataStore(),
  });
}

function sampleWorkspace(approved: boolean) {
  return {
    workspace: {
      id: "/tmp/ws",
      path: "/tmp/ws",
      displayName: "ws",
      lastOpenedAt: "2026-08-13T00:00:00.000Z",
      projectResourcesApproved: approved,
    },
    sessions: [],
    models: [],
    features: emptyFeatureSnapshot(),
  };
}

describe("application bootstrap", () => {
  test("projects a JSON-safe bootstrap snapshot without a Pi runtime", () => {
    const application = createTestApplication();

    const state = application.getBootstrapState();
    expect(state.protocolVersion).toBe(1);
    expect(state.capabilities.piRuntime).toBe(false);
    expect(state.embeddedNodeCompatible).toBe(true);
    expect(state.milestone).toBe("bootstrap");
    expect(state.sessions).toEqual([]);
    expect(isJsonSafeValue(state)).toBe(true);
    expect(jsonRoundTrip(state)).toEqual(state);
  });

  test("marks an old embedded Node as incompatible", () => {
    const application = createTestApplication(createDisposableStubHarnessRuntime(), {
      appVersion: "0.0.0",
      electron: "37.0.0",
      embeddedNode: "22.16.0",
    });

    expect(application.getBootstrapState().embeddedNodeCompatible).toBe(false);
  });

  test("validates approval mode and composite session identity before runtime dispatch", async () => {
    const application = createTestApplication();
    await expect(application.setSessionApprovalMode({
      workspaceId: "/tmp/ws",
      sessionId: "session",
      mode: "unknown" as never,
    })).rejects.toMatchObject({ operation: "setSessionApprovalMode" });
    await expect(application.setSessionApprovalMode({
      workspaceId: "",
      sessionId: "session",
      mode: "ask",
    })).rejects.toMatchObject({ operation: "setSessionApprovalMode" });
  });
});

describe("application workspaces", () => {
  test("native picker approval is not reused until project permission trust is remembered", async () => {
    const approvals: boolean[] = [];
    const runtime: HarnessRuntime = {
      ...createDisposableStubHarnessRuntime(),
      inspectWorkspace(input: InspectWorkspaceInput) {
        approvals.push(input.approveProjectResources);
        return Promise.resolve(sampleWorkspace(input.approveProjectResources));
      },
      listWorkspaceSessions() {
        return Promise.resolve([
          {
            id: "s1",
            workspaceId: "/tmp/ws",
            title: "Listed",
            updatedAt: "2026-08-13T00:00:00.000Z",
          },
        ]);
      },
      trustProjectPermissionRules() {
        return Promise.resolve({
          ...createDisposableStubHarnessRuntime().getPermissionSettings(),
          projectOverridePresent: true,
          projectPermissionRulesTrusted: true,
        });
      },
    };
    const application = createTestApplication(runtime);

    const picked = await application.openPickedWorkspace("/tmp/ws");
    expect(picked.workspace.projectResourcesApproved).toBe(true);
    expect(application.getBootstrapState().sessions).toEqual([]);
    expect(application.getBootstrapState().selectedWorkspace?.id).toBe("/tmp/ws");
    const remembered = await application.openRecentWorkspace({ workspaceId: "/tmp/ws" });
    expect(remembered.workspace.projectResourcesApproved).toBe(false);
    expect(approvals).toEqual([true, false]);
    const trusted = await application.trustProjectPermissionRules();
    expect(trusted.permission.projectPermissionRulesRemembered).toBe(true);
    const reopened = await application.openRecentWorkspace({ workspaceId: "/tmp/ws" });
    expect(reopened.workspace.projectResourcesApproved).toBe(true);
    expect(approvals).toEqual([true, false, true]);
    const sessions = await application.listWorkspaceSessions({ workspaceId: "/tmp/ws" });
    expect(sessions).toEqual([
      {
        id: "s1",
        workspaceId: "/tmp/ws",
        title: "Listed",
        updatedAt: "2026-08-13T00:00:00.000Z",
      },
    ]);
  });
});

describe("application host dialogs", () => {
  test("forwards a select resolution without fabricating confirm fields", async () => {
    const forwarded: ResolveHostDialogInput[] = [];
    const runtime: HarnessRuntime = {
      ...createDisposableStubHarnessRuntime(),
      resolveHostDialog(input) {
        forwarded.push(input);
        return Promise.resolve();
      },
    };
    const application = createTestApplication(runtime);

    await application.resolveHostDialog({
      requestId: "dlg-1",
      backendId: "codex",
      workspaceId: "/tmp/ws",
      sessionId: "thread-1",
      selected: "Yes",
    });
    expect(forwarded).toEqual([{
      requestId: "dlg-1",
      backendId: "codex",
      workspaceId: "/tmp/ws",
      sessionId: "thread-1",
      selected: "Yes",
    }]);
  });

  test("forwards questionnaire answers without fabricating permission fields", async () => {
    const forwarded: ResolveHostDialogInput[] = [];
    const runtime: HarnessRuntime = {
      ...createDisposableStubHarnessRuntime(),
      resolveHostDialog(input) {
        forwarded.push(input);
        return Promise.resolve();
      },
    };
    const application = createTestApplication(runtime);
    const answers = [
      {
        questionIndex: 0,
        question: "Which approach should we use?",
        kind: "option" as const,
        answer: "Patch",
      },
    ];

    await application.resolveHostDialog({ requestId: "q-1", answers });
    expect(forwarded).toEqual([{ requestId: "q-1", answers }]);
  });
});

describe("application compaction", () => {
  function compactionSnapshot() {
    return {
      session: {
        id: "s1",
        workspaceId: "/tmp/ws",
        title: "Session",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
      workspace: {
        id: "/tmp/ws",
        path: "/tmp/ws",
        displayName: "ws",
        lastOpenedAt: "2026-09-01T00:00:00.000Z",
        projectResourcesApproved: true,
      },
      messages: [],
      run: { status: "idle" as const },
      models: [],
      sessions: [],
      features: emptyFeatureSnapshot(),
      thinkingLevel: "off" as const,
      availableThinkingLevels: ["off" as const],
      supportsThinking: false,
      compaction: { status: "idle" as const, cancelable: false },
    };
  }

  test("compactSession validates scope, delegates, and adopts the snapshot", async () => {
    const forwarded: { backendId?: string; sessionId: string; workspaceId?: string }[] = [];
    const runtime: HarnessRuntime = {
      ...createDisposableStubHarnessRuntime(),
      compactSession(input) {
        forwarded.push(input);
        return Promise.resolve(compactionSnapshot());
      },
    };
    const application = createTestApplication(runtime);

    const snapshot = await application.compactSession({ sessionId: " s1 ", workspaceId: "/tmp/ws" });
    expect(forwarded).toEqual([{ sessionId: "s1", workspaceId: "/tmp/ws" }]);
    expect(snapshot.session.id).toBe("s1");
    expect(application.getBootstrapState().activeSession?.session.id).toBe("s1");

    await expect(application.compactSession({ sessionId: " " })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
    expect(forwarded).toHaveLength(1);
  });

  test("cancelSessionCompaction delegates the resolved scope", async () => {
    const forwarded: { sessionId: string; workspaceId?: string }[] = [];
    const runtime: HarnessRuntime = {
      ...createDisposableStubHarnessRuntime(),
      cancelSessionCompaction(input) {
        forwarded.push(input);
        return Promise.resolve();
      },
    };
    const application = createTestApplication(runtime);

    await application.cancelSessionCompaction({ sessionId: "s1", workspaceId: "/tmp/ws" });
    expect(forwarded).toEqual([{ sessionId: "s1", workspaceId: "/tmp/ws" }]);
  });

  test("getCompactionDetail requires a non-empty compactionId and forwards it", async () => {
    const forwarded: { sessionId: string; compactionId: string }[] = [];
    const runtime: HarnessRuntime = {
      ...createDisposableStubHarnessRuntime(),
      getCompactionDetail(input) {
        forwarded.push(input);
        return Promise.resolve({
          compactionId: input.compactionId,
          sessionId: input.sessionId,
          workspaceId: input.workspaceId ?? "/tmp/ws",
          summary: "digest",
          truncated: false,
          tokensBefore: 100,
        });
      },
    };
    const application = createTestApplication(runtime);

    await expect(
      application.getCompactionDetail({ sessionId: "s1", compactionId: " " }),
    ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.invalidCommand });
    expect(forwarded).toHaveLength(0);

    const detail = await application.getCompactionDetail({ sessionId: "s1", compactionId: "c1" });
    expect(forwarded).toEqual([{ sessionId: "s1", compactionId: "c1" }]);
    expect(detail.summary).toBe("digest");
  });
});

describe("application shutdown", () => {
  test("disposes the runtime once across repeated shutdown calls", async () => {
    const runtime = createDisposableStubHarnessRuntime();
    const application = createTestApplication(runtime);

    await application.shutdown();
    await application.shutdown();
    expect(runtime.disposeCount).toBe(1);

    let thrown: unknown;
    try {
      application.getBootstrapState();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: HARNESS_ERROR_CODES.shuttingDown });
  });

  test("repeated shutdown after a blocked dispose still does not start a second dispose", async () => {
    let release: () => void = () => undefined;
    const blockDispose = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runtime = createDisposableStubHarnessRuntime({ blockDispose });
    const application = createTestApplication(runtime);

    const first = application.shutdown();
    const second = application.shutdown();
    expect(first).toBe(second);
    expect(runtime.disposeCount).toBe(0);
    release();
    await first;
    await second;
    expect(runtime.disposeCount).toBe(1);
  });
});

describe("application change review", () => {
  test("rejects incomplete review scopes", async () => {
    const application = createTestApplication();
    await expect(application.getChangeReviewSet({ workspaceId: "/tmp/ws", sessionId: "s1" } as never)).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
  });

  test("rejects malformed relativePaths, cursors, and contextLines with invalid_command", async () => {
    const application = createTestApplication();
    const scope = { workspaceId: "/tmp/ws", sessionId: "s1", runId: "r1" };
    await expect(
      application.approveChanges({ ...scope, expectedRevision: 1, relativePaths: [1, 2] as never }),
    ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.invalidCommand });
    await expect(application.getChangeDiff({ ...scope, relativePath: "note.txt", cursor: "nope" })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
    await expect(application.getChangeDiff({ ...scope, relativePath: "note.txt", contextLines: 99 })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
    await expect(application.getChangeFileView({ ...scope, relativePath: "note.txt", version: "current", cursor: "hunk:0" })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
  });
});
