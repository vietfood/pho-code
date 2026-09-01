import { describe, expect, test } from "bun:test";
import type { RuntimeEvent, SessionSnapshot } from "@pho-code/protocol";
import type { RuntimeEventDraft } from "../src/runtime-event-emitter";
import { SANDBOXED_BASH_CUSTOM_TYPE, type SandboxedBashCustomEntry } from "../src/sandboxed-bash";
import { createRuntimeEventProjector, type ProjectableSession } from "../src/runtime-events";

interface FakeSession extends ProjectableSession {
  label: string;
}

function fakeSession(overrides: Partial<FakeSession> = {}): FakeSession {
  const entries: SandboxedBashCustomEntry[] = [];
  return {
    label: "fake",
    key: { workspaceId: "/tmp/ws", sessionId: "s1" },
    disposing: false,
    runtime: {
      session: {
        sessionManager: {
          getEntries: () => entries,
          appendCustomEntry: (customType, data) => {
            entries.push({ type: "custom", customType, data });
          },
        },
        getSteeringMessages: () => [],
        getFollowUpMessages: () => [],
      },
    },
    ...overrides,
  };
}

function projectorFor(session: FakeSession, overrides: Partial<Parameters<typeof createRuntimeEventProjector<FakeSession>>[0]> = {}) {
  const emitted: RuntimeEventDraft[] = [];
  const projector = createRuntimeEventProjector<FakeSession>({
    emit: (event) => emitted.push(event),
    sandboxStatus: () => "healthy",
    isSelected: () => false,
    listSessions: () => [session],
    now: () => new Date("2026-08-28T00:00:00.000Z"),
    ...overrides,
  });
  return { projector, emitted };
}

