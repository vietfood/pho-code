import { createAgentBackendRegistry, createAgentHost, type AgentBackendAdapter } from "@pho-agent/host";
import { PI_BACKEND_DESCRIPTOR } from "@pho-agent/runtime";
import {
  PROTOCOL_VERSION,
  RUNTIME_EVENT_TYPES,
  createHarnessError,
  emptyQueueState,
  idleAgentCompactionState,
  isThinkingLevel,
  HARNESS_ERROR_CODES,
  sessionBackendId,
  sessionKeyId,
  type AgentBackendEvent,
  type AgentBackendSessionSnapshot,
  type AgentInteractionRequest,
  type AgentSessionSnapshot,
  type HostDialogRequest,
  type ModelSummary,
  type RuntimeEvent,
  type SessionActivitySummary,
  type SessionKey,
  type SessionSnapshot,
  type SessionSummary,
  type WorkspaceSnapshot,
  defaultSessionApprovalSnapshot,
} from "@pho-code/protocol";
import { projectBackendConversation } from "./backend-conversation";
import type { HarnessRuntime } from "./harness-runtime";

type PhoCodeSessionBackend = Pick<
  HarnessRuntime,
  | "getSessionSnapshot"
  | "createSession"
  | "openSession"
  | "sendPrompt"
  | "steerRun"
  | "queueFollowUp"
  | "abortRun"
> & {
  descriptor: typeof PI_BACKEND_DESCRIPTOR;
  dispose(): Promise<void>;
};

export interface HostPhoCodeRuntimeOptions {
  backends?: readonly AgentBackendAdapter[];
}

