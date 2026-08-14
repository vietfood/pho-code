import type { SessionActivitySummary, SessionKey } from "./session-lifecycle";
import { sessionKeyEquals, sessionKeyId } from "./session-lifecycle";
import type { ProviderAuthFlowSnapshot } from "./credentials";
import type { HarnessError } from "./errors";
import type { PromptAdmission, RunState, RunStatus, RunWorkEntry, SessionSnapshot, ToolActivity } from "./conversation";
import type { ExtensionNotification, FeatureSnapshot, HostDialogRequest } from "./resources";
import type { HarnessSettingsSnapshot, PermissionStatusPayload } from "./settings";
import type { ProtocolVersion } from "./version";

export const RUNTIME_EVENT_TYPES = {
  sessionSnapshot: "sessionSnapshot",
  runAdmitted: "runAdmitted",
  textDelta: "textDelta",
  thinkingDelta: "thinkingDelta",
  toolEvent: "toolEvent",
  runSettled: "runSettled",
  runFailed: "runFailed",
  featureSnapshot: "featureSnapshot",
  extensionDialogRequest: "extensionDialogRequest",
  extensionDialogSettled: "extensionDialogSettled",
  extensionNotification: "extensionNotification",
  settingsSnapshot: "settingsSnapshot",
  permissionStatus: "permissionStatus",
  providerAuthFlow: "providerAuthFlow",
  sessionActivity: "sessionActivity",
  sessionRemoved: "sessionRemoved",
} as const;

export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[keyof typeof RUNTIME_EVENT_TYPES];

export interface RuntimeEventEnvelope<T = unknown> {
  protocolVersion: ProtocolVersion;
  sequence: number;
  sessionId?: string;
  workspaceId?: string;
  runId?: string;
  controllerGeneration?: number;
  type: string;
  payload: T;
  occurredAt: string;
}

export interface TextDeltaPayload {
  runId: string;
  delta: string;
}

export interface ThinkingDeltaPayload {
  runId: string;
  delta: string;
}

export interface ToolEventPayload extends ToolActivity {
  runId: string;
}

export interface RunFailedPayload {
  runId: string;
  error: HarnessError;
}

export interface ExtensionDialogSettledPayload {
  requestId: string;
  workspaceId?: string;
  sessionId?: string;
}

export interface SessionRemovedPayload extends SessionKey {
  title: string;
}

export type RuntimeEvent =
  | (RuntimeEventEnvelope<SessionSnapshot> & { type: typeof RUNTIME_EVENT_TYPES.sessionSnapshot })
  | (RuntimeEventEnvelope<PromptAdmission> & { type: typeof RUNTIME_EVENT_TYPES.runAdmitted })
  | (RuntimeEventEnvelope<TextDeltaPayload> & { type: typeof RUNTIME_EVENT_TYPES.textDelta })
  | (RuntimeEventEnvelope<ThinkingDeltaPayload> & { type: typeof RUNTIME_EVENT_TYPES.thinkingDelta })
  | (RuntimeEventEnvelope<ToolEventPayload> & { type: typeof RUNTIME_EVENT_TYPES.toolEvent })
  | (RuntimeEventEnvelope<SessionSnapshot> & { type: typeof RUNTIME_EVENT_TYPES.runSettled })
  | (RuntimeEventEnvelope<RunFailedPayload> & { type: typeof RUNTIME_EVENT_TYPES.runFailed })
  | (RuntimeEventEnvelope<FeatureSnapshot> & { type: typeof RUNTIME_EVENT_TYPES.featureSnapshot })
  | (RuntimeEventEnvelope<HostDialogRequest> & { type: typeof RUNTIME_EVENT_TYPES.extensionDialogRequest })
  | (RuntimeEventEnvelope<ExtensionDialogSettledPayload> & { type: typeof RUNTIME_EVENT_TYPES.extensionDialogSettled })
  | (RuntimeEventEnvelope<ExtensionNotification> & { type: typeof RUNTIME_EVENT_TYPES.extensionNotification })
  | (RuntimeEventEnvelope<HarnessSettingsSnapshot> & { type: typeof RUNTIME_EVENT_TYPES.settingsSnapshot })
  | (RuntimeEventEnvelope<PermissionStatusPayload> & { type: typeof RUNTIME_EVENT_TYPES.permissionStatus })
  | (RuntimeEventEnvelope<ProviderAuthFlowSnapshot> & { type: typeof RUNTIME_EVENT_TYPES.providerAuthFlow })
  | (RuntimeEventEnvelope<SessionActivitySummary[]> & { type: typeof RUNTIME_EVENT_TYPES.sessionActivity })
  | (RuntimeEventEnvelope<SessionRemovedPayload> & { type: typeof RUNTIME_EVENT_TYPES.sessionRemoved });

