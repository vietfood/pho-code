import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import {
  HARNESS_ERROR_CODES,
  RUNTIME_EVENT_TYPES,
  isTranscriptCompactionBoundary,
  type CompactionStateChangedPayload,
  type RuntimeEvent,
} from "@pho-code/protocol";
import { createPhoCodeRuntime } from "../src/index";

type TestRuntime = Awaited<ReturnType<typeof createPhoCodeRuntime>>;

async function makeIsolatedDirs() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-compaction-"));
  const agentDir = path.join(root, "agent");
  const workspaceDir = path.join(root, "workspace");
  await mkdir(agentDir);
  await mkdir(workspaceDir);
  return { agentDir, workspaceDir };
}

function compactionPayloads(events: RuntimeEvent[]): CompactionStateChangedPayload[] {
  return events
    .filter((event) => event.type === RUNTIME_EVENT_TYPES.compactionStateChanged)
    .map((event) => event.payload as CompactionStateChangedPayload);
}

describe("Pi runtime compaction", () => {
  test("manual compaction projects a boundary, keeps history visible, and exposes detail", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createPhoCodeRuntime({
      agentDir,
      deterministicTestModel: true,
    });
    const events: RuntimeEvent[] = [];

    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const created = await runtime.createSession(workspace.workspace.id);
      expect(created.compaction).toEqual({ status: "idle", cancelable: false });

      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      await sendExchanges(runtime, created.session.id, events, 6);

      const compacted = await runtime.compactSession({ sessionId: created.session.id });
      expect(compacted.compaction).toEqual({ status: "idle", cancelable: false });

      const boundary = compacted.messages.find(isTranscriptCompactionBoundary);
      expect(boundary).toBeDefined();
      expect(boundary!.hasSummary).toBe(true);
      expect(boundary!.reason).toBe("manual");
      expect(boundary!.fromHook).toBe(false);
      expect(boundary!.tokensBefore).toBeGreaterThan(0);

      // The full pre-boundary transcript stays visible.
      expect(
        compacted.messages.some(
          (message) =>
            !isTranscriptCompactionBoundary(message) &&
            message.role === "user" &&
            message.blocks.some((block) => block.type === "text" && block.text.includes("hello")),
        ),
      ).toBe(true);

      const transitions = compactionPayloads(events);
      const compacting = transitions.find((payload) => payload.compaction.status === "compacting");
      expect(compacting?.compaction).toMatchObject({
        status: "compacting",
        reason: "manual",
        cancelable: true,
      });
      expect(typeof compacting?.compaction.startedAt).toBe("string");
      const settled = transitions[transitions.length - 1]!;
      expect(settled.compaction).toEqual({ status: "idle", cancelable: false });
      expect(settled.outcome).toBe("completed");
      expect(settled.reason).toBe("manual");
      expect(settled.compactionId).toBe(boundary!.id);

      const detail = await runtime.getCompactionDetail({
        sessionId: created.session.id,
        compactionId: boundary!.id,
      });
      expect(detail.compactionId).toBe(boundary!.id);
      expect(detail.sessionId).toBe(created.session.id);
      expect(detail.workspaceId).toBe(workspace.workspace.id);
      expect(detail.summary.length).toBeGreaterThan(0);
      expect(detail.truncated).toBe(false);
      expect(detail.tokensBefore).toBe(boundary!.tokensBefore);

      await expect(
        runtime.getCompactionDetail({ sessionId: created.session.id, compactionId: "missing" }),
      ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.invalidCommand });
      const messageEntry = compacted.messages.find((message) => !isTranscriptCompactionBoundary(message));
      await expect(
        runtime.getCompactionDetail({
          sessionId: created.session.id,
          compactionId: messageEntry?.id ?? "",
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.invalidCommand });
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  test("manual compaction boundary survives a runtime restart without stale progress", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createPhoCodeRuntime({
      agentDir,
      deterministicTestModel: true,
    });
    let sessionId = "";
    let workspaceId = "";
    let compactionId = "";

    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      workspaceId = workspace.workspace.id;
      const created = await runtime.createSession(workspaceId);
      sessionId = created.session.id;
      const events: RuntimeEvent[] = [];
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      await sendExchanges(runtime, sessionId, events, 6);
      const compacted = await runtime.compactSession({ sessionId });
      compactionId = compacted.messages.find(isTranscriptCompactionBoundary)?.id ?? "";
      expect(compactionId).not.toBe("");
      stop();
    } finally {
      await runtime.dispose();
    }

    const reopened = await createPhoCodeRuntime({
      agentDir,
      deterministicTestModel: true,
    });
    try {
      const snapshot = await reopened.openSession(workspaceId, sessionId);
      // No stale progress after restart.
      expect(snapshot.compaction).toEqual({ status: "idle", cancelable: false });
      const boundary = snapshot.messages.find(isTranscriptCompactionBoundary);
      expect(boundary).toBeDefined();
      expect(boundary!.id).toBe(compactionId);
      expect(boundary!.hasSummary).toBe(true);
      // Pi does not persist the trigger reason on the entry; the reason is
      // only available from live enrichment in the same process.
      expect(boundary!.reason).toBeUndefined();
      expect(
        snapshot.messages.some(
          (message) =>
            !isTranscriptCompactionBoundary(message) &&
            message.role === "user" &&
            message.blocks.some((block) => block.type === "text" && block.text.includes("hello")),
        ),
      ).toBe(true);
      const detail = await reopened.getCompactionDetail({ sessionId, compactionId });
      expect(detail.compactionId).toBe(compactionId);
      expect(detail.summary.length).toBeGreaterThan(0);
    } finally {
      await reopened.dispose();
    }
  }, 30_000);

  test("refuses manual compaction while another compaction runs and while a run is active", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    let releaseCompaction: () => void = () => undefined;
    let markGateEntered: () => void = () => undefined;
    const gateEntered = new Promise<void>((resolve) => {
      markGateEntered = resolve;
    });
    const gateExtension: InlineExtension = {
      name: "harness-compaction-gate",
      factory(pi) {
        pi.on("session_before_compact", async (event) => {
          markGateEntered();
          await new Promise<void>((release) => {
            releaseCompaction = release;
            if (event.signal.aborted) {
              release();
              return;
            }
            event.signal.addEventListener("abort", () => release(), { once: true });
          });
          return undefined;
        });
      },
    };
    const runtime = await createPhoCodeRuntime({
      agentDir,
      deterministicTestModel: true,
      featureManifest: {
        features: [{ id: "harness-compaction-gate", version: "test", extensionFactories: [gateExtension] }],
      },
    });
    const events: RuntimeEvent[] = [];

    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      await sendExchanges(runtime, created.session.id, events, 6);

      const first = runtime.compactSession({ sessionId: created.session.id });
      await gateEntered;
      await expect(
        runtime.compactSession({ sessionId: created.session.id }),
      ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.sessionBusy });
      releaseCompaction();
      const compacted = await first;
      expect(compacted.messages.some(isTranscriptCompactionBoundary)).toBe(true);

      const admission = await runtime.sendPrompt({
        sessionId: created.session.id,
        text: "ABORT_ME",
      });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runAdmitted);
      await expect(
        runtime.compactSession({ sessionId: created.session.id }),
      ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.sessionBusy });
      await runtime.abortRun({ sessionId: created.session.id, runId: admission.runId });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled, (event) => event.runId === admission.runId);
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  test("cancel settles a gated manual compaction without appending a boundary", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    let markGateEntered: () => void = () => undefined;
    const gateEntered = new Promise<void>((resolve) => {
      markGateEntered = resolve;
    });
    const gateExtension: InlineExtension = {
      name: "harness-compaction-gate",
      factory(pi) {
        pi.on("session_before_compact", async (event) => {
          markGateEntered();
          await new Promise<void>((release) => {
            if (event.signal.aborted) {
              release();
              return;
            }
            event.signal.addEventListener("abort", () => release(), { once: true });
          });
          return undefined;
        });
      },
    };
    const runtime = await createPhoCodeRuntime({
      agentDir,
      deterministicTestModel: true,
      featureManifest: {
        features: [{ id: "harness-compaction-gate", version: "test", extensionFactories: [gateExtension] }],
      },
    });
    const events: RuntimeEvent[] = [];

    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      await sendExchanges(runtime, created.session.id, events, 6);

      const pending = runtime.compactSession({ sessionId: created.session.id });
      await gateEntered;
      const compacting = compactionPayloads(events).at(-1);
      expect(compacting?.compaction).toMatchObject({
        status: "compacting",
        reason: "manual",
        cancelable: true,
      });

      await runtime.cancelSessionCompaction({ sessionId: created.session.id });
      const snapshot = await pending;
      expect(snapshot.compaction).toEqual({ status: "idle", cancelable: false });
      expect(snapshot.messages.some(isTranscriptCompactionBoundary)).toBe(false);

      const settled = compactionPayloads(events).at(-1);
      expect(settled?.compaction).toEqual({ status: "idle", cancelable: false });
      expect(settled?.outcome).toBe("cancelled");
      expect(settled?.reason).toBe("manual");

      // The session still accepts work after a cancelled compaction.
      const second = await runtime.sendPrompt({ sessionId: created.session.id, text: "hello again" });
      expect(second.admitted).toBe(true);
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled, (event) => event.runId === second.runId);
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  test("reports a failed outcome when there is nothing to compact", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createPhoCodeRuntime({
      agentDir,
      deterministicTestModel: true,
    });
    const events: RuntimeEvent[] = [];

    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      await expect(runtime.compactSession({ sessionId: created.session.id })).rejects.toMatchObject({
        code: HARNESS_ERROR_CODES.invalidCommand,
      });
      const transitions = compactionPayloads(events);
      expect(transitions.some((payload) => payload.compaction.status === "compacting")).toBe(true);
      const settled = transitions[transitions.length - 1]!;
      expect(settled.compaction).toEqual({ status: "idle", cancelable: false });
      expect(settled.outcome).toBe("failed");
      expect(typeof settled.errorMessage).toBe("string");
      expect(settled.errorMessage!.length).toBeGreaterThan(0);
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  test("keeps compaction state isolated between sessions", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createPhoCodeRuntime({
      agentDir,
      deterministicTestModel: true,
    });
    const events: RuntimeEvent[] = [];

    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const first = await runtime.createSession(workspace.workspace.id);
      const second = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      await sendExchanges(runtime, first.session.id, events, 6);
      await sendExchanges(runtime, second.session.id, events, 6);

      const compacted = await runtime.compactSession({ sessionId: first.session.id });
      expect(compacted.messages.some(isTranscriptCompactionBoundary)).toBe(true);

      const other = await runtime.getSessionSnapshot({
        workspaceId: workspace.workspace.id,
        sessionId: second.session.id,
      });
      expect(other.compaction).toEqual({ status: "idle", cancelable: false });
      expect(other.messages.some(isTranscriptCompactionBoundary)).toBe(false);

      const stateEvents = compactionPayloads(events);
      expect(stateEvents.length).toBeGreaterThan(0);
      expect(stateEvents.every((payload) => payload.sessionId === first.session.id)).toBe(true);
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 60_000);
});

// The deterministic test settings use a small keepRecentTokens budget, but a
// single exchange is still too small to compact; several exchanges give Pi a
// real cut point.
async function sendExchanges(
  runtime: TestRuntime,
  sessionId: string,
  events: RuntimeEvent[],
  count: number,
) {
  for (let index = 0; index < count; index += 1) {
    const admission = await runtime.sendPrompt({ sessionId, text: "hello" });
    await waitForEvent(
      events,
      RUNTIME_EVENT_TYPES.runSettled,
      (event) => event.sessionId === sessionId && event.runId === admission.runId,
    );
  }
}

async function waitForEvent(
  events: RuntimeEvent[],
  type: RuntimeEvent["type"],
  predicate: (event: RuntimeEvent) => boolean = () => true,
  timeoutMs = 15_000,
): Promise<RuntimeEvent> {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const match = events.find((event) => event.type === type && predicate(event));
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${type}. Saw: ${events.map((event) => event.type).join(", ")}`);
}