export function hostPhoCodeRuntime(
  runtime: HarnessRuntime,
  options: HostPhoCodeRuntimeOptions = {},
): HarnessRuntime {
  const pi: PhoCodeSessionBackend = {
    descriptor: PI_BACKEND_DESCRIPTOR,
    getSessionSnapshot: runtime.getSessionSnapshot,
    createSession: runtime.createSession,
    openSession: runtime.openSession,
    sendPrompt: runtime.sendPrompt,
    steerRun: runtime.steerRun,
    queueFollowUp: runtime.queueFollowUp,
    abortRun: runtime.abortRun,
    dispose: async () => undefined,
  };
  const piRegistry = createAgentBackendRegistry([pi]);
  const agentHost = createAgentHost(options.backends ?? []);
  const workspaceById = new Map<string, WorkspaceSnapshot>();
  const agentSessions = new Map<string, AgentBackendSessionSnapshot>();
  const agentSummaries = new Map<string, SessionSummary>();
  const agentInteractions = new Map<string, { event: AgentBackendEvent & { type: "interaction_requested" }; request: AgentInteractionRequest }>();
  const listeners = new Set<(event: RuntimeEvent) => void>();
  let sequence = 0;
  let disposed = false;

  const inspectWorkspace = runtime.inspectWorkspace;
  const listWorkspaceSessions = runtime.listWorkspaceSessions;
  const listSessionActivity = runtime.listSessionActivity;
  const subscribe = runtime.subscribe;
  const dispose = runtime.dispose;
  const piOnly = {
    inspectRemovableSession: runtime.inspectRemovableSession,
    removeValidatedSession: runtime.removeValidatedSession,
    prepareImage: runtime.prepareImage,
    removePreparedImage: runtime.removePreparedImage,
    setSessionModel: runtime.setSessionModel,
    setThinkingLevel: runtime.setThinkingLevel,
    setSessionMode: runtime.setSessionMode,
    setSessionApprovalMode: runtime.setSessionApprovalMode,
    updateSessionPlanDocument: runtime.updateSessionPlanDocument,
    executeSessionPlan: runtime.executeSessionPlan,
    updateTaskBrief: runtime.updateTaskBrief,
    resetTaskBrief: runtime.resetTaskBrief,
    reopenTask: runtime.reopenTask,
    recordOwnerVerification: runtime.recordOwnerVerification,
    acceptTaskCompletionGaps: runtime.acceptTaskCompletionGaps,
    rewriteAssistantOutput: runtime.rewriteAssistantOutput,
    updateSessionContextPrompt: runtime.updateSessionContextPrompt,
    resolveHostDialog: runtime.resolveHostDialog,
  };

  const emit = (event: RuntimeEvent): void => {
    const projected = { ...event, sequence: ++sequence };
    for (const listener of listeners) listener(projected);
  };

  const rawUnsubscribe = subscribe((event) => emit(event));
  const agentUnsubscribe = agentHost.subscribe((event) => projectAgentEvent(event));

  function piAdapter(): PhoCodeSessionBackend {
    return disposed ? pi : piRegistry.resolve(PI_BACKEND_DESCRIPTOR.id).adapter;
  }

  function usePi(key: Pick<SessionKey, "backendId">): boolean {
    return sessionBackendId(key) === PI_BACKEND_DESCRIPTOR.id;
  }

  function backendKey(key: { backendId?: string; workspaceId?: string; sessionId: string }) {
    if (!key.workspaceId) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.workspaceNotSelected,
        message: "The backend session requires its owning project.",
        operation: "session",
        recoverable: true,
      });
    }
    return {
      backendId: sessionBackendId(key),
      scopeId: key.workspaceId,
      sessionId: key.sessionId,
    };
  }

  function rememberAgentSnapshot(snapshot: AgentBackendSessionSnapshot): SessionSnapshot {
    agentSessions.set(agentSummaryId(snapshot), snapshot);
    const previous = agentSummaries.get(agentSummaryId(snapshot));
    const preview = previewFromSnapshot(snapshot);
    const summary: SessionSummary = {
      id: snapshot.key.sessionId,
      backendId: snapshot.key.backendId,
      workspaceId: snapshot.key.scopeId,
      title: titleFromSnapshot(snapshot) ?? previous?.title ?? "New session",
      updatedAt: new Date().toISOString(),
      ...(preview ? { preview } : {}),
    };
    agentSummaries.set(agentSummaryId(snapshot), summary);
    return projectAgentSnapshot(snapshot, summary);
  }

  function projectAgentSnapshot(
    snapshot: AgentBackendSessionSnapshot,
    summary = agentSummaries.get(agentSummaryId(snapshot)),
  ): SessionSnapshot {
    const workspace = workspaceById.get(snapshot.key.scopeId);
    if (!workspace) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.workspaceNotSelected,
        message: "Select this project before opening its backend session.",
        operation: "openSession",
        recoverable: true,
      });
    }
    const session = summary ?? {
      id: snapshot.key.sessionId,
      backendId: snapshot.key.backendId,
      workspaceId: snapshot.key.scopeId,
      title: "New session",
      updatedAt: new Date().toISOString(),
    };
    const conversation = projectBackendConversation(snapshot as AgentSessionSnapshot);
    const models = projectAgentModels(snapshot);
    const model = models.find((candidate) => candidate.id === snapshot.model?.currentId);
    const thinking = projectAgentThinking(snapshot);
    return {
      session,
      workspace: workspace.workspace,
      messages: conversation.messages,
      compaction: idleAgentCompactionState(),
      run: conversation.run,
      ...(model ? { model } : {}),
      models,
      sessions: combinedSessions(workspace),
      features: workspace.features,
      thinkingLevel: thinking.current,
      availableThinkingLevels: thinking.available,
      supportsThinking: thinking.available.length > 0,
      ...(snapshot.fastMode ? { fastMode: snapshot.fastMode } : {}),
      queue: emptyQueueState(),
      approval: {
        ...defaultSessionApprovalSnapshot(),
        supportedModes: [{ mode: "ask", owner: "backend", support: "native" }],
      },
      ...(snapshot.task ? { task: snapshot.task } : {}),
    };
  }

  function combinedSessions(workspace: WorkspaceSnapshot): SessionSummary[] {
    const backend = [...agentSummaries.values()].filter((entry) => entry.workspaceId === workspace.workspace.id);
    return [...workspace.sessions, ...backend];
  }

  const agentEnvelope = (event: {
    backendId: string;
    scopeId: string;
    sessionId: string;
    occurredAt: string;
  }) => ({
    protocolVersion: PROTOCOL_VERSION,
    sequence: 0,
    backendId: event.backendId,
    workspaceId: event.scopeId,
    sessionId: event.sessionId,
    occurredAt: event.occurredAt,
  });

  function projectAgentEvent(event: AgentBackendEvent): void {
    if (event.type === "text_delta") {
      emit({
        ...agentEnvelope(event),
        runId: event.runId,
        type: RUNTIME_EVENT_TYPES.textDelta,
        payload: { runId: event.runId, delta: event.delta },
      });
      return;
    }
    if (event.type === "tool_update") {
      emit({
        ...agentEnvelope(event),
        runId: event.runId,
        type: RUNTIME_EVENT_TYPES.toolEvent,
        payload: {
          runId: event.runId,
          callId: event.tool.id,
          name: event.tool.title?.trim() || event.tool.name,
          ...(event.tool.kind ? { kind: event.tool.kind } : {}),
          status: event.tool.status,
          inputPreview: event.tool.input ?? "",
          outputPreview: event.tool.output ?? "",
        },
      });
      return;
    }
    if (event.type === "interaction_requested") {
      agentInteractions.set(event.request.requestId, { event, request: event.request });
      emit({
        ...agentEnvelope(event),
        runId: event.runId,
        type: RUNTIME_EVENT_TYPES.extensionDialogRequest,
        payload: projectInteractionDialog(event),
      });
      emitActivity();
      return;
    }
    if (event.type === "interaction_settled") {
      agentInteractions.delete(event.requestId);
      emit({
        ...agentEnvelope(event),
        runId: event.runId,
        type: RUNTIME_EVENT_TYPES.extensionDialogSettled,
        payload: { requestId: event.requestId, workspaceId: event.scopeId, sessionId: event.sessionId },
      });
      emitActivity();
      return;
    }
    if (event.type === "session_snapshot") {
      const snapshot = rememberAgentSnapshot(event.snapshot);
      emit({
        ...agentEnvelope(event),
        ...(event.snapshot.run.runId ? { runId: event.snapshot.run.runId } : {}),
        type: RUNTIME_EVENT_TYPES.sessionSnapshot,
        payload: snapshot,
      });
      emitActivity();
    }
  }

  function emitActivity(): void {
    emit({
      protocolVersion: PROTOCOL_VERSION,
      sequence: 0,
      type: RUNTIME_EVENT_TYPES.sessionActivity,
      payload: runtime.listSessionActivity(),
      occurredAt: new Date().toISOString(),
    });
  }

  function agentActivity(): SessionActivitySummary[] {
    return [...agentSessions.values()].map((snapshot) => ({
      backendId: snapshot.key.backendId,
      workspaceId: snapshot.key.scopeId,
      sessionId: snapshot.key.sessionId,
      phase: snapshot.run.status === "running" ? "working" : snapshot.run.status === "failed" ? "failed" : "idle",
      selected: false,
      archived: false,
      unread: false,
      ...(snapshot.run.runId ? { runId: snapshot.run.runId } : {}),
      updatedAt: agentSummaries.get(agentSummaryId(snapshot))?.updatedAt ?? new Date().toISOString(),
    }));
  }

  runtime.listAgentBackends = () => [...piRegistry.listDescriptors(), ...agentHost.listBackends()];
  runtime.inspectWorkspace = async (input) => {
    const snapshot = await inspectWorkspace(input);
    workspaceById.set(snapshot.workspace.id, snapshot);
    return { ...snapshot, sessions: combinedSessions(snapshot) };
  };
  runtime.listWorkspaceSessions = async (workspaceId) => {
    const piSessions = await listWorkspaceSessions(workspaceId);
    const workspace = workspaceById.get(workspaceId);
    if (workspace) workspaceById.set(workspaceId, { ...workspace, sessions: piSessions });
    return [...piSessions, ...[...agentSummaries.values()].filter((entry) => entry.workspaceId === workspaceId)];
  };
  runtime.listSessionActivity = () => [...listSessionActivity(), ...agentActivity()];
  runtime.getSessionSnapshot = async (key) => usePi(key)
    ? piAdapter().getSessionSnapshot(key)
    : projectAgentSnapshot(await agentHost.getSessionSnapshot(backendKey(key)));
  runtime.createSession = async (workspaceId, backendId = PI_BACKEND_DESCRIPTOR.id) => backendId === PI_BACKEND_DESCRIPTOR.id
    ? piAdapter().createSession(workspaceId)
    : rememberAgentSnapshot(await agentHost.createSession({ backendId, scopeId: workspaceId }));
  runtime.openSession = async (workspaceId, sessionId, backendId) => {
    const key = { ...(backendId ? { backendId } : {}), workspaceId, sessionId };
    return usePi(key)
      ? piAdapter().openSession(workspaceId, sessionId)
      : rememberAgentSnapshot(await agentHost.openSession(backendKey(key)));
  };
  runtime.sendPrompt = async (input) => {
    if (usePi(input)) return piAdapter().sendPrompt(input);
    if (input.imageIds?.length) throw unsupported("images", input.backendId);
    const admission = await agentHost.sendPrompt({ ...backendKey(input), text: input.text });
    return {
      backendId: admission.backendId,
      workspaceId: admission.scopeId,
      sessionId: admission.sessionId,
      runId: admission.runId,
      admitted: admission.admitted,
    };
  };
  runtime.steerRun = async (input) => {
    if (usePi(input)) return piAdapter().steerRun(input);
    const admission = await agentHost.steerRun({ ...backendKey(input), runId: input.runId, text: input.text });
    return {
      backendId: admission.backendId,
      workspaceId: admission.scopeId,
      sessionId: admission.sessionId,
      runId: admission.runId,
      admitted: admission.admitted,
      queue: emptyQueueState(),
    };
  };
  runtime.queueFollowUp = async (input) => {
    if (usePi(input)) return piAdapter().queueFollowUp(input);
    throw unsupported("queued follow-up", input.backendId);
  };
  runtime.abortRun = async (input) => usePi(input)
    ? piAdapter().abortRun(input)
    : agentHost.abortRun({ ...backendKey(input), runId: input.runId });
  runtime.inspectRemovableSession = (input) => usePi(input)
    ? piOnly.inspectRemovableSession(input)
    : Promise.reject(unsupported("session removal", input.backendId));
  runtime.removeValidatedSession = (input) => usePi(input)
    ? piOnly.removeValidatedSession(input)
    : Promise.reject(unsupported("session removal", input.backendId));
  runtime.prepareImage = (input) => usePi(input)
    ? piOnly.prepareImage(input)
    : Promise.reject(unsupported("images", input.backendId));
  runtime.removePreparedImage = (input) => usePi(input)
    ? piOnly.removePreparedImage(input)
    : Promise.reject(unsupported("images", input.backendId));
  runtime.setSessionModel = (input) => {
    if (usePi(input)) return piOnly.setSessionModel(input);
    if (input.provider !== sessionBackendId(input)) {
      return Promise.reject(unsupported("model selection", input.backendId));
    }
    return agentHost.setModel({ ...backendKey(input), modelId: input.id }).then(rememberAgentSnapshot);
  };
  runtime.setThinkingLevel = (input) => usePi(input)
    ? piOnly.setThinkingLevel(input)
    : agentHost.setReasoning({ ...backendKey(input), reasoningId: input.level }).then(rememberAgentSnapshot);
  runtime.setFastMode = (input) => usePi(input)
    ? Promise.reject(unsupported("Fast mode", input.backendId))
    : agentHost.setFastMode({ ...backendKey(input), enabled: input.enabled }).then(rememberAgentSnapshot);
  runtime.setSessionMode = (input) => usePi(input)
    ? piOnly.setSessionMode(input)
    : Promise.reject(unsupported("Plan/Agent mode", input.backendId));
  runtime.setSessionApprovalMode = (input) => usePi(input)
    ? piOnly.setSessionApprovalMode(input)
    : input.mode === "ask"
      ? runtime.getSessionSnapshot(input)
      : Promise.reject(unsupported("approval mode", input.backendId));
  runtime.updateSessionPlanDocument = (input) => usePi(input)
    ? piOnly.updateSessionPlanDocument(input)
    : Promise.reject(unsupported("plan documents", input.backendId));
  runtime.executeSessionPlan = (input) => usePi(input)
    ? piOnly.executeSessionPlan(input)
    : Promise.reject(unsupported("plan execution", input.backendId));
  runtime.updateTaskBrief = (input) => usePi(input)
    ? piOnly.updateTaskBrief(input)
    : agentHost.updateTaskBrief({
        ...backendKey(input),
        content: input.content,
        ...(input.status ? { status: input.status } : {}),
        ...(input.expectedRevision ? { expectedRevision: input.expectedRevision } : {}),
      }).then(rememberAgentSnapshot);
  runtime.resetTaskBrief = (input) => usePi(input)
    ? piOnly.resetTaskBrief(input)
    : agentHost.resetTaskBrief({
        ...backendKey(input),
        ...(input.expectedRevision ? { expectedRevision: input.expectedRevision } : {}),
      }).then(rememberAgentSnapshot);
  runtime.reopenTask = (input) => usePi(input)
    ? piOnly.reopenTask(input)
    : agentHost.reopenTask(backendKey(input)).then(rememberAgentSnapshot);
  runtime.recordOwnerVerification = (input) => usePi(input)
    ? piOnly.recordOwnerVerification(input)
    : agentHost.recordOwnerVerification({
        ...backendKey(input),
        outcome: input.outcome,
        summary: input.summary,
        ...(input.criterionId ? { criterionId: input.criterionId } : {}),
      }).then(rememberAgentSnapshot);
  runtime.acceptTaskCompletionGaps = (input) => usePi(input)
    ? piOnly.acceptTaskCompletionGaps(input)
    : agentHost.acceptTaskCompletionGaps(backendKey(input)).then(rememberAgentSnapshot);
  runtime.rewriteAssistantOutput = (input) => usePi(input)
    ? piOnly.rewriteAssistantOutput(input)
    : Promise.reject(unsupported("assistant rewrites", input.backendId));
  runtime.updateSessionContextPrompt = (input) => usePi(input)
    ? piOnly.updateSessionContextPrompt(input)
    : Promise.reject(unsupported("context prompt editing", input.backendId));
  runtime.resolveHostDialog = async (input) => {
    const pending = agentInteractions.get(input.requestId);
    if (!pending && usePi(input)) return piOnly.resolveHostDialog(input);
    if (!pending) throw unsupported("interaction", input.backendId);
    const selected = input.selected === undefined
      ? undefined
      : pending.request.kind === "approval"
        ? pending.request.options.find((option) => option.label === input.selected)?.value
        : input.selected;
    await agentHost.resolveInteraction({
      backendId: pending.event.backendId,
      scopeId: pending.event.scopeId,
      sessionId: pending.event.sessionId,
      requestId: input.requestId,
      ...(input.cancelled === true ? { cancelled: true } : {}),
      ...(selected !== undefined ? { selected } : {}),
      ...(input.answers !== undefined ? { answers: input.answers } : {}),
    });
  };
  runtime.subscribe = (listener) => {
    if (disposed) throw new Error("The Pho Code runtime is disposed.");
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  runtime.dispose = async () => {
    if (disposed) return dispose();
    disposed = true;
    rawUnsubscribe();
    agentUnsubscribe();
    listeners.clear();
    try {
      await dispose();
    } finally {
      await Promise.all([piRegistry.dispose(), agentHost.dispose()]);
    }
  };
  return runtime;
}