export type Unsubscribe = () => void;

export interface ConversationViewState {
  lastSequence: number;
  snapshot: SessionSnapshot | null;
  dialog: HostDialogRequest | null;
  notification: ExtensionNotification | null;
  settings: HarnessSettingsSnapshot | null;
  authFlow: ProviderAuthFlowSnapshot | null;
}

export interface ConversationCacheState {
  lastSequence: number;
  selectedKey: string | null;
  byKey: Record<string, ConversationViewState>;
  activity: SessionActivitySummary[];
  settings: HarnessSettingsSnapshot | null;
  authFlow: ProviderAuthFlowSnapshot | null;
}

export function emptyConversationState(): ConversationViewState {
  return {
    lastSequence: 0,
    snapshot: null,
    dialog: null,
    notification: null,
    settings: null,
    authFlow: null,
  };
}

export function emptyConversationCache(): ConversationCacheState {
  return {
    lastSequence: 0,
    selectedKey: null,
    byKey: {},
    activity: [],
    settings: null,
    authFlow: null,
  };
}

const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  "idle",
  "settled",
  "failed",
  "cancelled",
]);

function isTerminalRunStatus(status: RunStatus | undefined): boolean {
  return status === undefined || TERMINAL_RUN_STATUSES.has(status);
}

function isRunEstablishingEvent(type: string): boolean {
  return type === RUNTIME_EVENT_TYPES.sessionSnapshot || type === RUNTIME_EVENT_TYPES.runAdmitted;
}

/** High-frequency run events. Renderer should not rebuild conversation chrome for these. */
export function isLiveRunDeltaType(type: string): boolean {
  switch (type) {
    case RUNTIME_EVENT_TYPES.textDelta:
    case RUNTIME_EVENT_TYPES.thinkingDelta:
    case RUNTIME_EVENT_TYPES.toolEvent:
      return true;
    default:
      return false;
  }
}

/** Events that can change the projected session list. */
export function runtimeEventUpdatesSessionList(type: string): boolean {
  switch (type) {
    case RUNTIME_EVENT_TYPES.sessionSnapshot:
    case RUNTIME_EVENT_TYPES.runSettled:
    case RUNTIME_EVENT_TYPES.sessionActivity:
    case RUNTIME_EVENT_TYPES.sessionRemoved:
      return true;
    default:
      return false;
  }
}

export function isProcessScopedEventType(type: string): boolean {
  switch (type) {
    case RUNTIME_EVENT_TYPES.settingsSnapshot:
    case RUNTIME_EVENT_TYPES.permissionStatus:
    case RUNTIME_EVENT_TYPES.providerAuthFlow:
      return true;
    default:
      return false;
  }
}

export function appendThinkingDelta(work: readonly RunWorkEntry[], delta: string): RunWorkEntry[] {
  if (delta.length === 0) {
    return [...work];
  }
  const last = work[work.length - 1];
  if (last?.type === "thinking") {
    return [...work.slice(0, -1), { type: "thinking", text: last.text + delta }];
  }
  return [...work, { type: "thinking", text: delta }];
}

/** Keep in-flight streaming text/work when a later snapshot for the same run is empty. */
export function mergeLiveRun(current: RunState | undefined, incoming: RunState): RunState {
  if (!current) {
    return incoming;
  }
  const sameActiveRun =
    Boolean(incoming.runId) &&
    current.runId === incoming.runId &&
    !isTerminalRunStatus(current.status) &&
    !isTerminalRunStatus(incoming.status);
  if (!sameActiveRun) {
    return incoming;
  }
  return {
    ...incoming,
    streamingText: current.streamingText || incoming.streamingText,
    work: current.work.length > 0 ? current.work : incoming.work,
    startedAt: current.startedAt ?? incoming.startedAt,
  };
}

function runIdFromEvent(event: RuntimeEventEnvelope): string | undefined {
  if (typeof event.runId === "string") {
    return event.runId;
  }
  if (event.payload === null || typeof event.payload !== "object" || !("runId" in event.payload)) {
    return undefined;
  }
  return typeof event.payload.runId === "string" ? event.payload.runId : undefined;
}

