import { mkdir, readFile, rename } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  ContextCutoverSignal,
  createContextContinuityFeature,
  sessionNotesPath,
} from "@pho-agent/runtime/context-continuity-feature";
import {
  RUNTIME_EVENT_TYPES,
  isTranscriptCompactionBoundary,
  type RuntimeEvent,
  type SessionSnapshot,
} from "@pho-code/protocol";
import {
  TEST_PROMPT,
  createPhoCodeRuntime,
  type RecoverableRemovalService,
} from "../src/index";

async function makeIsolatedDirs() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-continuity-"));
  const agentDir = path.join(root, "agent");
  const workspaceDir = path.join(root, "workspace");
  await mkdir(agentDir);
  await mkdir(workspaceDir);
  return { agentDir, workspaceDir };
}

async function createContinuityRuntime(agentDir: string, options: {
  cutoverSignal?: ContextCutoverSignal;
  removalService?: RecoverableRemovalService;
} = {}) {
  const cutoverSignal = options.cutoverSignal ?? new ContextCutoverSignal();
  const runtime = await createPhoCodeRuntime({
    agentDir,
    deterministicTestModel: true,
    featureManifest: {
      features: [createContextContinuityFeature({ cutoverSignal })],
    },
    contextCutoverSignal: cutoverSignal,
    ...(options.removalService ? { removalService: options.removalService } : {}),
  });
  return { runtime, cutoverSignal };
}

type TestRuntime = Awaited<ReturnType<typeof createPhoCodeRuntime>>;

async function sendAndSettle(runtime: TestRuntime, sessionId: string, events: RuntimeEvent[], text: string) {
  const admission = await runtime.sendPrompt({ sessionId, text });
  await waitForEvent(
    events,
    RUNTIME_EVENT_TYPES.runSettled,
    (event) => event.sessionId === sessionId && event.runId === admission.runId,
  );
  return admission.runId;
}

async function sendExchanges(runtime: TestRuntime, sessionId: string, events: RuntimeEvent[], count: number) {
  for (let index = 0; index < count; index += 1) {
    await sendAndSettle(runtime, sessionId, events, `hello ${index}`);
  }
}

