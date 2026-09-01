import {
  RUNTIME_EVENT_TYPES,
  sandboxBashWasWrapped,
  sessionActivityPhase,
  type SandboxStatus,
  type SessionActivitySummary,
  type SessionSnapshot,
} from "@pho-code/protocol";
import type { RuntimeEventDraft } from "./runtime-event-emitter";
import { collectSandboxedBashCallIds, SANDBOXED_BASH_CUSTOM_TYPE, type SandboxedBashCustomEntry } from "./sandboxed-bash";

/**
 * The parts of a live session this projector reads. Declared structurally so
 * the runtime's `LiveSession` stays private and so projection can be tested
 * against plain objects instead of a constructed Pi session.
 */
export interface ProjectableSession {
  key: { workspaceId: string; sessionId: string };
  disposing: boolean;
  activeRun?: { runId: string; settled: boolean; startedAt: string };
  compaction?: { busy(): boolean };
  extensionHost?: { hasPendingDialog(): boolean };
  runtime: {
    session: {
      sessionManager: {
        getEntries(): readonly SandboxedBashCustomEntry[];
        appendCustomEntry(customType: string, data: unknown): void;
      };
      getSteeringMessages(): readonly unknown[];
      getFollowUpMessages(): readonly unknown[];
    };
  };
}

export interface ToolEventPayload {
  runId: string;
  callId: string;
  name: string;
  status: "running" | "completed" | "failed";
  inputPreview: string;
  outputPreview: string;
  sandboxed?: true;
}

export interface RuntimeEventProjector<TSession extends ProjectableSession> {
  /** Emit an event already attributed to `session`'s workspace and session. */
  emitFor(session: TSession, event: RuntimeEventDraft): void;
  toolEventPayload(
    session: TSession,
    runId: string,
    event: { toolCallId: string; toolName: string },
    status: "running" | "completed" | "failed",
    inputPreview: string,
    outputPreview: string,
  ): ToolEventPayload;
  /** Record, once, that a tool call ran inside the sandbox wrap. */
  rememberSandboxedBashCall(session: TSession, toolName: string, callId: string): void;
  emitSessionSnapshot(session: TSession, snapshot: SessionSnapshot): void;
  emitFullSnapshot(session: TSession, snapshot: SessionSnapshot): void;
  hasQueuedWork(session: TSession): boolean;
  projectActivity(session: TSession): SessionActivitySummary;
  /** Emit the activity row for every resident controller. */
  emitActivity(): void;
}

/**
 * Owns how live session state becomes protocol events.
 *
 * Extracted from `createPhoCodeRuntime`, where these projections sat between
 * unrelated construction statements and could only be exercised through a fully
 * constructed runtime. The dependencies are read through callbacks rather than
 * captured values because every one of them changes after construction: the
 * sandbox can start or stop, the selection moves, and controllers come and go.
 */
export function createRuntimeEventProjector<TSession extends ProjectableSession>(deps: {
  emit(event: RuntimeEventDraft): void;
  sandboxStatus(): SandboxStatus;
  isSelected(session: TSession): boolean;
  listSessions(): readonly TSession[];
  requiresAttention?(session: TSession): boolean;
  toolRunsSandboxed?(session: TSession, toolName: string, callId: string): boolean;
  now?(): Date;
}): RuntimeEventProjector<TSession> {
  const now = deps.now ?? (() => new Date());

  function emitFor(session: TSession, event: RuntimeEventDraft): void {
    deps.emit({
      ...event,
      workspaceId: session.key.workspaceId,
      sessionId: event.sessionId ?? session.key.sessionId,
    });
  }

  function emitSessionSnapshot(session: TSession, snapshot: SessionSnapshot): void {
    emitFor(session, {
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      sessionId: snapshot.session.id,
      payload: snapshot,
    });
  }

  function hasQueuedWork(session: TSession): boolean {
    if (session.disposing) {
      return false;
    }
    try {
      const piSession = session.runtime.session;
      return piSession.getSteeringMessages().length > 0 || piSession.getFollowUpMessages().length > 0;
    } catch {
      return false;
    }
  }

  function projectActivity(session: TSession): SessionActivitySummary {
    const working =
      Boolean(session.activeRun && !session.activeRun.settled) ||
      session.compaction?.busy() === true ||
      hasQueuedWork(session);
    const attention =
      session.extensionHost?.hasPendingDialog() === true || deps.requiresAttention?.(session) === true;
    const updatedAt = session.activeRun?.startedAt ?? now().toISOString();
    const summary: SessionActivitySummary = {
      workspaceId: session.key.workspaceId,
      sessionId: session.key.sessionId,
      phase: sessionActivityPhase({ attention, working }),
      selected: deps.isSelected(session),
      archived: false,
      unread: false,
      updatedAt,
    };
    if (session.activeRun) {
      summary.runId = session.activeRun.runId;
      summary.startedAt = session.activeRun.startedAt;
    }
    return summary;
  }

  return {
    emitFor,
    emitSessionSnapshot,
    hasQueuedWork,
    projectActivity,
    toolEventPayload(session, runId, event, status, inputPreview, outputPreview) {
      const sandboxed = event.toolName === "bash" && collectSandboxedBashCallIds(
        session.runtime.session.sessionManager.getEntries(),
      ).has(event.toolCallId);
      return {
        runId,
        callId: event.toolCallId,
        name: event.toolName,
        status,
        inputPreview,
        outputPreview,
        ...(sandboxed ? { sandboxed: true as const } : {}),
      };
    },
    rememberSandboxedBashCall(session, toolName, callId) {
      const sandboxed = deps.toolRunsSandboxed?.(session, toolName, callId) ??
        sandboxBashWasWrapped(toolName, deps.sandboxStatus());
      if (!sandboxed) {
        return;
      }
      if (collectSandboxedBashCallIds(session.runtime.session.sessionManager.getEntries()).has(callId)) {
        return;
      }
      session.runtime.session.sessionManager.appendCustomEntry(SANDBOXED_BASH_CUSTOM_TYPE, { callId });
    },
    emitFullSnapshot(session, snapshot) {
      emitFor(session, {
        type: RUNTIME_EVENT_TYPES.featureSnapshot,
        sessionId: snapshot.session.id,
        payload: snapshot.features,
      });
      emitSessionSnapshot(session, snapshot);
    },
    emitActivity() {
      deps.emit({
        type: RUNTIME_EVENT_TYPES.sessionActivity,
        payload: deps.listSessions().map(projectActivity),
      });
    },
  };
}