/** Apply a high-frequency run delta without rebuilding conversation chrome. */
export function applyLiveRunDelta(run: RunState, event: RuntimeEventEnvelope): RunState {
  if (!isLiveRunDeltaType(event.type)) {
    return run;
  }
  const eventRunId = runIdFromEvent(event);
  if (eventRunId && run.runId && eventRunId !== run.runId) {
    return run;
  }

  switch (event.type) {
    case RUNTIME_EVENT_TYPES.textDelta: {
      const payload = event.payload as TextDeltaPayload;
      return {
        ...run,
        runId: run.runId ?? eventRunId,
        status: "streaming",
        streamingText: run.streamingText + payload.delta,
      };
    }
    case RUNTIME_EVENT_TYPES.thinkingDelta: {
      const payload = event.payload as ThinkingDeltaPayload;
      return {
        ...run,
        runId: run.runId ?? eventRunId,
        status: "streaming",
        work: appendThinkingDelta(run.work, payload.delta),
      };
    }
    case RUNTIME_EVENT_TYPES.toolEvent: {
      const payload = event.payload as ToolEventPayload;
      return {
        ...run,
        runId: run.runId ?? eventRunId,
        status: "streaming",
        work: upsertToolWork(run.work, {
          callId: payload.callId,
          name: payload.name,
          status: payload.status,
          inputPreview: payload.inputPreview,
          outputPreview: payload.outputPreview,
        }),
      };
    }
    default:
      return run;
  }
}

export function upsertToolWork(work: readonly RunWorkEntry[], tool: ToolActivity): RunWorkEntry[] {
  const index = work.findIndex((entry) => entry.type === "tool" && entry.callId === tool.callId);
  if (index < 0) {
    return [
      ...work,
      {
        type: "tool",
        callId: tool.callId,
        name: tool.name,
        status: tool.status,
        inputPreview: tool.inputPreview,
        outputPreview: tool.outputPreview,
      },
    ];
  }

  const existing = work[index];
  if (existing?.type !== "tool") {
    return [...work];
  }

  const next = [...work];
  next[index] = {
    type: "tool",
    callId: tool.callId,
    name: tool.name,
    status: tool.status,
    // Empty end/update payloads must not wipe the command preview shown while running.
    inputPreview: tool.inputPreview || existing.inputPreview,
    outputPreview: tool.outputPreview,
  };
  return next;
}

function preserveLiveRunFields(
  current: SessionSnapshot | null,
  incoming: SessionSnapshot,
): SessionSnapshot {
  if (!current) {
    return incoming;
  }
  return {
    ...incoming,
    run: mergeLiveRun(current.run, incoming.run),
  };
}