function projectAgentModels(snapshot: AgentBackendSessionSnapshot): ModelSummary[] {
  return snapshot.model?.available.map((model) => ({
    provider: snapshot.key.backendId,
    id: model.id,
    name: model.label,
    contextWindow: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    ...(model.supportsImages !== undefined ? { supportsImages: model.supportsImages } : {}),
  })) ?? [];
}

function projectAgentThinking(snapshot: AgentBackendSessionSnapshot): {
  current: SessionSnapshot["thinkingLevel"];
  available: SessionSnapshot["availableThinkingLevels"];
} {
  const available = snapshot.reasoning?.available
    .map((option) => normalizeThinkingLevel(option.id))
    .filter((level): level is SessionSnapshot["thinkingLevel"] => level !== undefined) ?? [];
  const current = normalizeThinkingLevel(snapshot.reasoning?.currentId) ?? available[0] ?? "off";
  return { current, available: [...new Set(available)] };
}

function normalizeThinkingLevel(value: string | undefined): SessionSnapshot["thinkingLevel"] | undefined {
  return isThinkingLevel(value) ? value : undefined;
}

function agentSummaryId(snapshot: AgentBackendSessionSnapshot): string {
  return sessionKeyId({
    backendId: snapshot.key.backendId,
    workspaceId: snapshot.key.scopeId,
    sessionId: snapshot.key.sessionId,
  });
}

