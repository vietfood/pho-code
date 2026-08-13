import { randomUUID } from "node:crypto";
import path from "node:path";
import type { FauxProviderHandle } from "@earendil-works/pi-ai";
import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionRuntime,
  AgentSessionRuntimeDiagnostic,
  CreateAgentSessionRuntimeFactory,
  SessionInfo,
} from "@earendil-works/pi-coding-agent";
import {
  ModelRuntime,
  ProjectTrustStore,
  SessionManager,
  SettingsManager,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  DefaultResourceLoader,
  getAgentDir,
  hasTrustRequiringProjectResources,
} from "@earendil-works/pi-coding-agent";
import {
  PROTOCOL_VERSION,
  RUNTIME_EVENT_TYPES,
  assertJsonSafe,
  createHarnessError,
  HARNESS_ERROR_CODES,
  idleRunState,
  isThinkingLevel,
  isWorkspaceReferenceToken,
  MAX_QUEUE_MESSAGE_PREVIEW,
  MAX_WORKSPACE_REFERENCE_QUERY,
  MAX_WORKSPACE_REFERENCES_PER_PROMPT,
  emptyQueueState,
  type AbortRunInput,
  type CredentialProviderSummary,
  type HarnessError,
  type ModelSummary,
  type PrepareImageInput,
  type PromptAdmission,
  type FeatureSnapshot,
  type ImportProviderApiKeyInput,
  type ImportProviderApiKeyResult,
  type QueueAdmission,
  type QueueFollowUpInput,
  type RemovePreparedImageInput,
  type ResolveHostDialogInput,
  type RuntimeEvent,
  type SearchWorkspaceReferencesInput,
  type SearchWorkspaceReferencesResult,
  type SendPromptInput,
  type SessionQueueState,
  type SessionSnapshot,
  type SessionSummary,
  type SetSessionModelInput,
  type SetThinkingLevelInput,
  type SteerRunInput,
  type ThinkingLevel,
  type Unsubscribe,
  type UpdatePermissionSettingsInput,
  type ContextUsageSummary,
  type SessionUsageSummary,
  type WorkspaceSnapshot,
  type WorkspaceSummary,
} from "@pho-code/protocol";
import { createExtensionHost, type ExtensionHost } from "./extension-host";
import { createDefaultFeatureManifest, emptyFeatureManifest, flattenFeatureManifest, resolvePermissionFeature, PERMISSION_FEATURE_ID, type HarnessFeatureManifest } from "./features";
import type { HarnessRuntime, InspectWorkspaceInput } from "./harness-runtime";
import { displayToolName } from "./tool-display";
import { previewText, previewToolResult, previewUnknown } from "./preview";
import { createNodeModuleResourceLocator, type ResourceLocator } from "./resource-locator";
import { projectFeatureSnapshot } from "./resources";
import { applyPermissionSettingsPatch, readPermissionSettings } from "./permission-settings";
import { importProviderApiKey as persistProviderApiKey, listStoredApiKeyProviders } from "./credentials";
import { createOsTrashRemovalService, type RecoverableRemovalService } from "./recoverable-removal";
import { createTestHostUiExtension } from "./test-host-ui";
import { trashFacilityDiagnostics, TRASH_FEATURE_ID } from "./trash-feature";
import { TRASH_TOOL_NAME } from "./trash-target";
import { createLocalRetrievalRuntime } from "./local-retrieval";
import { RETRIEVAL_FEATURE_ID } from "./retrieval-feature";
import { createWebResearchRuntime } from "./web-client";
import { projectModelSummary, modelSupportsImages } from "./model-summary";
import { createPreparedImageStore } from "./image-store";
import { createDeterministicTestProvider, createHarnessMarkTool, TEST_TOOL_NAME } from "./test-model";
import { firstUserPreview, projectMessages } from "./transcript";
import {
  collectWorkspaceReferenceTokens,
  serializeWorkspaceReferences,
  validateWorkspaceReference,
} from "./workspace-reference";
import { canonicalizeWorkspaceDirectory, displayNameForPath } from "./workspace-path";

export interface PhoCodeRuntimeOptions {
  agentDir?: string;
  appliesToSharedPiAgentDir?: boolean;
  deterministicTestModel?: boolean;
  testHostUi?: boolean;
  featureManifest?: HarnessFeatureManifest;
  resourceLocator?: ResourceLocator;
  applicationDataDir?: string;
  resourcesRoot?: string;
  removalService?: RecoverableRemovalService;
}

interface ActiveRun {
  runId: string;
  sessionId: string;
  promptDone: Promise<void>;
  abortRequested: boolean;
  settled: boolean;
  startedAt: string;
}