async function waitForEvent(
  events: RuntimeEvent[],
  type: string,
  predicate: (event: Extract<RuntimeEvent, { sessionId?: string }> & { runId?: string }) => boolean,
  timeoutMs = 20_000,
): Promise<void> {
  const started = Date.now();
  for (;;) {
    const match = events.find(
      (event) => event.type === type && predicate(event as never),
    );
    if (match) {
      return;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for ${type}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function settleDelay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function snapshotHasText(snapshot: SessionSnapshot, needle: string): boolean {
  return snapshot.messages.some(
    (message) =>
      !isTranscriptCompactionBoundary(message) &&
      message.blocks.some((block) => {
        if (block.type === "text") {
          return block.text.includes(needle);
        }
        if (block.type === "tool") {
          return block.outputPreview.includes(needle) || block.inputPreview.includes(needle);
        }
        return false;
      }),
  );
}

function latestSnapshot(events: RuntimeEvent[], sessionId: string): SessionSnapshot {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === RUNTIME_EVENT_TYPES.sessionSnapshot && event.sessionId === sessionId) {
      return event.payload;
    }
  }
  throw new Error("No session snapshot recorded for the session.");
}

describe("context continuity integration", () => {
  test("notes tools persist the sidecar beside the session JSONL and read it back", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const { runtime } = await createContinuityRuntime(agentDir);
    const events: RuntimeEvent[] = [];
    try {
      const workspace = await runtime.inspectWorkspace({ path: workspaceDir, approveProjectResources: true });
      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });

      await sendAndSettle(runtime, created.session.id, events, TEST_PROMPT.useNotesAppend);

      const listed = await SessionManager.list(created.workspace.path);
      const info = listed.find((entry) => entry.id === created.session.id);
      expect(info).toBeDefined();
      const notesPath = sessionNotesPath(path.dirname(info!.path), created.session.id);
      const onDisk = await readFile(notesPath, "utf8");
      expect(onDisk).toContain("# Session notes");
      expect(onDisk).toContain("remember the deploy key");

      await sendAndSettle(runtime, created.session.id, events, TEST_PROMPT.useNotesRead);
      const snapshot = latestSnapshot(events, created.session.id);
      expect(snapshotHasText(snapshot, "remember the deploy key")).toBe(true);
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 60_000);

  test("notes survive a runtime restart for the same session", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const first = await createContinuityRuntime(agentDir);
    const events: RuntimeEvent[] = [];
    let sessionId = "";
    let workspaceId = "";
    try {
      const workspace = await first.runtime.inspectWorkspace({ path: workspaceDir, approveProjectResources: true });
      workspaceId = workspace.workspace.id;
      const created = await first.runtime.createSession(workspaceId);
      sessionId = created.session.id;
      const stop = first.runtime.subscribe((event) => {
        events.push(event);
      });
      await sendAndSettle(first.runtime, sessionId, events, TEST_PROMPT.useNotesAppend);
      stop();
    } finally {
      await first.runtime.dispose();
    }

    const second = await createContinuityRuntime(agentDir);
    const secondEvents: RuntimeEvent[] = [];
    try {
      const stop = second.runtime.subscribe((event) => {
        secondEvents.push(event);
      });
      await second.runtime.openSession(workspaceId, sessionId);
      await sendAndSettle(second.runtime, sessionId, secondEvents, TEST_PROMPT.useNotesRead);
      const snapshot = latestSnapshot(secondEvents, sessionId);
      expect(snapshotHasText(snapshot, "remember the deploy key")).toBe(true);
      stop();
    } finally {
      await second.runtime.dispose();
    }
  }, 60_000);

  test("manual compact with notes produces a digest boundary without a summarization request", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const { runtime } = await createContinuityRuntime(agentDir);
    const events: RuntimeEvent[] = [];
    try {
      const workspace = await runtime.inspectWorkspace({ path: workspaceDir, approveProjectResources: true });
      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });

      await sendAndSettle(runtime, created.session.id, events, TEST_PROMPT.useNotesAppend);
      await sendExchanges(runtime, created.session.id, events, 5);

      const compacted = await runtime.compactSession({ sessionId: created.session.id });
      const boundary = compacted.messages.find(isTranscriptCompactionBoundary);
      expect(boundary).toBeDefined();
      expect(boundary!.fromHook).toBe(true);
      expect(boundary!.reason).toBe("manual");

      const detail = await runtime.getCompactionDetail({
        sessionId: created.session.id,
        compactionId: boundary!.id,
      });
      expect(detail.summary).toContain("Pho context cutover");
      expect(detail.summary).toContain("remember the deploy key");
      // The digest path makes no provider request, so the summary can never
      // be the deterministic model's own reply text.
      expect(detail.summary).not.toContain("Hello from the test model.");
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 60_000);

  test("manual compact without notes falls back to Pi's summarizer", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const { runtime } = await createContinuityRuntime(agentDir);
    const events: RuntimeEvent[] = [];
    try {
      const workspace = await runtime.inspectWorkspace({ path: workspaceDir, approveProjectResources: true });
      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });

      await sendExchanges(runtime, created.session.id, events, 6);
      const compacted = await runtime.compactSession({ sessionId: created.session.id });
      const boundary = compacted.messages.find(isTranscriptCompactionBoundary);
      expect(boundary).toBeDefined();
      expect(boundary!.fromHook).toBe(false);

      const detail = await runtime.getCompactionDetail({
        sessionId: created.session.id,
        compactionId: boundary!.id,
      });
      expect(detail.summary.length).toBeGreaterThan(0);
      expect(detail.summary).not.toContain("Pho context cutover");
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 60_000);

  test("new_context runs the two-phase cutover after the turn settles", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const { runtime } = await createContinuityRuntime(agentDir);
    const events: RuntimeEvent[] = [];
    try {
      const workspace = await runtime.inspectWorkspace({ path: workspaceDir, approveProjectResources: true });
      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });

      await sendAndSettle(runtime, created.session.id, events, TEST_PROMPT.useNotesAppend);
      await sendExchanges(runtime, created.session.id, events, 4);

      // The model requests the cutover; the turn itself completes normally.
      await sendAndSettle(runtime, created.session.id, events, TEST_PROMPT.useNewContext);

      // Phase two starts after the settle; wait for the completed outcome.
      await waitForEvent(
        events,
        RUNTIME_EVENT_TYPES.compactionStateChanged,
        (event) =>
          event.sessionId === created.session.id &&
          (event as { payload?: { outcome?: string } }).payload?.outcome === "completed",
      );

      const snapshot = latestSnapshot(events, created.session.id);
      const boundary = snapshot.messages.find(isTranscriptCompactionBoundary);
      expect(boundary).toBeDefined();
      expect(boundary!.fromHook).toBe(true);

      const detail = await runtime.getCompactionDetail({
        sessionId: created.session.id,
        compactionId: boundary!.id,
      });
      expect(detail.summary).toContain("Pho context cutover");
      expect(detail.summary).toContain("remember the deploy key");

      // The requesting turn was never aborted: its tool output and final text
      // are still in the display transcript.
      const sawToolCompletion = snapshot.messages.some(
        (message) =>
          !isTranscriptCompactionBoundary(message) &&
          message.blocks.some((block) => block.type === "text" && block.text.includes("Tool completed.")),
      );
      expect(sawToolCompletion).toBe(true);
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 60_000);

  test("a failed turn consumes the cutover request without compacting", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const { runtime, cutoverSignal } = await createContinuityRuntime(agentDir);
    const events: RuntimeEvent[] = [];
    try {
      const workspace = await runtime.inspectWorkspace({ path: workspaceDir, approveProjectResources: true });
      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });

      await sendAndSettle(runtime, created.session.id, events, TEST_PROMPT.useNotesAppend);
      await sendExchanges(runtime, created.session.id, events, 4);

      await sendAndSettle(
        runtime,
        created.session.id,
        events,
        `${TEST_PROMPT.useNewContext} ${TEST_PROMPT.failAfterTool}`,
      );
      await settleDelay(300);

      // The request was consumed by the failed turn: no compaction ran, and
      // the signal holds nothing for this session.
      expect(
        events.some(
          (event) =>
            event.type === RUNTIME_EVENT_TYPES.compactionStateChanged &&
            event.sessionId === created.session.id,
        ),
      ).toBe(false);

      // A later healthy turn must not fire the stale request.
      await sendAndSettle(runtime, created.session.id, events, "hello again");
      await settleDelay(300);
      expect(
        events.some(
          (event) =>
            event.type === RUNTIME_EVENT_TYPES.compactionStateChanged &&
            event.sessionId === created.session.id,
        ),
      ).toBe(false);
      const snapshot = latestSnapshot(events, created.session.id);
      expect(snapshot.messages.some(isTranscriptCompactionBoundary)).toBe(false);
      expect(cutoverSignal.consume(`${created.workspace.id}:${created.session.id}`)).toBe(false);
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 60_000);

  test("the notes sidecar follows the session into Trash", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const simulatedTrashDir = path.join(agentDir, "simulated-os-trash");
    const trashed: string[] = [];
    const removal: RecoverableRemovalService = {
      async moveToTrash(input) {
        await mkdir(simulatedTrashDir, { recursive: true });
        const target = path.join(simulatedTrashDir, path.basename(input.canonicalPath));
        await rename(input.canonicalPath, target);
        trashed.push(path.basename(input.canonicalPath));
        return { method: "macos-trash" };
      },
    };
    const { runtime } = await createContinuityRuntime(agentDir, { removalService: removal });
    const events: RuntimeEvent[] = [];
    try {
      const workspace = await runtime.inspectWorkspace({ path: workspaceDir, approveProjectResources: true });
      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      await sendAndSettle(runtime, created.session.id, events, TEST_PROMPT.useNotesAppend);

      const listed = await SessionManager.list(created.workspace.path);
      const info = listed.find((entry) => entry.id === created.session.id);
      const notesPath = sessionNotesPath(path.dirname(info!.path), created.session.id);
      await readFile(notesPath, "utf8");

      const inspected = await runtime.inspectRemovableSession({
        workspaceId: created.workspace.id,
        sessionId: created.session.id,
      });
      await runtime.removeValidatedSession({
        workspaceId: created.workspace.id,
        sessionId: created.session.id,
        fingerprint: inspected.fingerprint,
      });

      expect(trashed).toContain(path.basename(info!.path));
      expect(trashed).toContain(path.basename(notesPath));
      await readFile(path.join(simulatedTrashDir, path.basename(notesPath)), "utf8");
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 60_000);
});