function projectInteractionDialog(
  event: AgentBackendEvent & { type: "interaction_requested" },
): HostDialogRequest {
  const scope = {
    backendId: event.backendId,
    workspaceId: event.scopeId,
    sessionId: event.sessionId,
  };
  if (event.request.kind === "questionnaire") {
    return {
      ...scope,
      requestId: event.request.requestId,
      kind: "questionnaire",
      title: event.request.title,
      questions: event.request.questions,
    };
  }
  return {
    ...scope,
    requestId: event.request.requestId,
    kind: "select",
    title: event.request.title,
    ...(event.request.message ? { message: event.request.message } : {}),
    options: event.request.options.map((option) => option.label),
  };
}

function titleFromSnapshot(snapshot: AgentBackendSessionSnapshot): string | undefined {
  const text = snapshot.messages
    .find((message) => message.role === "user")
    ?.blocks.find((block) => block.type === "text")?.text.trim();
  if (!text) return undefined;
  return text.length > 48 ? `${text.slice(0, 47).trimEnd()}…` : text;
}

function previewFromSnapshot(snapshot: AgentBackendSessionSnapshot): string | undefined {
  const text = [...snapshot.messages]
    .reverse()
    .find((message) => message.role === "assistant")
    ?.blocks.filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  if (!text) return undefined;
  return text.length > 120 ? `${text.slice(0, 119).trimEnd()}…` : text;
}

function unsupported(feature: string, backendId = "backend") {
  return createHarnessError({
    code: HARNESS_ERROR_CODES.invalidCommand,
    message: `${feature} is not available for the ${backendId} backend.`,
    operation: feature,
    recoverable: true,
  });
}