export async function createPhoCodeRuntime(
  options: PhoCodeRuntimeOptions = {},
): Promise<HarnessRuntime> {
  const previousAgentDirEnv = process.env.PI_CODING_AGENT_DIR;
  if (options.agentDir) {
    process.env.PI_CODING_AGENT_DIR = path.resolve(options.agentDir);
  }
  const agentDir = path.resolve(options.agentDir ?? getAgentDir());
  const trustStore = new ProjectTrustStore(agentDir);
  const approvedProjectPaths = new Set<string>();
  const listeners = new Set<(event: RuntimeEvent) => void>();
  const locator = options.resourceLocator ?? createNodeModuleResourceLocator();
  const resolvedDefault = resolvePermissionFeature(locator);
  const retrievalDataDir = path.join(options.applicationDataDir ?? agentDir, "retrieval");
  const retrieval = createLocalRetrievalRuntime({ dataDir: retrievalDataDir });
  const web = createWebResearchRuntime();
  const preparedImages = createPreparedImageStore();
  const featureManifest = withTestHostUi(
    options.featureManifest ??
      (options.deterministicTestModel
        ? emptyFeatureManifest()
        : createDefaultFeatureManifest(locator, {
            removal: options.removalService ?? createOsTrashRemovalService(),
            agentDir,
            retrieval,
            web,
            ...(options.applicationDataDir ? { applicationDataDir: options.applicationDataDir } : {}),
            ...(options.resourcesRoot ? { resourcesRoot: options.resourcesRoot } : {}),
          })),
    options.testHostUi === true,
  );
  const compositionDiagnostics = [
    ...(featureManifest.features.some((feature) => feature.id === PERMISSION_FEATURE_ID) ? resolvedDefault.diagnostics : []),
    ...(featureManifest.features.some((feature) => feature.id === TRASH_FEATURE_ID) ? trashFacilityDiagnostics() : []),
    ...(featureManifest.features.some((feature) => feature.id === RETRIEVAL_FEATURE_ID) ? retrieval.diagnostics() : []),
  ];
  const flattenedFeatures = flattenFeatureManifest(featureManifest);
  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(agentDir, "auth.json"),
    modelsPath: path.join(agentDir, "models.json"),
    refreshOnCreate: false,
    allowModelNetwork: false,
  });

  let testProvider: FauxProviderHandle | undefined;
  if (options.deterministicTestModel) {
    testProvider = createDeterministicTestProvider();
    modelRuntime.registerNativeProvider(testProvider.provider);
  }

  const testTool = options.deterministicTestModel ? createHarnessMarkTool() : undefined;

  let sequence = 0;
  let disposeCount = 0;
  let disposed = false;
  let piRuntime: AgentSessionRuntime | undefined;
  let unsubscribeSession: Unsubscribe | undefined;
  let activeWorkspace: WorkspaceSummary | undefined;
  let activeRun: ActiveRun | undefined;
  let extensionHost: ExtensionHost | undefined;
  let catalogCache:
    | {
        workspacePath: string;
        models: ModelSummary[];
        modelError?: string;
        sessions: SessionSummary[];
      }
    | undefined;

  function emit(event: Omit<RuntimeEvent, "protocolVersion" | "sequence" | "occurredAt">): void {
    sequence += 1;
    const envelope = {
      ...event,
      protocolVersion: PROTOCOL_VERSION,
      sequence,
      occurredAt: new Date().toISOString(),
    } as RuntimeEvent;
    assertJsonSafe(envelope, "runtimeEvent");
    for (const listener of [...listeners]) {
      try {
        listener(envelope);
      } catch (error) {
        console.error("Runtime event listener failed:", error);
      }
    }
  }

  function isProjectApproved(cwd: string): boolean {
    if (approvedProjectPaths.has(cwd)) {
      return true;
    }
    if (!hasTrustRequiringProjectResources(cwd)) {
      return true;
    }
    return trustStore.get(cwd) === true;
  }

  async function listModels(): Promise<{ models: ModelSummary[]; modelError?: string }> {
    if (testProvider) {
      const model = testProvider.getModel();
      return {
        models: [projectModelSummary(model)],
      };
    }

    try {
      const available = await modelRuntime.getAvailable();
      const models = available.map((model) => projectModelSummary(model));
      if (models.length === 0) {
        return {
          models,
          modelError:
            "No authenticated model is available. Import a provider API key in Settings.",
        };
      }
      return { models };
    } catch (error) {
      return {
        models: [],
        modelError: error instanceof Error ? error.message : "Unable to list models.",
      };
    }
  }

  async function listSessions(cwd: string): Promise<SessionSummary[]> {
    const infos = await SessionManager.list(cwd);
    return infos.map((info) => sessionSummaryFromInfo(cwd, info));
  }

  function workspaceSummary(cwd: string): WorkspaceSummary {
    return {
      id: cwd,
      path: cwd,
      displayName: displayNameForPath(cwd),
      lastOpenedAt: new Date().toISOString(),
      projectResourcesApproved: isProjectApproved(cwd),
    };
  }

  function clearCatalogCache(): void {
    catalogCache = undefined;
  }

  async function resolveCatalog(
    workspacePath: string,
    refreshCatalog: boolean,
  ): Promise<{ models: ModelSummary[]; modelError?: string; sessions: SessionSummary[] }> {
    if (
      !refreshCatalog &&
      catalogCache &&
      catalogCache.workspacePath === workspacePath
    ) {
      return {
        models: catalogCache.models,
        sessions: catalogCache.sessions,
        ...(catalogCache.modelError ? { modelError: catalogCache.modelError } : {}),
      };
    }
    const { models, modelError } = await listModels();
    const sessions = await listSessions(workspacePath);
    catalogCache = {
      workspacePath,
      models,
      sessions,
      ...(modelError ? { modelError } : {}),
    };
    return {
      models,
      sessions,
      ...(modelError ? { modelError } : {}),
    };
  }

  async function buildSnapshot(options: { refreshCatalog?: boolean } = {}): Promise<SessionSnapshot> {
    const refreshCatalog = options.refreshCatalog !== false;
    const session = requireSession();
    const workspace = activeWorkspace ?? workspaceSummary(session.sessionManager.getCwd());
    const { models, modelError, sessions } = await resolveCatalog(workspace.path, refreshCatalog);
    const model = session.model ? projectModelSummary(session.model) : models[0];
    const run = activeRun
      ? {
          runId: activeRun.runId,
          status: activeRun.abortRequested ? ("cancelled" as const) : ("streaming" as const),
          streamingText: "",
          work: [],
          startedAt: activeRun.startedAt,
        }
      : idleRunState();

    const thinkingLevel = projectThinkingLevel(session.thinkingLevel);
    const availableThinkingLevels = uniqueThinkingLevels(
      session.getAvailableThinkingLevels().map(projectThinkingLevel),
    );
    const { usage, contextUsage } = projectSessionUsage(session);
    const snapshot: SessionSnapshot = {
      session: {
        id: session.sessionId,
        workspaceId: workspace.id,
        title: session.sessionName?.trim() || firstUserPreview(session.messages) || "New session",
        updatedAt: new Date().toISOString(),
        ...(firstUserPreview(session.messages) ? { preview: firstUserPreview(session.messages) } : {}),
      },
      workspace,
      messages: projectMessages(session.messages),
      run: activeRun && !activeRun.settled ? { ...run, status: "streaming" } : idleRunState(),
      models,
      sessions: mergeActiveSession(sessions, {
        id: session.sessionId,
        workspaceId: workspace.id,
        title: session.sessionName?.trim() || firstUserPreview(session.messages) || "New session",
        updatedAt: new Date().toISOString(),
        ...(firstUserPreview(session.messages) ? { preview: firstUserPreview(session.messages) } : {}),
      }),
      features: withHostDiagnostics(projectFeatureSnapshot(featureManifest, session.resourceLoader, compositionDiagnostics)),
      thinkingLevel,
      availableThinkingLevels: availableThinkingLevels.length > 0 ? availableThinkingLevels : [thinkingLevel],
      supportsThinking: session.supportsThinking(),
      usage,
      queue: projectQueue(session),
      ...(contextUsage ? { contextUsage } : {}),
    };
    if (model) {
      snapshot.model = model;
    }
    if (modelError) {
      snapshot.modelError = modelError;
    }
    if (activeRun?.settled === false && session.agent.state.errorMessage) {
      snapshot.run = {
        ...snapshot.run,
        status: "failed",
        error: createHarnessError({
          code: HARNESS_ERROR_CODES.runFailed,
          message: session.agent.state.errorMessage,
          operation: "sendPrompt",
          recoverable: true,
        }),
      };
    }
    return snapshot;
  }

  function resourceLoaderOptions() {
    return {
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      additionalExtensionPaths: [...flattenedFeatures.additionalExtensionPaths],
      additionalSkillPaths: [...flattenedFeatures.additionalSkillPaths],
      additionalPromptTemplatePaths: [...flattenedFeatures.additionalPromptTemplatePaths],
      extensionFactories: [...flattenedFeatures.extensionFactories],
      ...(options.deterministicTestModel
        ? {
            systemPromptOverride: () => "You are a deterministic test assistant for Pho Code.",
          }
        : {}),
    };
  }

  async function loadWorkspaceFeatures(cwd: string): Promise<FeatureSnapshot> {
    if (piRuntime?.session && activeWorkspace?.path === cwd) {
      return withHostDiagnostics(projectFeatureSnapshot(featureManifest, piRuntime.session.resourceLoader, compositionDiagnostics));
    }
    const settingsManager = SettingsManager.create(cwd, agentDir);
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      ...resourceLoaderOptions(),
    });
    await loader.reload({
      resolveProjectTrust: async () => isProjectApproved(cwd),
    });
    return withHostDiagnostics(projectFeatureSnapshot(featureManifest, loader, compositionDiagnostics));
  }

  function withHostDiagnostics(snapshot: FeatureSnapshot): FeatureSnapshot {
    const extra = [
      ...(extensionHost?.takeDiagnostics() ?? []),
      ...(featureManifest.features.some((feature) => feature.id === RETRIEVAL_FEATURE_ID) ? retrieval.diagnostics() : []),
    ];
    if (extra.length === 0) {
      return snapshot;
    }
    return {
      ...snapshot,
      diagnostics: [...snapshot.diagnostics, ...extra],
    };
  }

  function requireSession(): AgentSession {
    const session = piRuntime?.session;
    if (!session) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.sessionNotFound,
        message: "No active session is open.",
        operation: "session",
        recoverable: true,
      });
    }
    return session;
  }

  function bindSession(): void {
    unsubscribeSession?.();
    const session = requireSession();
    unsubscribeSession = session.subscribe((event) => {
      void handleAgentEvent(event);
    });
  }

  async function bindHostUi(): Promise<void> {
    const session = requireSession();
    extensionHost?.cancelPending();
    if (!extensionHost) {
      extensionHost = createExtensionHost({
        emit,
        waitForIdle: () => requireSession().waitForIdle(),
        newSession: async () => {
          if (!piRuntime) {
            return { cancelled: true };
          }
          return piRuntime.newSession();
        },
        reload: async () => {
          await requireSession().reload();
          await bindHostUi();
        },
      });
    }
    extensionHost.beginBinding();
    try {
      await session.bindExtensions({
        uiContext: extensionHost.createUiContext(),
        mode: "rpc",
        commandContextActions: extensionHost.commandContextActions(),
        onError: (error) => {
          extensionHost?.onError(error);
        },
      });
    } finally {
      extensionHost.endBinding();
    }
  }

  async function handleAgentEvent(event: AgentSessionEvent): Promise<void> {
    const runId = activeRun?.runId;
    const sessionId = piRuntime?.session.sessionId;
    switch (event.type) {
      case "message_update": {
        if (!runId) {
          return;
        }
        if (event.assistantMessageEvent.type === "text_delta") {
          emit({
            type: RUNTIME_EVENT_TYPES.textDelta,
            sessionId,
            runId,
            payload: { runId, delta: event.assistantMessageEvent.delta ?? "" },
          });
          return;
        }
        if (event.assistantMessageEvent.type === "thinking_delta") {
          emit({
            type: RUNTIME_EVENT_TYPES.thinkingDelta,
            sessionId,
            runId,
            payload: { runId, delta: event.assistantMessageEvent.delta ?? "" },
          });
        }
        return;
      }
      case "tool_execution_start":
        if (!runId) {
          return;
        }
        emit({
          type: RUNTIME_EVENT_TYPES.toolEvent,
          sessionId,
          runId,
          payload: {
            runId,
            callId: event.toolCallId,
            name: displayToolName(event.toolName),
            status: "running",
            inputPreview: previewUnknown(event.args),
            outputPreview: "",
          },
        });
        return;
      case "tool_execution_update":
        if (!runId) {
          return;
        }
        emit({
          type: RUNTIME_EVENT_TYPES.toolEvent,
          sessionId,
          runId,
          payload: {
            runId,
            callId: event.toolCallId,
            name: displayToolName(event.toolName),
            status: "running",
            inputPreview: previewUnknown(event.args),
            outputPreview: previewToolResult(event.partialResult),
          },
        });
        return;
      case "tool_execution_end":
        if (!runId) {
          return;
        }
        emit({
          type: RUNTIME_EVENT_TYPES.toolEvent,
          sessionId,
          runId,
          payload: {
            runId,
            callId: event.toolCallId,
            name: displayToolName(event.toolName),
            status: event.isError ? "failed" : "completed",
            // End events omit args; reducer keeps the prior inputPreview.
            inputPreview: "",
            outputPreview: previewToolResult(event.result),
          },
        });
        return;
      case "queue_update": {
        if (!sessionId) {
          return;
        }
        emit({
          type: RUNTIME_EVENT_TYPES.sessionSnapshot,
          sessionId,
          runId,
          payload: await buildSnapshot({ refreshCatalog: false }),
        });
        return;
      }
      default:
        return;
    }
  }

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd,
    agentDir: runtimeAgentDir,
    sessionManager,
    sessionStartEvent,
  }) => {
    const services = await createAgentSessionServices({
      cwd,
      agentDir: runtimeAgentDir,
      modelRuntime,
      ...(options.deterministicTestModel
        ? {
            settingsManager: SettingsManager.inMemory({
              compaction: { enabled: false },
              retry: { enabled: false },
            }),
          }
        : {}),
      resourceLoaderOptions: resourceLoaderOptions(),
      resourceLoaderReloadOptions: {
        resolveProjectTrust: async () => isProjectApproved(cwd),
      },
    });
    return {
      ...(await createAgentSessionFromServices({
        services,
        sessionManager,
        sessionStartEvent,
        ...(testProvider ? { model: testProvider.getModel(), thinkingLevel: "off" } : {}),
        ...(testTool
          ? {
              customTools: [testTool],
              tools: [TEST_TOOL_NAME, "bash", TRASH_TOOL_NAME, "read", "write", "edit", "ls", "grep", "find"],
            }
          : {}),
      })),
      services,
      diagnostics: services.diagnostics,
    };
  };

  async function replaceRuntime(next: AgentSessionRuntime, workspace: WorkspaceSummary): Promise<void> {
    unsubscribeSession?.();
    unsubscribeSession = undefined;
    if (piRuntime && piRuntime !== next) {
      await piRuntime.dispose();
    }
    piRuntime = next;
    activeWorkspace = workspace;
    await retrieval.bind(workspace.path);
    activeRun = undefined;
    preparedImages.clear();
    clearCatalogCache();
    reportDiagnostics(next.diagnostics);
    next.setBeforeSessionInvalidate(() => {
      unsubscribeSession?.();
      unsubscribeSession = undefined;
    });
    next.setRebindSession(async () => {
      bindSession();
      await bindHostUi();
    });
    bindSession();
    await bindHostUi();
  }

  async function finishRun(run: ActiveRun, error?: unknown): Promise<void> {
    if (run.settled || activeRun?.runId !== run.runId) {
      return;
    }
    run.settled = true;
    activeRun = undefined;
    const snapshot = await buildSnapshot();
    if (error) {
      const harnessError = toHarnessError(error, "sendPrompt", HARNESS_ERROR_CODES.runFailed);
      snapshot.run = {
        ...snapshot.run,
        runId: run.runId,
        status: "failed",
        error: harnessError,
      };
      emit({
        type: RUNTIME_EVENT_TYPES.runFailed,
        sessionId: run.sessionId,
        runId: run.runId,
        payload: { runId: run.runId, error: harnessError },
      });
      emit({
        type: RUNTIME_EVENT_TYPES.sessionSnapshot,
        sessionId: run.sessionId,
        runId: run.runId,
        payload: snapshot,
      });
      return;
    }

    const failedMessage = piRuntime?.session.agent.state.errorMessage;
    if (run.abortRequested) {
      snapshot.run = { ...idleRunState(), runId: run.runId, status: "cancelled" };
    } else if (failedMessage) {
      const harnessError = createHarnessError({
        code: HARNESS_ERROR_CODES.runFailed,
        message: failedMessage,
        operation: "sendPrompt",
        recoverable: true,
      });
      snapshot.run = {
        ...idleRunState(),
        runId: run.runId,
        status: "failed",
        error: harnessError,
      };
      emit({
        type: RUNTIME_EVENT_TYPES.runFailed,
        sessionId: run.sessionId,
        runId: run.runId,
        payload: { runId: run.runId, error: harnessError },
      });
    } else {
      snapshot.run = { ...idleRunState(), runId: run.runId, status: "settled" };
    }
    emit({
      type: RUNTIME_EVENT_TYPES.runSettled,
      sessionId: run.sessionId,
      runId: run.runId,
      payload: snapshot,
    });
  }

  const runtime: HarnessRuntime = {
    get disposeCount() {
      return disposeCount;
    },
    getCapabilities() {
      return { piRuntime: true };
    },
    getAgentDir() {
      return agentDir;
    },
    async inspectWorkspace(input: InspectWorkspaceInput) {
      assertNotDisposed();
      const cwd = await canonicalizeWorkspaceDirectory(input.path, "inspectWorkspace");
      if (input.approveProjectResources) {
        approvedProjectPaths.add(cwd);
      }
      activeWorkspace = workspaceSummary(cwd);
      await retrieval.bind(cwd);
      const { models, modelError } = await listModels();
      const features = await loadWorkspaceFeatures(cwd);
      const snapshot: WorkspaceSnapshot = {
        workspace: workspaceSummary(cwd),
        sessions: await listSessions(cwd),
        models,
        features,
      };
      if (modelError) {
        snapshot.modelError = modelError;
      }
      return snapshot;
    },
    async listWorkspaceSessions(workspaceId: string) {
      assertNotDisposed();
      const cwd = await canonicalizeWorkspaceDirectory(workspaceId, "listWorkspaceSessions");
      const sessions = await listSessions(cwd);
      if (piRuntime?.session && (activeWorkspace?.path === cwd || piRuntime.cwd === cwd)) {
        const session = piRuntime.session;
        return mergeActiveSession(sessions, {
          id: session.sessionId,
          workspaceId: cwd,
          title: session.sessionName?.trim() || firstUserPreview(session.messages) || "New session",
          updatedAt: new Date().toISOString(),
          ...(firstUserPreview(session.messages) ? { preview: firstUserPreview(session.messages) } : {}),
        });
      }
      return sessions;
    },
    async createSession(workspaceId: string) {
      assertNotDisposed();
      const cwd = await canonicalizeWorkspaceDirectory(workspaceId, "createSession");
      const workspace = workspaceSummary(cwd);
      if (piRuntime && piRuntime.cwd === cwd) {
        const result = await piRuntime.newSession();
        if (result.cancelled) {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.sessionBusy,
            message: "Session replacement was cancelled.",
            operation: "createSession",
            recoverable: true,
          });
        }
        bindSession();
        await bindHostUi();
      } else {
        const next = await createAgentSessionRuntime(createRuntime, {
          cwd,
          agentDir,
          sessionManager: SessionManager.create(cwd),
        });
        await replaceRuntime(next, workspace);
      }
      preparedImages.clear();
      activeWorkspace = workspace;
      const snapshot = await buildSnapshot();
      emit({
        type: RUNTIME_EVENT_TYPES.sessionSnapshot,
        sessionId: snapshot.session.id,
        payload: snapshot,
      });
      return snapshot;
    },
    async openSession(workspaceId: string, sessionId: string) {
      assertNotDisposed();
      const cwd = await canonicalizeWorkspaceDirectory(workspaceId, "openSession");
      const workspace = workspaceSummary(cwd);
      const sessions = await listSessions(cwd);
      const listed = sessions.find((session) => session.id === sessionId);
      const infos = await SessionManager.list(cwd);
      const info = infos.find((entry) => entry.id === sessionId);
      if (!info || !listed) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionNotFound,
          message: "The selected session was not found.",
          operation: "openSession",
          recoverable: true,
          details: { sessionId },
        });
      }

      if (piRuntime && piRuntime.cwd === cwd) {
        const result = await piRuntime.switchSession(info.path);
        if (result.cancelled) {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.sessionBusy,
            message: "Session replacement was cancelled.",
            operation: "openSession",
            recoverable: true,
          });
        }
        bindSession();
        await bindHostUi();
      } else {
        const next = await createAgentSessionRuntime(createRuntime, {
          cwd,
          agentDir,
          sessionManager: SessionManager.open(info.path),
        });
        await replaceRuntime(next, workspace);
      }
      preparedImages.clear();
      activeWorkspace = workspace;
      const snapshot = await buildSnapshot();
      emit({
        type: RUNTIME_EVENT_TYPES.sessionSnapshot,
        sessionId: snapshot.session.id,
        payload: snapshot,
      });
      return snapshot;
    },
    async sendPrompt(input: SendPromptInput) {
      assertNotDisposed();
      const session = requireSession();
      if (input.sessionId !== session.sessionId) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionNotFound,
          message: "The prompt target is not the active session.",
          operation: "sendPrompt",
          recoverable: true,
        });
      }
      if (activeRun && !activeRun.settled) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionBusy,
          message: "The session is already running a prompt.",
          operation: "sendPrompt",
          recoverable: true,
        });
      }
      const { models, modelError } = await listModels();
      if (!session.model && models.length === 0) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.noAuthenticatedModel,
          message: modelError ?? "No authenticated model is available.",
          operation: "sendPrompt",
          recoverable: true,
        });
      }

      const promptText = await resolvePromptText(input, "sendPrompt");
      const images = takePreparedImages(input.imageIds, "sendPrompt");
      if (promptText.trim() === "" && images.length === 0) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "A prompt, workspace reference, or image is required.",
          operation: "sendPrompt",
          recoverable: true,
        });
      }
      if (images.length > 0 && !modelSupportsImages(session.model)) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.imagesUnsupported,
          message: "The selected model does not accept images.",
          operation: "sendPrompt",
          recoverable: true,
        });
      }

      const runId = randomUUID();
      let admitted = false;
      let resolvePreflight: (value: boolean) => void = () => undefined;
      const preflight = new Promise<boolean>((resolve) => {
        resolvePreflight = resolve;
      });

      const run: ActiveRun = {
        runId,
        sessionId: session.sessionId,
        promptDone: Promise.resolve(),
        abortRequested: false,
        settled: false,
        startedAt: new Date().toISOString(),
      };
      activeRun = run;

      const promptDone = session.prompt(promptText, {
        source: "interactive",
        ...(images.length > 0 ? { images: images.map((record) => record.content) } : {}),
        preflightResult: (success) => {
          admitted = success;
          if (!success) {
            run.settled = true;
            if (activeRun === run) {
              activeRun = undefined;
            }
          }
          resolvePreflight(success);
        },
      });
      run.promptDone = promptDone;

      void promptDone.then(
        () => finishRun(run),
        (error: unknown) => {
          if (run.settled && !admitted) {
            return;
          }
          if (run.abortRequested) {
            return finishRun(run);
          }
          return finishRun(run, error);
        },
      );

      admitted = await preflight;
      if (!admitted) {
        await promptDone.catch(() => undefined);
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.promptRejected,
          message: "The prompt was rejected before admission.",
          operation: "sendPrompt",
          recoverable: true,
          details: { sessionId: session.sessionId, runId },
        });
      }
      forgetPreparedImages(input.imageIds);

      const admission: PromptAdmission = {
        sessionId: session.sessionId,
        runId,
        admitted: true,
      };
      emit({
        type: RUNTIME_EVENT_TYPES.sessionSnapshot,
        sessionId: session.sessionId,
        runId,
        payload: await buildSnapshot(),
      });
      emit({
        type: RUNTIME_EVENT_TYPES.runAdmitted,
        sessionId: session.sessionId,
        runId,
        payload: admission,
      });
      return admission;
    },
    async steerRun(input: SteerRunInput) {
      return enqueueDuringRun(input, "steerRun", async (session, text, images) => {
        await session.steer(text, images.length > 0 ? images : undefined);
      });
    },
    async queueFollowUp(input: QueueFollowUpInput) {
      return enqueueDuringRun(input, "queueFollowUp", async (session, text, images) => {
        await session.followUp(text, images.length > 0 ? images : undefined);
      });
    },
    async prepareImage(input: PrepareImageInput) {
      assertNotDisposed();
      requireSession();
      const summary = preparedImages.add(input, "prepareImage");
      assertJsonSafe(summary, "prepareImage");
      return summary;
    },
    async removePreparedImage(input: RemovePreparedImageInput) {
      assertNotDisposed();
      const imageId = typeof input.imageId === "string" ? input.imageId.trim() : "";
      if (imageId.length === 0) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidImage,
          message: "An image id is required.",
          operation: "removePreparedImage",
          recoverable: true,
        });
      }
      preparedImages.remove(imageId);
    },
    async abortRun(input: AbortRunInput) {
      assertNotDisposed();
      const session = requireSession();
      if (input.sessionId !== session.sessionId) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionNotFound,
          message: "The abort target is not the active session.",
          operation: "abortRun",
          recoverable: true,
        });
      }
      if (!activeRun || activeRun.runId !== input.runId) {
        return;
      }
      activeRun.abortRequested = true;
      session.clearQueue();
      await session.abort();
      await activeRun.promptDone.catch(() => undefined);
    },
    async setSessionModel(input: SetSessionModelInput) {
      assertNotDisposed();
      const session = requireSession();
      if (input.sessionId !== session.sessionId) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionNotFound,
          message: "The model target is not the active session.",
          operation: "setSessionModel",
          recoverable: true,
        });
      }
      if (activeRun && !activeRun.settled) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionBusy,
          message: "Wait for the current run to finish before changing the model.",
          operation: "setSessionModel",
          recoverable: true,
        });
      }
      const model = modelRuntime.getModel(input.provider, input.id);
      if (!model) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: `Model ${input.provider}/${input.id} is not available.`,
          operation: "setSessionModel",
          recoverable: true,
        });
      }
      try {
        await session.setModel(model);
      } catch (error) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: error instanceof Error ? error.message : "Unable to set the model.",
          operation: "setSessionModel",
          recoverable: true,
        });
      }
      const snapshot = await buildSnapshot({ refreshCatalog: false });
      emit({
        type: RUNTIME_EVENT_TYPES.sessionSnapshot,
        sessionId: snapshot.session.id,
        payload: snapshot,
      });
      return snapshot;
    },
    async setThinkingLevel(input: SetThinkingLevelInput) {
      assertNotDisposed();
      const session = requireSession();
      if (input.sessionId !== session.sessionId) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionNotFound,
          message: "The thinking-level target is not the active session.",
          operation: "setThinkingLevel",
          recoverable: true,
        });
      }
      if (activeRun && !activeRun.settled) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionBusy,
          message: "Wait for the current run to finish before changing the thinking level.",
          operation: "setThinkingLevel",
          recoverable: true,
        });
      }
      if (!isThinkingLevel(input.level)) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "Unknown thinking level.",
          operation: "setThinkingLevel",
          recoverable: true,
        });
      }
      session.setThinkingLevel(input.level);
      const snapshot = await buildSnapshot({ refreshCatalog: false });
      emit({
        type: RUNTIME_EVENT_TYPES.sessionSnapshot,
        sessionId: snapshot.session.id,
        payload: snapshot,
      });
      return snapshot;
    },
    async resolveHostDialog(input: ResolveHostDialogInput) {
      assertNotDisposed();
      extensionHost?.resolveDialog(input);
    },
    getPermissionSettings() {
      assertNotDisposed();
      return currentPermissionSettings();
    },
    async updatePermissionSettings(input: UpdatePermissionSettingsInput) {
      assertNotDisposed();
      if (activeRun && !activeRun.settled) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionBusy,
          message: "Wait for the current run to finish before changing permission settings.",
          operation: "updatePermissionSettings",
          recoverable: true,
        });
      }
      const settings = applyPermissionSettingsPatch({
        agentDir,
        appliesToSharedPiAgentDir: options.appliesToSharedPiAgentDir === true,
        patch: input,
        ...(activeWorkspace?.path ? { workspacePath: activeWorkspace.path } : {}),
        yoloActive: extensionHost?.yoloActive === true,
      });
      if (!piRuntime?.session) {
        return settings;
      }
      try {
        await piRuntime.session.reload();
        await bindHostUi();
      } catch (error) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.resourceReloadFailed,
          message: "Permission settings were saved; restart required.",
          operation: "updatePermissionSettings",
          recoverable: true,
          details: {
            detail: error instanceof Error ? error.message : "reload failed",
          },
        });
      }
      const snapshot = await buildSnapshot();
      emit({
        type: RUNTIME_EVENT_TYPES.featureSnapshot,
        sessionId: snapshot.session.id,
        payload: snapshot.features,
      });
      emit({
        type: RUNTIME_EVENT_TYPES.sessionSnapshot,
        sessionId: snapshot.session.id,
        payload: snapshot,
      });
      return currentPermissionSettings();
    },
    async trustProjectPermissionRules(workspacePath: string) {
      assertNotDisposed();
      if (activeRun && !activeRun.settled) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionBusy,
          message: "Wait for the current run to finish before changing project trust.",
          operation: "trustProjectPermissionRules",
          recoverable: true,
        });
      }
      const cwd = await canonicalizeWorkspaceDirectory(workspacePath, "trustProjectPermissionRules");
      approvedProjectPaths.add(cwd);
      if (piRuntime?.session && piRuntime.cwd === cwd) {
        await piRuntime.session.reload();
        await bindHostUi();
        activeWorkspace = workspaceSummary(cwd);
        const snapshot = await buildSnapshot();
        emit({
          type: RUNTIME_EVENT_TYPES.featureSnapshot,
          sessionId: snapshot.session.id,
          payload: snapshot.features,
        });
        emit({
          type: RUNTIME_EVENT_TYPES.sessionSnapshot,
          sessionId: snapshot.session.id,
          payload: snapshot,
        });
      }
      return currentPermissionSettings();
    },
    async listCredentialProviders(): Promise<CredentialProviderSummary[]> {
      assertNotDisposed();
      return listStoredApiKeyProviders(modelRuntime);
    },
    async importProviderApiKey(input: ImportProviderApiKeyInput): Promise<ImportProviderApiKeyResult> {
      assertNotDisposed();
      if (activeRun && !activeRun.settled) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionBusy,
          message: "Wait for the current run to finish before importing an API key.",
          operation: "importProviderApiKey",
          recoverable: true,
        });
      }
      const providers = await persistProviderApiKey(modelRuntime, input);
      if (piRuntime?.session) {
        const snapshot = await buildSnapshot();
        emit({
          type: RUNTIME_EVENT_TYPES.sessionSnapshot,
          sessionId: snapshot.session.id,
          payload: snapshot,
        });
      }
      return { providers };
    },
    async searchWorkspaceReferences(input: SearchWorkspaceReferencesInput): Promise<SearchWorkspaceReferencesResult> {
      assertNotDisposed();
      if (!activeWorkspace) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.workspaceNotSelected,
          message: "Select a workspace before searching files.",
          operation: "searchWorkspaceReferences",
          recoverable: true,
        });
      }
      const query = typeof input.query === "string" ? input.query.slice(0, MAX_WORKSPACE_REFERENCE_QUERY) : "";
      const result = await retrieval.searchPaths({
        query,
        ...(input.kinds ? { kinds: input.kinds } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
      });
      assertJsonSafe(result, "searchWorkspaceReferences");
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      disposeCount += 1;
      clearCatalogCache();
      extensionHost?.cancelPending();
      if (activeRun) {
        activeRun.abortRequested = true;
        try {
          await piRuntime?.session.abort();
          await activeRun.promptDone.catch(() => undefined);
        } catch {
          // Best-effort abort during shutdown.
        }
      }
      unsubscribeSession?.();
      unsubscribeSession = undefined;
      extensionHost?.dispose();
      extensionHost = undefined;
      listeners.clear();
      try {
        await piRuntime?.services.settingsManager.flush();
      } catch (error) {
        console.error("Failed to flush Pi settings during dispose:", error);
      }
      try {
        await piRuntime?.dispose();
      } finally {
        await retrieval.dispose();
        await web.dispose();
        preparedImages.clear();
        piRuntime = undefined;
        activeRun = undefined;
        restoreAgentDirEnv(previousAgentDirEnv, options.agentDir);
      }
    },
  };

  function currentPermissionSettings() {
    const settings = readPermissionSettings({
      agentDir,
      appliesToSharedPiAgentDir: options.appliesToSharedPiAgentDir === true,
      ...(activeWorkspace?.path ? { workspacePath: activeWorkspace.path } : {}),
      yoloActive: extensionHost?.yoloActive === true,
    });
    return {
      ...settings,
      projectPermissionRulesTrusted: activeWorkspace?.path
        ? isProjectApproved(activeWorkspace.path)
        : false,
    };
  }

  function assertNotDisposed(): void {
    if (disposed) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.shuttingDown,
        message: "The runtime is disposed.",
        operation: "runtime",
      });
    }
  }

  async function resolvePromptText(
    input: { text?: string; references?: SendPromptInput["references"] },
    operation: string,
  ): Promise<string> {
    const text = typeof input.text === "string" ? input.text : "";
    const explicit = [];
    for (const token of input.references ?? []) {
      if (!isWorkspaceReferenceToken(token)) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidWorkspaceReference,
          message: "Each workspace reference must include a relative path.",
          operation,
          recoverable: true,
        });
      }
      explicit.push({
        path: token.path.trim(),
        ...(token.kind ? { kind: token.kind } : {}),
      });
    }
    const references = collectWorkspaceReferenceTokens(text, explicit);
    if (references.length > MAX_WORKSPACE_REFERENCES_PER_PROMPT) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.invalidWorkspaceReference,
        message: `A prompt can include at most ${MAX_WORKSPACE_REFERENCES_PER_PROMPT} workspace references.`,
        operation,
        recoverable: true,
      });
    }
    if (references.length === 0) {
      return text;
    }
    const workspacePath = activeWorkspace?.path ?? piRuntime?.cwd;
    if (!workspacePath) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.workspaceNotSelected,
        message: "Select a workspace before attaching file references.",
        operation,
        recoverable: true,
      });
    }
    const validated = [];
    for (const token of references) {
      validated.push(await validateWorkspaceReference(token, workspacePath));
    }
    return serializeWorkspaceReferences(text, validated);
  }

  function takePreparedImages(imageIds: readonly string[] | undefined, operation: string) {
    if (!imageIds || imageIds.length === 0) {
      return [];
    }
    return preparedImages.lookup(imageIds, operation);
  }

  function forgetPreparedImages(imageIds: readonly string[] | undefined): void {
    if (!imageIds || imageIds.length === 0) {
      return;
    }
    preparedImages.forget(imageIds);
  }

  async function enqueueDuringRun(
    input: SteerRunInput | QueueFollowUpInput,
    operation: "steerRun" | "queueFollowUp",
    enqueue: (
      session: AgentSession,
      text: string,
      images: Array<{ type: "image"; data: string; mimeType: string }>,
    ) => Promise<void>,
  ): Promise<QueueAdmission> {
    assertNotDisposed();
    const session = requireSession();
    if (input.sessionId !== session.sessionId) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.sessionNotFound,
        message: "The queue target is not the active session.",
        operation,
        recoverable: true,
      });
    }
    if (!activeRun || activeRun.settled || activeRun.runId !== input.runId) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.invalidCommand,
        message: operation === "steerRun" ? "Steer requires the current run." : "A follow-up requires the current run.",
        operation,
        recoverable: true,
      });
    }
    const promptText = await resolvePromptText(input, operation);
    const records = takePreparedImages(input.imageIds, operation);
    if (promptText.trim() === "" && records.length === 0) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.invalidCommand,
        message: "A prompt, workspace reference, or image is required.",
        operation,
        recoverable: true,
      });
    }
    if (records.length > 0 && !modelSupportsImages(session.model)) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.imagesUnsupported,
        message: "The selected model does not accept images.",
        operation,
        recoverable: true,
      });
    }
    try {
      await enqueue(
        session,
        promptText,
        records.map((record) => record.content),
      );
    } catch (error) {
      throw toHarnessError(error, operation, HARNESS_ERROR_CODES.promptRejected);
    }
    forgetPreparedImages(input.imageIds);
    const snapshot = await buildSnapshot({ refreshCatalog: false });
    emit({
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      sessionId: session.sessionId,
      runId: activeRun.runId,
      payload: snapshot,
    });
    const admission: QueueAdmission = {
      sessionId: session.sessionId,
      runId: activeRun.runId,
      admitted: true,
      queue: snapshot.queue ?? emptyQueueState(),
    };
    assertJsonSafe(admission, operation);
    return admission;
  }

  return runtime;
}