export function applyRuntimeEvent(
  state: ConversationViewState,
  event: RuntimeEventEnvelope,
): ConversationViewState {
  if (event.sequence <= state.lastSequence) {
    return state;
  }

  if (eventTargetsOtherSession(state, event)) {
    return { ...state, lastSequence: event.sequence };
  }

  const currentRunId = state.snapshot?.run.runId;
  const runMismatch = Boolean(event.runId && currentRunId && event.runId !== currentRunId);
  if (runMismatch) {
    const canReplace = isRunEstablishingEvent(event.type) && isTerminalRunStatus(state.snapshot?.run.status);
    if (!canReplace) {
      return { ...state, lastSequence: event.sequence };
    }
  }

  switch (event.type) {
    case RUNTIME_EVENT_TYPES.sessionSnapshot:
      return {
        lastSequence: event.sequence,
        snapshot: preserveLiveRunFields(state.snapshot, event.payload as SessionSnapshot),
        dialog: state.dialog,
        notification: state.notification,
        settings: state.settings,
        authFlow: state.authFlow,
      };
    case RUNTIME_EVENT_TYPES.runSettled:
      return {
        lastSequence: event.sequence,
        snapshot: event.payload as SessionSnapshot,
        dialog: state.dialog,
        notification: state.notification,
        settings: state.settings,
        authFlow: state.authFlow,
      };
    case RUNTIME_EVENT_TYPES.runAdmitted: {
      const snapshot = state.snapshot;
      if (!snapshot) {
        return { ...state, lastSequence: event.sequence };
      }
      const admission = event.payload as PromptAdmission;
      return {
        lastSequence: event.sequence,
        snapshot: {
          ...snapshot,
          run: {
            runId: admission.runId,
            status: "admitted",
            streamingText: "",
            work: [],
            startedAt: event.occurredAt,
          },
        },
        dialog: state.dialog,
        notification: state.notification,
        settings: state.settings,
        authFlow: state.authFlow,
      };
    }
    case RUNTIME_EVENT_TYPES.textDelta: {
      const snapshot = state.snapshot;
      if (!snapshot) {
        return { ...state, lastSequence: event.sequence };
      }
      const payload = event.payload as TextDeltaPayload;
      return {
        lastSequence: event.sequence,
        snapshot: {
          ...snapshot,
          run: {
            ...snapshot.run,
            status: "streaming",
            streamingText: snapshot.run.streamingText + payload.delta,
          },
        },
        dialog: state.dialog,
        notification: state.notification,
        settings: state.settings,
        authFlow: state.authFlow,
      };
    }
    case RUNTIME_EVENT_TYPES.thinkingDelta: {
      const snapshot = state.snapshot;
      if (!snapshot) {
        return { ...state, lastSequence: event.sequence };
      }
      const payload = event.payload as ThinkingDeltaPayload;
      return {
        lastSequence: event.sequence,
        snapshot: {
          ...snapshot,
          run: {
            ...snapshot.run,
            status: "streaming",
            work: appendThinkingDelta(snapshot.run.work, payload.delta),
          },
        },
        dialog: state.dialog,
        notification: state.notification,
        settings: state.settings,
        authFlow: state.authFlow,
      };
    }
    case RUNTIME_EVENT_TYPES.toolEvent: {
      const snapshot = state.snapshot;
      if (!snapshot) {
        return { ...state, lastSequence: event.sequence };
      }
      const payload = event.payload as ToolEventPayload;
      return {
        lastSequence: event.sequence,
        snapshot: {
          ...snapshot,
          run: {
            ...snapshot.run,
            status: "streaming",
            work: upsertToolWork(snapshot.run.work, {
              callId: payload.callId,
              name: payload.name,
              status: payload.status,
              inputPreview: payload.inputPreview,
              outputPreview: payload.outputPreview,
            }),
          },
        },
        dialog: state.dialog,
        notification: state.notification,
        settings: state.settings,
        authFlow: state.authFlow,
      };
    }
    case RUNTIME_EVENT_TYPES.runFailed: {
      const snapshot = state.snapshot;
      if (!snapshot) {
        return { ...state, lastSequence: event.sequence };
      }
      const payload = event.payload as RunFailedPayload;
      return {
        lastSequence: event.sequence,
        snapshot: {
          ...snapshot,
          run: {
            ...snapshot.run,
            status: "failed",
            error: payload.error,
          },
        },
        dialog: state.dialog,
        notification: state.notification,
        settings: state.settings,
        authFlow: state.authFlow,
      };
    }
    case RUNTIME_EVENT_TYPES.featureSnapshot: {
      const snapshot = state.snapshot;
      if (!snapshot) {
        return { ...state, lastSequence: event.sequence };
      }
      return {
        lastSequence: event.sequence,
        snapshot: {
          ...snapshot,
          features: event.payload as FeatureSnapshot,
        },
        dialog: state.dialog,
        notification: state.notification,
        settings: state.settings,
        authFlow: state.authFlow,
      };
    }
    case RUNTIME_EVENT_TYPES.extensionDialogRequest:
      return {
        ...state,
        lastSequence: event.sequence,
        dialog: event.payload as HostDialogRequest,
      };
    case RUNTIME_EVENT_TYPES.extensionDialogSettled: {
      const payload = event.payload as ExtensionDialogSettledPayload;
      return {
        ...state,
        lastSequence: event.sequence,
        dialog: state.dialog?.requestId === payload.requestId ? null : state.dialog,
      };
    }
    case RUNTIME_EVENT_TYPES.extensionNotification:
      return {
        ...state,
        lastSequence: event.sequence,
        notification: event.payload as ExtensionNotification,
      };
    case RUNTIME_EVENT_TYPES.settingsSnapshot: {
      const settings = event.payload as HarnessSettingsSnapshot;
      return {
        ...state,
        lastSequence: event.sequence,
        settings,
      };
    }
    case RUNTIME_EVENT_TYPES.permissionStatus: {
      const payload = event.payload as PermissionStatusPayload;
      const settings = state.settings;
      if (!settings) {
        return { ...state, lastSequence: event.sequence };
      }
      return {
        ...state,
        lastSequence: event.sequence,
        settings: {
          ...settings,
          permission: {
            ...settings.permission,
            yoloMode: payload.yoloMode,
          },
        },
      };
    }
    case RUNTIME_EVENT_TYPES.providerAuthFlow:
      return {
        ...state,
        lastSequence: event.sequence,
        authFlow: event.payload as ProviderAuthFlowSnapshot,
      };
    case RUNTIME_EVENT_TYPES.sessionActivity:
    case RUNTIME_EVENT_TYPES.sessionRemoved:
      return { ...state, lastSequence: event.sequence };
    default:
      return { ...state, lastSequence: event.sequence };
  }
}