describe("runtime event projection", () => {
  test("stamps the session's own identity onto every event it emits", () => {
    const session = fakeSession();
    const { projector, emitted } = projectorFor(session);

    projector.emitFor(session, { type: "runFailed" } as RuntimeEventDraft);

    expect(emitted[0]).toMatchObject({ workspaceId: "/tmp/ws", sessionId: "s1" });
  });

  test("keeps an explicit sessionId on the draft rather than overwriting it", () => {
    const session = fakeSession();
    const { projector, emitted } = projectorFor(session);

    projector.emitFor(session, { type: "runFailed", sessionId: "other" } as RuntimeEventDraft);

    expect(emitted[0]).toMatchObject({ workspaceId: "/tmp/ws", sessionId: "other" });
  });

  test("emits features before the session snapshot on a full snapshot", () => {
    const session = fakeSession();
    const { projector, emitted } = projectorFor(session);
    const snapshot = { session: { id: "s1" }, features: { loaded: [] } } as unknown as SessionSnapshot;

    projector.emitFullSnapshot(session, snapshot);

    expect(emitted.map((event) => event.type)).toEqual(["featureSnapshot", "sessionSnapshot"]);
  });

  test("marks a tool payload sandboxed only while the sandbox is actually wrapping bash", () => {
    const session = fakeSession();
    const offSession = fakeSession();
    const wrapped = projectorFor(session).projector;
    const off = projectorFor(offSession, { sandboxStatus: () => "off" }).projector;
    const event = { toolCallId: "call_1", toolName: "bash" };

    wrapped.rememberSandboxedBashCall(session, event.toolName, event.toolCallId);
    expect(wrapped.toolEventPayload(session, "r1", event, "running", "in", "out").sandboxed).toBe(true);
    expect(off.toolEventPayload(offSession, "r1", event, "running", "in", "out").sandboxed).toBeUndefined();
    expect(wrapped.toolEventPayload(session, "r1", { ...event, toolName: "read" }, "running", "in", "out").sandboxed).toBeUndefined();
  });

  test("does not record an elevated or Full bash call as sandboxed", () => {
    const session = fakeSession();
    const { projector } = projectorFor(session, { toolRunsSandboxed: () => false });
    projector.rememberSandboxedBashCall(session, "bash", "elevated");
    expect(
      projector.toolEventPayload(
        session,
        "r1",
        { toolCallId: "elevated", toolName: "bash" },
        "running",
        "",
        "",
      ).sandboxed,
    ).toBeUndefined();
  });

  test("records a sandboxed bash call once and never when the sandbox is off", () => {
    const session = fakeSession();
    const { projector } = projectorFor(session);

    projector.rememberSandboxedBashCall(session, "bash", "call_1");
    projector.rememberSandboxedBashCall(session, "bash", "call_1");
    const entries = session.runtime.session.sessionManager.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ customType: SANDBOXED_BASH_CUSTOM_TYPE, data: { callId: "call_1" } });

    const offSession = fakeSession();
    projectorFor(offSession, { sandboxStatus: () => "off" }).projector.rememberSandboxedBashCall(offSession, "bash", "call_2");
    expect(offSession.runtime.session.sessionManager.getEntries()).toHaveLength(0);
  });

  test("reports queued work from steering and follow-up messages, but never while disposing", () => {
    const queued = fakeSession();
    queued.runtime.session.getFollowUpMessages = () => ["later"];
    expect(projectorFor(queued).projector.hasQueuedWork(queued)).toBe(true);

    queued.disposing = true;
    expect(projectorFor(queued).projector.hasQueuedWork(queued)).toBe(false);
  });

  test("treats a throwing Pi session as having no queued work", () => {
    const broken = fakeSession();
    broken.runtime.session.getSteeringMessages = () => {
      throw new Error("session invalidated");
    };
    expect(projectorFor(broken).projector.hasQueuedWork(broken)).toBe(false);
  });

  test("projects working, attention, and idle phases from run and dialog state", () => {
    const idle = fakeSession();
    expect(projectorFor(idle).projector.projectActivity(idle).phase).toBe("idle");

    const working = fakeSession({
      activeRun: { runId: "r1", settled: false, startedAt: "2026-08-28T00:00:00.000Z" },
    });
    const workingSummary = projectorFor(working).projector.projectActivity(working);
    expect(workingSummary.phase).toBe("working");
    expect(workingSummary.runId).toBe("r1");

    // A pending dialog outranks a live run: the owner has to answer first.
    const asking = fakeSession({
      activeRun: { runId: "r1", settled: false, startedAt: "2026-08-28T00:00:00.000Z" },
      extensionHost: { hasPendingDialog: () => true },
    });
    expect(projectorFor(asking).projector.projectActivity(asking).phase).toBe("attention");

    const approval = fakeSession({
      activeRun: { runId: "r1", settled: false, startedAt: "2026-08-28T00:00:00.000Z" },
    });
    expect(projectorFor(approval, { requiresAttention: () => true }).projector.projectActivity(approval).phase)
      .toBe("attention");
  });

  test("a settled run still reports working while follow-up messages are queued", () => {
    const session = fakeSession({
      activeRun: { runId: "r1", settled: true, startedAt: "2026-08-28T00:00:00.000Z" },
    });
    session.runtime.session.getSteeringMessages = () => ["steer"];
    expect(projectorFor(session).projector.projectActivity(session).phase).toBe("working");
  });

  test("emits one activity row per resident controller", () => {
    const first = fakeSession();
    const second = fakeSession({ key: { workspaceId: "/tmp/ws", sessionId: "s2" } });
    const emitted: RuntimeEventDraft[] = [];
    const projector = createRuntimeEventProjector<FakeSession>({
      emit: (event) => emitted.push(event),
      sandboxStatus: () => "off",
      isSelected: (session) => session.key.sessionId === "s2",
      listSessions: () => [first, second],
    });

    projector.emitActivity();

    const payload = (emitted[0] as RuntimeEvent & { payload: { sessionId: string; selected: boolean }[] }).payload;
    expect(payload.map((row) => row.sessionId)).toEqual(["s1", "s2"]);
    expect(payload.map((row) => row.selected)).toEqual([false, true]);
  });
});