function withTestHostUi(manifest: HarnessFeatureManifest, enabled: boolean): HarnessFeatureManifest {
  if (!enabled) {
    return manifest;
  }
  return {
    features: [
      ...manifest.features,
      {
        id: "harness-host-ui",
        version: "test",
        extensionFactories: [createTestHostUiExtension()],
        expected: { extensions: 1 },
      },
    ],
  };
}

function mergeActiveSession(
  sessions: SessionSummary[],
  active: SessionSummary,
): SessionSummary[] {
  if (sessions.some((session) => session.id === active.id)) {
    return sessions.map((session) => (session.id === active.id ? { ...session, ...active } : session));
  }
  return [active, ...sessions];
}

function sessionSummaryFromInfo(workspaceId: string, info: SessionInfo): SessionSummary {
  const preview = info.firstMessage.trim();
  return {
    id: info.id,
    workspaceId,
    title: info.name?.trim() || previewText(preview) || "New session",
    updatedAt: info.modified.toISOString(),
    ...(preview ? { preview: previewText(preview) } : {}),
  };
}

function projectQueue(session: AgentSession): SessionQueueState {
  return {
    steering: session.getSteeringMessages().map((text) => ({ text: previewQueueMessage(text) })),
    followUp: session.getFollowUpMessages().map((text) => ({ text: previewQueueMessage(text) })),
    steeringMode: session.steeringMode,
    followUpMode: session.followUpMode,
  };
}