function eventTargetsOtherSession(state: ConversationViewState, event: RuntimeEventEnvelope): boolean {
  if (isProcessScopedEventType(event.type)) {
    return false;
  }
  if (!state.snapshot) {
    return false;
  }
  const eventKey = eventSessionKey(event);
  if (eventKey) {
    return !sessionKeyEquals(eventKey, {
      workspaceId: state.snapshot.workspace.id,
      sessionId: state.snapshot.session.id,
    });
  }
  const eventSessionId = event.sessionId ?? eventSessionIdFromPayload(event);
  if (!eventSessionId) {
    return false;
  }
  return eventSessionId !== state.snapshot.session.id;
}

function eventSessionIdFromPayload(event: RuntimeEventEnvelope): string | undefined {
  if (event.payload === null || typeof event.payload !== "object") {
    return undefined;
  }
  const payload = event.payload as { sessionId?: unknown };
  return typeof payload.sessionId === "string" ? payload.sessionId : undefined;
}

export function eventSessionKey(event: RuntimeEventEnvelope): SessionKey | undefined {
  const sessionId = event.sessionId ?? eventSessionIdFromPayload(event);
  const workspaceId =
    event.workspaceId ??
    (event.payload !== null && typeof event.payload === "object"
      ? typeof (event.payload as { workspaceId?: unknown }).workspaceId === "string"
        ? (event.payload as { workspaceId: string }).workspaceId
        : typeof (event.payload as { session?: { workspaceId?: unknown } }).session?.workspaceId === "string"
          ? (event.payload as { session: { workspaceId: string } }).session.workspaceId
          : undefined
      : undefined);
  if (!sessionId || !workspaceId) {
    return undefined;
  }
  return { workspaceId, sessionId };
}

export function applyRuntimeEventToCache(
  cache: ConversationCacheState,
  event: RuntimeEventEnvelope,
): ConversationCacheState {
  if (event.sequence <= cache.lastSequence) {
    return cache;
  }

  if (isProcessScopedEventType(event.type)) {
    const selected = cache.selectedKey ? cache.byKey[cache.selectedKey] : undefined;
    const base = selected ?? {
      ...emptyConversationState(),
      lastSequence: cache.lastSequence,
      settings: cache.settings,
      authFlow: cache.authFlow,
    };
    const nextSelected = applyRuntimeEvent({ ...base, lastSequence: cache.lastSequence }, event);
    return {
      ...cache,
      lastSequence: event.sequence,
      settings: nextSelected.settings,
      authFlow: nextSelected.authFlow,
      byKey: cache.selectedKey
        ? { ...cache.byKey, [cache.selectedKey]: { ...nextSelected, lastSequence: event.sequence } }
        : cache.byKey,
    };
  }

  if (event.type === RUNTIME_EVENT_TYPES.sessionActivity) {
    return {
      ...cache,
      lastSequence: event.sequence,
      activity: event.payload as SessionActivitySummary[],
    };
  }

  if (event.type === RUNTIME_EVENT_TYPES.sessionRemoved) {
    const payload = event.payload as SessionRemovedPayload;
    const key = sessionKeyId(payload);
    const { [key]: _removed, ...rest } = cache.byKey;
    return {
      ...cache,
      lastSequence: event.sequence,
      selectedKey: cache.selectedKey === key ? null : cache.selectedKey,
      byKey: rest,
      activity: cache.activity.filter(
        (entry) => !(entry.workspaceId === payload.workspaceId && entry.sessionId === payload.sessionId),
      ),
    };
  }

  const key = eventSessionKey(event);
  if (!key) {
    return { ...cache, lastSequence: event.sequence };
  }
  const id = sessionKeyId(key);
  const current = cache.byKey[id] ?? { ...emptyConversationState(), lastSequence: cache.lastSequence };
  const next = applyRuntimeEvent({ ...current, lastSequence: cache.lastSequence }, event);
  return {
    ...cache,
    lastSequence: event.sequence,
    byKey: {
      ...cache.byKey,
      [id]: { ...next, lastSequence: event.sequence },
    },
  };
}