function previewQueueMessage(text: string): string {
  const compact = text.trim().replace(/\s+/gu, " ");
  if (compact.length <= MAX_QUEUE_MESSAGE_PREVIEW) {
    return compact;
  }
  return `${compact.slice(0, MAX_QUEUE_MESSAGE_PREVIEW)}…`;
}

function restoreAgentDirEnv(previous: string | undefined, override: string | undefined): void {
  if (!override) {
    return;
  }
  if (previous === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
    return;
  }
  process.env.PI_CODING_AGENT_DIR = previous;
}

function reportDiagnostics(diagnostics: readonly AgentSessionRuntimeDiagnostic[]): void {
  for (const diagnostic of diagnostics) {
    switch (diagnostic.type) {
      case "error":
        console.error("Pi runtime diagnostic:", diagnostic.message);
        break;
      case "warning":
        console.warn("Pi runtime diagnostic:", diagnostic.message);
        break;
      case "info":
        break;
      default: {
        const exhaustive: never = diagnostic.type;
        void exhaustive;
      }
    }
  }
}

function toHarnessError(error: unknown, operation: string, code: string): HarnessError {
  if (error && typeof error === "object" && "code" in error && "message" in error && "recoverable" in error) {
    return error as HarnessError;
  }
  return createHarnessError({
    code,
    message: error instanceof Error ? error.message : "The operation failed.",
    operation,
    recoverable: true,
  });
}

function projectSessionUsage(session: AgentSession): {
  usage: SessionUsageSummary;
  contextUsage?: ContextUsageSummary;
} {
  const stats = session.getSessionStats();
  const context = stats.contextUsage ?? session.getContextUsage();
  return {
    usage: {
      input: stats.tokens.input,
      output: stats.tokens.output,
      cacheRead: stats.tokens.cacheRead,
      cacheWrite: stats.tokens.cacheWrite,
      total: stats.tokens.total,
      costUsd: stats.cost,
    },
    ...(context
      ? {
          contextUsage: {
            tokens: context.tokens,
            contextWindow: context.contextWindow,
            percent: context.percent,
          },
        }
      : {}),
  };
}

function projectThinkingLevel(value: string): ThinkingLevel {
  return isThinkingLevel(value) ? value : "off";
}

function uniqueThinkingLevels(levels: readonly ThinkingLevel[]): ThinkingLevel[] {
  const seen = new Set<ThinkingLevel>();
  const result: ThinkingLevel[] = [];
  for (const level of levels) {
    if (!seen.has(level)) {
      seen.add(level);
      result.push(level);
    }
  }
  return result;
}
