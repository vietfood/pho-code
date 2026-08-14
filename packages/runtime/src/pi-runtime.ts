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
  isProviderAuthMethod,
  isThinkingLevel,
  isWorkspaceReferenceToken,
  MAX_ASSISTANT_REWRITE_CHARS,
  MAX_QUEUE_MESSAGE_PREVIEW,
  MAX_WORKSPACE_REFERENCE_QUERY,
  MAX_WORKSPACE_REFERENCES_PER_PROMPT,
  emptyQueueState,
  GITHUB_MCP_FEATURE_ID,
  isExternalSkillSourceId,
  requireMatchingSessionKey,
  sessionActivityPhase,
  type AbortRunInput,
  type CancelProviderLoginInput,
  type CredentialProviderSummary,
  type HarnessError,
  type ImportProviderApiKeyInput,
  type ImportProviderApiKeyResult,
  type LogoutProviderInput,
  type ModelSummary,
  type OpenProviderAuthLinkInput,
  type PrepareImageInput,
  type PromptAdmission,
  type FeatureSnapshot,
  type HostDialogRequest,
  type ExtensionDialogSettledPayload,
  type ProviderAccountsResult,
  type ProviderAuthFlowSnapshot,
  type QueueAdmission,
  type QueueFollowUpInput,
  type RemovePreparedImageInput,
  type ResolveHostDialogInput,
  type RespondProviderAuthPromptInput,
  type RewriteAssistantOutputInput,
  type RuntimeEvent,
  type SearchWorkspaceReferencesInput,
  type SearchWorkspaceReferencesResult,
  type SendPromptInput,
  type SessionQueueState,
  type SessionSnapshot,
  type SessionSummary,
  type SessionKey,
  type SessionActivitySummary,
  type SetSessionModelInput,
  type SetThinkingLevelInput,
  type StartProviderLoginInput,
  type SteerRunInput,
  type ThinkingLevel,
  type Unsubscribe,
  type UpdatePermissionSettingsInput,
  type UpdateGitHubMcpSettingsInput,
  type ImportGitHubPatInput,
  type ContextUsageSummary,
  type SessionUsageSummary,
  type WorkspaceSnapshot,
  type WorkspaceSummary,
} from "@pho-code/protocol";
import { createExtensionHost, type ExtensionHost } from "./extension-host";
import { applyCursorSdkHarnessPolicy, registerCursorProviderAccount } from "./cursor-sdk-policy";
import {
  createDefaultFeatureManifest,
  emptyFeatureManifest,
  flattenFeatureManifest,
  resolveCursorSdkFeature,
  resolvePermissionFeature,
  CURSOR_SDK_FEATURE_ID,
  PERMISSION_FEATURE_ID,
  type HarnessFeatureManifest,
} from "./features";
import type {
  HarnessRuntime,
  InspectWorkspaceInput,
  RemovableSessionInspection,
  RemovedSessionResult,
} from "./harness-runtime";
import { validateSessionArtifact } from "./session-artifact";
import { displayToolName } from "./tool-display";
import { previewText, previewToolResult, previewUnknown } from "./preview";
import { createNodeModuleResourceLocator, type ResourceLocator } from "./resource-locator";
import { projectFeatureSnapshot } from "./resources";
import { applyPermissionSettingsPatch, readPermissionSettings } from "./permission-settings";
import { importProviderApiKey as persistProviderApiKey, listProviderAccounts, listStoredApiKeyProviders, logoutProviderAccount } from "./credentials";
import { assertNoCanaries, createProviderAuthFlow } from "./provider-auth-flow";
import { createOsTrashRemovalService, type RecoverableRemovalService } from "./recoverable-removal";
import { createTestHostUiExtension } from "./test-host-ui";
import { createTestOAuthProvider } from "./test-oauth";
import { trashFacilityDiagnostics, TRASH_FEATURE_ID } from "./trash-feature";
import { TRASH_TOOL_NAME } from "./trash-target";
import { createLocalRetrievalRuntime } from "./local-retrieval";
import { RETRIEVAL_FEATURE_ID } from "./retrieval-feature";
import { createWebResearchRuntime } from "./web-client";
import { createSkillSourceRegistry } from "./skill-source";
import { createSkillInvokeFeature, SKILL_INVOKE_FEATURE_ID } from "./skill-invoke";
import { resolveCuratedSkillsRoot } from "./skills-feature";
import { createGitHubMcpFeature } from "./github-mcp-feature";
import { createGitHubMcpRuntime } from "./github-mcp-runtime";
import { createOsSecretStore, type SecretStore } from "./secret-store";
import { projectModelSummary, modelSupportsImages } from "./model-summary";
import { createPreparedImageStore } from "./image-store";
import {
  createSessionRegistry,
} from "./session-registry";
import { createDeterministicTestProvider, createHarnessMarkTool, TEST_TOOL_NAME } from "./test-model";
import { firstUserPreview, projectMessages } from "./transcript";
import {
  applyRewriteOverlays,
  ASSISTANT_REWRITE_CUSTOM_TYPE,
  collectRewriteOverlays,
  joinedText,
  originalJoinedText,
} from "./assistant-rewrite";
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
  testOAuthFlow?: boolean;
  openValidatedAuthUrl?: (url: string) => void;
  featureManifest?: HarnessFeatureManifest;
  resourceLocator?: ResourceLocator;
  applicationDataDir?: string;
  resourcesRoot?: string;
  removalService?: RecoverableRemovalService;
  enabledSkillSources?: readonly string[];
  githubMcpEnabled?: boolean;
  githubMcpAccountLogin?: string;
  githubMcpServerPath?: string;
  githubMcpLaunch?: (token: string) => { command: string; args: readonly string[] };
  secretStore?: SecretStore;
}

interface ActiveRun {
  runId: string;
  sessionId: string;
  promptDone: Promise<void>;
  abortRequested: boolean;
  settled: boolean;
  startedAt: string;
}

interface LiveSession {
  key: SessionKey;
  runtime: AgentSessionRuntime;
  workspace: WorkspaceSummary;
  preparedImages: ReturnType<typeof createPreparedImageStore>;
  generation: number;
  selectedAt: number;
  disposing: boolean;
  activeRun?: ActiveRun;
  unsubscribe?: Unsubscribe;
  extensionHost?: ExtensionHost;
}

function liveSessionProtected(session: LiveSession): boolean {
  if (session.disposing) {
    return true;
  }
  if (session.activeRun && !session.activeRun.settled) {
    return true;
  }
  if (session.extensionHost?.hasPendingDialog()) {
    return true;
  }
  if (session.preparedImages.size() > 0) {
    return true;
  }
  const piSession = session.runtime.session;
  if (piSession.getSteeringMessages().length > 0 || piSession.getFollowUpMessages().length > 0) {
    return true;
  }
  return false;
}

export async function createPhoCodeRuntime(
  options: PhoCodeRuntimeOptions = {},
): Promise<HarnessRuntime> {
  applyCursorSdkHarnessPolicy();
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
  const resolvedCursorSdk = resolveCursorSdkFeature(locator);
  const retrievalDataDir = path.join(options.applicationDataDir ?? agentDir, "retrieval");
  const retrieval = createLocalRetrievalRuntime({ dataDir: retrievalDataDir });
  const web = createWebResearchRuntime();
  const removalService = options.removalService ?? createOsTrashRemovalService();
  const skillSources = createSkillSourceRegistry({
    phoCodeSkillsRoot: resolveCuratedSkillsRoot(options.resourcesRoot),
    enabledExternalSources: options.enabledSkillSources,
  });
  const githubMcp = createGitHubMcpRuntime({
    secretStore: options.secretStore ?? createOsSecretStore(),
    enabled: options.githubMcpEnabled === true,
    ...(options.githubMcpAccountLogin ? { accountLogin: options.githubMcpAccountLogin } : {}),
    ...(options.resourcesRoot ? { resourcesRoot: options.resourcesRoot } : {}),
    ...(options.githubMcpServerPath ? { serverPath: options.githubMcpServerPath } : {}),
    ...(options.githubMcpLaunch ? { launch: options.githubMcpLaunch } : {}),
  });
  await githubMcp.startIfEnabled();
  const baseManifest = withTestHostUi(
    options.featureManifest ??
      (options.deterministicTestModel
        ? emptyFeatureManifest()
        : createDefaultFeatureManifest(locator, {
            removal: removalService,
            agentDir,
            retrieval,
            web,
            ...(options.applicationDataDir ? { applicationDataDir: options.applicationDataDir } : {}),
            ...(options.resourcesRoot ? { resourcesRoot: options.resourcesRoot } : {}),
          })),
    options.testHostUi === true,
  );
  const featureManifest = options.deterministicTestModel
    ? baseManifest
    : {
        features: [
          ...baseManifest.features.filter(
            (feature) => feature.id !== SKILL_INVOKE_FEATURE_ID && feature.id !== GITHUB_MCP_FEATURE_ID,
          ),
          createSkillInvokeFeature(skillSources),
          createGitHubMcpFeature(githubMcp),
        ],
      };
  const compositionDiagnostics = [
    ...(featureManifest.features.some((feature) => feature.id === PERMISSION_FEATURE_ID) ? resolvedDefault.diagnostics : []),
    ...(featureManifest.features.some((feature) => feature.id === CURSOR_SDK_FEATURE_ID)
      ? resolvedCursorSdk.diagnostics
      : []),
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
  if (options.testOAuthFlow) {
    modelRuntime.registerNativeProvider(createTestOAuthProvider());
  }

  if (featureManifest.features.some((feature) => feature.id === CURSOR_SDK_FEATURE_ID && (feature.extensionPaths?.length ?? 0) > 0)) {
    registerCursorProviderAccount(modelRuntime);
  }

  const testTool = options.deterministicTestModel ? createHarnessMarkTool() : undefined;

  let sequence = 0;
  let disposeCount = 0;
  let disposed = false;
  let selected: LiveSession | undefined;
  let lastWorkspace: WorkspaceSummary | undefined;
  let generation = 0;
  let catalogCache:
    | {
        workspacePath: string;
        models: ModelSummary[];
        modelError?: string;
        sessions: SessionSummary[];
      }
    | undefined;

  const registry = createSessionRegistry<LiveSession>({
    async openController(key) {
      return instantiateSession(key.workspaceId, key.sessionId);
    },
    async createController(workspaceId) {
      return instantiateSession(workspaceId);
    },
    keyOf(controller) {
      return controller.key;
    },
    isProtected: liveSessionProtected,
    lastSelectedAt(controller) {
      return controller.selectedAt;
    },
    markSelected(controller, at) {
      controller.selectedAt = at;
    },
    hasActiveRun(controller) {
      return Boolean(controller.activeRun && !controller.activeRun.settled);
    },
    async dispose(controller, reason) {
      await disposeLiveSession(controller, reason);
    },
  });

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

  function emitFor(
    session: LiveSession,
    event: Omit<RuntimeEvent, "protocolVersion" | "sequence" | "occurredAt">,
  ): void {
    emit({
      ...event,
      workspaceId: session.key.workspaceId,
      sessionId: event.sessionId ?? session.key.sessionId,
    });
  }

  function liveHasQueuedWork(session: LiveSession): boolean {
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

  function projectLiveActivity(session: LiveSession): SessionActivitySummary {
    const working = Boolean(session.activeRun && !session.activeRun.settled) || liveHasQueuedWork(session);
    const attention = session.extensionHost?.hasPendingDialog() === true;
    const updatedAt = session.activeRun?.startedAt ?? new Date().toISOString();
    const summary: SessionActivitySummary = {
      workspaceId: session.key.workspaceId,
      sessionId: session.key.sessionId,
      phase: sessionActivityPhase({ attention, working }),
      selected: selected === session,
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

  function emitActivity(): void {
    emit({
      type: RUNTIME_EVENT_TYPES.sessionActivity,
      payload: registry.list().map(projectLiveActivity),
    });
  }

  async function instantiateSession(workspaceId: string, sessionId?: string): Promise<LiveSession> {
    const cwd = await canonicalizeWorkspaceDirectory(
      workspaceId,
      sessionId ? "openSession" : "createSession",
    );
    const workspace = workspaceSummary(cwd);
    const next = sessionId
      ? await openPiRuntime(cwd, sessionId)
      : await createAgentSessionRuntime(createRuntime, {
          cwd,
          agentDir,
          sessionManager: SessionManager.create(cwd),
        });
    const key: SessionKey = { workspaceId: cwd, sessionId: next.session.sessionId };
    generation += 1;
    const live: LiveSession = {
      key,
      runtime: next,
      workspace,
      preparedImages: createPreparedImageStore(),
      generation,
      selectedAt: Date.now(),
      disposing: false,
    };
    reportDiagnostics(next.diagnostics);
    next.setBeforeSessionInvalidate(() => {
      live.unsubscribe?.();
      live.unsubscribe = undefined;
    });
    next.setRebindSession(async () => {
      bindSession(live);
      await bindHostUi(live);
    });
    bindSession(live);
    await bindHostUi(live);
    await retrieval.bind(cwd);
    return live;
  }

  async function openPiRuntime(cwd: string, sessionId: string): Promise<AgentSessionRuntime> {
    const infos = await SessionManager.list(cwd);
    const info = infos.find((entry) => entry.id === sessionId);
    if (!info) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.sessionNotFound,
        message: "The selected session was not found.",
        operation: "openSession",
        recoverable: true,
        details: { sessionId },
      });
    }
    return createAgentSessionRuntime(createRuntime, {
      cwd,
      agentDir,
      sessionManager: SessionManager.open(info.path),
    });
  }

  async function disposeLiveSession(session: LiveSession, _reason: "evicted" | "removed" | "shutdown"): Promise<void> {
    if (session.disposing) {
      return;
    }
    session.disposing = true;
    session.extensionHost?.cancelPending();
    if (session.activeRun && !session.activeRun.settled) {
      session.activeRun.abortRequested = true;
      try {
        await session.runtime.session.abort();
        await session.activeRun.promptDone.catch(() => undefined);
      } catch {
        // Best-effort abort during eviction or shutdown.
      }
    }
    session.unsubscribe?.();
    session.unsubscribe = undefined;
    session.extensionHost?.dispose();
    session.extensionHost = undefined;
    session.preparedImages.clear();
    try {
      await session.runtime.services.settingsManager.flush();
    } catch (error) {
      console.error("Failed to flush Pi settings during session dispose:", error);
    }
    await session.runtime.dispose();
    if (selected === session) {
      selected = undefined;
    }
    await releaseWorkspaceIfUnused(session.workspace.path);
  }

  function workspaceHasResidentController(workspacePath: string): boolean {
    return registry.list().some((entry) => entry.workspace.path === workspacePath);
  }

  async function releaseWorkspaceIfUnused(workspacePath: string | undefined): Promise<void> {
    if (!workspacePath) {
      return;
    }
    if (workspaceHasResidentController(workspacePath) || lastWorkspace?.path === workspacePath) {
      return;
    }
    await retrieval.unbind(workspacePath);
  }

  function locateController(sessionId: string, workspaceId: string | undefined, operation: string): LiveSession {
    if (workspaceId && workspaceId.trim() !== "") {
      const match = registry.get({ workspaceId, sessionId });
      if (!match) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionNotFound,
          message: "The target session is not open.",
          operation,
          recoverable: true,
        });
      }
      return match;
    }
    const matches = registry.list().filter((entry) => entry.key.sessionId === sessionId);
    if (matches.length === 1 && matches[0]) {
      return matches[0];
    }
    if (selected?.key.sessionId === sessionId) {
      return selected;
    }
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.sessionNotFound,
      message: "The target session is not the active session.",
      operation,
      recoverable: true,
    });
  }

  function hasAnyActiveRun(): boolean {
    return registry.activeRunCount() > 0;
  }

  async function resolveListedSession(cwd: string, sessionId: string, operation: string): Promise<SessionInfo> {
    const infos = await SessionManager.list(cwd);
    const info = infos.find((entry) => entry.id === sessionId);
    if (!info) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.sessionNotFound,
        message: "The selected session was not found.",
        operation,
        recoverable: true,
        details: { sessionId },
      });
    }
    return info;
  }

  async function validateListedArtifact(cwd: string, info: SessionInfo) {
    return validateSessionArtifact(info.path, info.id, {
      agentDir,
      workspacePath: cwd,
      ...(options.applicationDataDir ? { applicationDataDir: options.applicationDataDir } : {}),
      ...(options.resourcesRoot ? { resourcesRoot: options.resourcesRoot } : {}),
    });
  }

  function refuseBusyRemoval(live: LiveSession | undefined, operation: string): void {
    if (live && liveSessionProtected(live)) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.sessionRemovalRefused,
        message: "This chat is still running or waiting. Stop it first, then try again.",
        operation,
        recoverable: true,
      });
    }
  }

  const authFlow = createProviderAuthFlow({
    host: {
      openValidatedUrl(url) {
        options.openValidatedAuthUrl?.(url);
      },
      now: () => new Date(),
      randomId: () => randomUUID(),
    },
    login: async (providerId, method, interaction) => {
      const provider = modelRuntime.getProvider(providerId);
      if (!provider) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "Unknown provider.",
          operation: "startProviderLogin",
          recoverable: true,
        });
      }
      if (method === "oauth" && !provider.auth.oauth) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "That provider does not support OAuth login in this application.",
          operation: "startProviderLogin",
          recoverable: true,
        });
      }
      if (method === "api_key" && typeof provider.auth.apiKey?.login !== "function") {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "That provider does not accept an API key in this application.",
          operation: "startProviderLogin",
          recoverable: true,
        });
      }
      await modelRuntime.login(providerId, method, {
        ...(interaction.signal ? { signal: interaction.signal } : {}),
        prompt: (prompt) => interaction.prompt(prompt),
        notify: (event) => interaction.notify(event),
      });
    },
    emit: (snapshot) => {
      emit({
        type: RUNTIME_EVENT_TYPES.providerAuthFlow,
        payload: snapshot,
      });
    },
    onSettled: async (snapshot) => {
      if (snapshot.phase === "completed") {
        await refreshModelsAfterAuth();
      }
    },
  });

  async function refreshModelsAfterAuth(): Promise<void> {
    clearCatalogCache();
    for (const session of registry.list()) {
      const snapshot = await buildSnapshot({ live: session });
      emitFor(session, {
        type: RUNTIME_EVENT_TYPES.sessionSnapshot,
        sessionId: snapshot.session.id,
        payload: snapshot,
      });
    }
  }

  async function accountsResult(): Promise<ProviderAccountsResult> {
    const providers = await listProviderAccounts(modelRuntime);
    const result: ProviderAccountsResult = {
      providers,
      flow: authFlow.snapshot(),
    };
    assertJsonSafe(result, "listProviderAccounts");
    assertNoCanaries(result, authFlow.canaries(), "listProviderAccounts");
    return result;
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
            "No authenticated model is available. Sign in to a provider account in Settings.",
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

  async function buildSnapshot(options: { refreshCatalog?: boolean; live?: LiveSession } = {}): Promise<SessionSnapshot> {
    const refreshCatalog = options.refreshCatalog !== false;
    const live = options.live ?? requireLiveSession();
    const session = live.runtime.session;
    const workspace = live.workspace;
    const activeRun = live.activeRun;
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
      messages: projectSessionMessages(session),
      run: activeRun && !activeRun.settled ? { ...run, status: "streaming" } : idleRunState(),
      models,
      sessions: mergeResidentSessions(sessions, workspace.id),
      features: withHostDiagnostics(
        projectFeatureSnapshot(featureManifest, session.resourceLoader, compositionDiagnostics),
        live,
      ),
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

  function mergeResidentSessions(sessions: SessionSummary[], workspaceId: string): SessionSummary[] {
    let merged = sessions;
    for (const live of registry.list()) {
      if (live.key.workspaceId !== workspaceId) {
        continue;
      }
      const session = live.runtime.session;
      merged = mergeActiveSession(merged, {
        id: session.sessionId,
        workspaceId,
        title: session.sessionName?.trim() || firstUserPreview(session.messages) || "New session",
        updatedAt: new Date().toISOString(),
        ...(firstUserPreview(session.messages) ? { preview: firstUserPreview(session.messages) } : {}),
      });
    }
    return merged;
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

  async function rebindIdleGitHubSessions(): Promise<void> {
    const selectedKey = selected?.key;
    await registry.evictUnprotected();
    if (!selectedKey) {
      return;
    }
    selected = await registry.open(selectedKey);
    registry.select(selectedKey);
  }

  async function loadWorkspaceFeatures(cwd: string): Promise<FeatureSnapshot> {
    const live = registry.list().find((entry) => entry.key.workspaceId === cwd) ?? selected;
    if (live?.runtime.session && live.key.workspaceId === cwd) {
      return withHostDiagnostics(
        projectFeatureSnapshot(featureManifest, live.runtime.session.resourceLoader, compositionDiagnostics),
        live,
      );
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

  function withHostDiagnostics(snapshot: FeatureSnapshot, live?: LiveSession): FeatureSnapshot {
    const extra = [
      ...(live?.extensionHost?.takeDiagnostics() ?? []),
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

  function requireLiveSession(): LiveSession {
    if (!selected) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.sessionNotFound,
        message: "No active session is open.",
        operation: "session",
        recoverable: true,
      });
    }
    return selected;
  }

  function bindSession(live: LiveSession): void {
    live.unsubscribe?.();
    live.unsubscribe = live.runtime.session.subscribe((event) => {
      void handleAgentEvent(live, event);
    });
  }

  async function bindHostUi(live: LiveSession): Promise<void> {
    const session = live.runtime.session;
    live.extensionHost?.cancelPending();
    if (!live.extensionHost) {
      live.extensionHost = createExtensionHost({
        emit: (event) => {
          if (event.type === RUNTIME_EVENT_TYPES.extensionDialogRequest) {
            const payload: HostDialogRequest = {
              ...(event.payload as HostDialogRequest),
              workspaceId: live.key.workspaceId,
              sessionId: live.key.sessionId,
            };
            emitFor(live, { ...event, payload });
            emitActivity();
            return;
          }
          if (event.type === RUNTIME_EVENT_TYPES.extensionDialogSettled) {
            const payload: ExtensionDialogSettledPayload = {
              ...(event.payload as ExtensionDialogSettledPayload),
              workspaceId: live.key.workspaceId,
              sessionId: live.key.sessionId,
            };
            emitFor(live, { ...event, payload });
            emitActivity();
            return;
          }
          emitFor(live, event);
        },
        waitForIdle: () => live.runtime.session.waitForIdle(),
        newSession: async () => ({ cancelled: true }),
        reload: async () => {
          await live.runtime.session.reload();
          await bindHostUi(live);
        },
      });
    }
    live.extensionHost.beginBinding();
    try {
      await session.bindExtensions({
        uiContext: live.extensionHost.createUiContext(),
        mode: "rpc",
        commandContextActions: live.extensionHost.commandContextActions(),
        onError: (error) => {
          live.extensionHost?.onError(error);
        },
      });
    } finally {
      live.extensionHost.endBinding();
    }
  }

  async function handleAgentEvent(live: LiveSession, event: AgentSessionEvent): Promise<void> {
    const runId = live.activeRun?.runId;
    const sessionId = live.key.sessionId;
    switch (event.type) {
      case "message_update": {
        if (!runId) {
          return;
        }
        if (event.assistantMessageEvent.type === "text_delta") {
          emitFor(live, {
            type: RUNTIME_EVENT_TYPES.textDelta,
            sessionId,
            runId,
            payload: { runId, delta: event.assistantMessageEvent.delta ?? "" },
          });
          return;
        }
        if (event.assistantMessageEvent.type === "thinking_delta") {
          emitFor(live, {
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
        emitFor(live, {
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
        emitFor(live, {
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
        emitFor(live, {
          type: RUNTIME_EVENT_TYPES.toolEvent,
          sessionId,
          runId,
          payload: {
            runId,
            callId: event.toolCallId,
            name: displayToolName(event.toolName),
            status: event.isError ? "failed" : "completed",
            inputPreview: "",
            outputPreview: previewToolResult(event.result),
          },
        });
        return;
      case "queue_update": {
        emitFor(live, {
          type: RUNTIME_EVENT_TYPES.sessionSnapshot,
          sessionId,
          runId,
          payload: await buildSnapshot({ refreshCatalog: false, live }),
        });
        return;
      }
      default:
        return;
    }
  }

  async function finishRun(live: LiveSession, run: ActiveRun, error?: unknown): Promise<void> {
    if (run.settled || live.activeRun?.runId !== run.runId) {
      return;
    }
    run.settled = true;
    live.activeRun = undefined;
    const snapshot = await buildSnapshot({ live });
    if (error) {
      const harnessError = toHarnessError(error, "sendPrompt", HARNESS_ERROR_CODES.runFailed);
      snapshot.run = {
        ...snapshot.run,
        runId: run.runId,
        status: "failed",
        error: harnessError,
      };
      emitFor(live, {
        type: RUNTIME_EVENT_TYPES.runFailed,
        sessionId: run.sessionId,
        runId: run.runId,
        payload: { runId: run.runId, error: harnessError },
      });
      emitFor(live, {
        type: RUNTIME_EVENT_TYPES.sessionSnapshot,
        sessionId: run.sessionId,
        runId: run.runId,
        payload: snapshot,
      });
      emitActivity();
      return;
    }

    const failedMessage = live.runtime.session.agent.state.errorMessage;
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
      emitFor(live, {
        type: RUNTIME_EVENT_TYPES.runFailed,
        sessionId: run.sessionId,
        runId: run.runId,
        payload: { runId: run.runId, error: harnessError },
      });
    } else {
      snapshot.run = { ...idleRunState(), runId: run.runId, status: "settled" };
    }
    emitFor(live, {
      type: RUNTIME_EVENT_TYPES.runSettled,
      sessionId: run.sessionId,
      runId: run.runId,
      payload: snapshot,
    });
    emitActivity();
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
      const previousWorkspace = lastWorkspace?.path;
      lastWorkspace = workspaceSummary(cwd);
      await retrieval.bind(cwd);
      if (previousWorkspace && previousWorkspace !== cwd) {
        await releaseWorkspaceIfUnused(previousWorkspace);
      }
      const { models, modelError } = await listModels();
      const features = await loadWorkspaceFeatures(cwd);
      const snapshot: WorkspaceSnapshot = {
        workspace: workspaceSummary(cwd),
        sessions: mergeResidentSessions(await listSessions(cwd), cwd),
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
      return mergeResidentSessions(await listSessions(cwd), cwd);
    },
    listSessionActivity() {
      assertNotDisposed();
      return registry.list().map(projectLiveActivity);
    },
    async getSessionSnapshot(key: SessionKey) {
      assertNotDisposed();
      const cwd = await canonicalizeWorkspaceDirectory(key.workspaceId, "getSessionSnapshot");
      const live =
        registry.get({ workspaceId: cwd, sessionId: key.sessionId }) ??
        (await registry.open({ workspaceId: cwd, sessionId: key.sessionId }));
      return buildSnapshot({ live, refreshCatalog: false });
    },
    async createSession(workspaceId: string) {
      assertNotDisposed();
      const cwd = await canonicalizeWorkspaceDirectory(workspaceId, "createSession");
      const live = await registry.create(cwd);
      selected = live;
      lastWorkspace = live.workspace;
      registry.select(live.key);
      await retrieval.bind(live.workspace.path);
      clearCatalogCache();
      const snapshot = await buildSnapshot({ live });
      emitFor(live, {
        type: RUNTIME_EVENT_TYPES.sessionSnapshot,
        sessionId: snapshot.session.id,
        payload: snapshot,
      });
      emitActivity();
      return snapshot;
    },
    async openSession(workspaceId: string, sessionId: string) {
      assertNotDisposed();
      const cwd = await canonicalizeWorkspaceDirectory(workspaceId, "openSession");
      const live = await registry.open({ workspaceId: cwd, sessionId });
      selected = live;
      lastWorkspace = live.workspace;
      registry.select(live.key);
      await retrieval.bind(live.workspace.path);
      clearCatalogCache();
      const snapshot = await buildSnapshot({ live });
      emitFor(live, {
        type: RUNTIME_EVENT_TYPES.sessionSnapshot,
        sessionId: snapshot.session.id,
        payload: snapshot,
      });
      emitActivity();
      return snapshot;
    },
    async inspectRemovableSession(key: SessionKey): Promise<RemovableSessionInspection> {
      assertNotDisposed();
      const cwd = await canonicalizeWorkspaceDirectory(key.workspaceId, "prepareRemoveSession");
      refuseBusyRemoval(registry.get({ workspaceId: cwd, sessionId: key.sessionId }), "prepareRemoveSession");
      const info = await resolveListedSession(cwd, key.sessionId, "prepareRemoveSession");
      const artifact = await validateListedArtifact(cwd, info);
      const summary = sessionSummaryFromInfo(cwd, info);
      return { title: summary.title, fingerprint: artifact.fingerprint };
    },
    async removeValidatedSession(input: SessionKey & { fingerprint: string }): Promise<RemovedSessionResult> {
      assertNotDisposed();
      const cwd = await canonicalizeWorkspaceDirectory(input.workspaceId, "removeSession");
      return registry.runLocked({ workspaceId: cwd, sessionId: input.sessionId }, async () => {
        refuseBusyRemoval(registry.get({ workspaceId: cwd, sessionId: input.sessionId }), "removeSession");
        const info = await resolveListedSession(cwd, input.sessionId, "removeSession");
        const artifact = await validateListedArtifact(cwd, info);
        if (artifact.fingerprint !== input.fingerprint) {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.sessionArtifactInvalid,
            message: "The session transcript changed before it could be moved to Trash.",
            operation: "removeSession",
            recoverable: true,
          });
        }
        const summary = sessionSummaryFromInfo(cwd, info);
        await registry.remove({ workspaceId: cwd, sessionId: input.sessionId });
        let moved;
        try {
          moved = await removalService.moveToTrash({
            canonicalPath: artifact.canonicalPath,
            workspacePath: cwd,
            signal: new AbortController().signal,
          });
        } catch (error) {
          throw toHarnessError(error, "removeSession", HARNESS_ERROR_CODES.runtimeUnavailable);
        }
        clearCatalogCache();
        emit({
          type: RUNTIME_EVENT_TYPES.sessionRemoved,
          sessionId: input.sessionId,
          workspaceId: cwd,
          payload: { workspaceId: cwd, sessionId: input.sessionId, title: summary.title },
        });
        emitActivity();
        return { title: summary.title, method: moved.method };
      });
    },
    async sendPrompt(input: SendPromptInput) {
      assertNotDisposed();
      const live = locateController(input.sessionId, input.workspaceId, "sendPrompt");
      const session = live.runtime.session;
      if (live.activeRun && !live.activeRun.settled) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionBusy,
          message: "The session is already running a prompt.",
          operation: "sendPrompt",
          recoverable: true,
        });
      }
      registry.assertCanAdmitRun("sendPrompt");
      const { models, modelError } = await listModels();
      if (!session.model && models.length === 0) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.noAuthenticatedModel,
          message: modelError ?? "No authenticated model is available.",
          operation: "sendPrompt",
          recoverable: true,
        });
      }

      const promptText = await resolvePromptText(input, "sendPrompt", live);
      const images = takePreparedImages(live, input.imageIds, "sendPrompt");
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
      live.activeRun = run;

      const promptDone = retrieval.runWithWorkspace(live.workspace.path, () =>
        session.prompt(promptText, {
          source: "interactive",
          ...(images.length > 0 ? { images: images.map((record) => record.content) } : {}),
          preflightResult: (success) => {
            admitted = success;
            if (!success) {
              run.settled = true;
              if (live.activeRun === run) {
                live.activeRun = undefined;
              }
            }
            resolvePreflight(success);
          },
        }),
      );
      run.promptDone = promptDone;

      void promptDone.then(
        () => finishRun(live, run),
        (error: unknown) => {
          if (run.settled && !admitted) {
            return;
          }
          if (run.abortRequested) {
            return finishRun(live, run);
          }
          return finishRun(live, run, error);
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
      forgetPreparedImages(live, input.imageIds);

      const admission: PromptAdmission = {
        sessionId: session.sessionId,
        workspaceId: live.key.workspaceId,
        runId,
        admitted: true,
      };
      emitFor(live, {
        type: RUNTIME_EVENT_TYPES.sessionSnapshot,
        sessionId: session.sessionId,
        runId,
        payload: await buildSnapshot({ live }),
      });
      emitFor(live, {
        type: RUNTIME_EVENT_TYPES.runAdmitted,
        sessionId: session.sessionId,
        runId,
        payload: admission,
      });
      emitActivity();
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
      const live =
        input.sessionId !== undefined
          ? locateController(input.sessionId, input.workspaceId, "prepareImage")
          : requireLiveSession();
      const summary = live.preparedImages.add(input, "prepareImage");
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
      const live =
        input.sessionId !== undefined
          ? locateController(input.sessionId, input.workspaceId, "removePreparedImage")
          : requireLiveSession();
      live.preparedImages.remove(imageId);
    },
    async abortRun(input: AbortRunInput) {
      assertNotDisposed();
      const live = locateController(input.sessionId, input.workspaceId, "abortRun");
      const session = live.runtime.session;
      if (!live.activeRun || live.activeRun.runId !== input.runId) {
        return;
      }
      live.activeRun.abortRequested = true;
      session.clearQueue();
      await session.abort();
      await live.activeRun.promptDone.catch(() => undefined);
    },
    async setSessionModel(input: SetSessionModelInput) {
      assertNotDisposed();
      const live = locateController(input.sessionId, input.workspaceId, "setSessionModel");
      const session = live.runtime.session;
      if (live.activeRun && !live.activeRun.settled) {
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
      const snapshot = await buildSnapshot({ refreshCatalog: false, live });
      emitFor(live, {
        type: RUNTIME_EVENT_TYPES.sessionSnapshot,
        sessionId: snapshot.session.id,
        payload: snapshot,
      });
      return snapshot;
    },
    async setThinkingLevel(input: SetThinkingLevelInput) {
      assertNotDisposed();
      const live = locateController(input.sessionId, input.workspaceId, "setThinkingLevel");
      const session = live.runtime.session;
      if (live.activeRun && !live.activeRun.settled) {
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
      const snapshot = await buildSnapshot({ refreshCatalog: false, live });
      emitFor(live, {
        type: RUNTIME_EVENT_TYPES.sessionSnapshot,
        sessionId: snapshot.session.id,
        payload: snapshot,
      });
      return snapshot;
    },
    async rewriteAssistantOutput(input: RewriteAssistantOutputInput) {
      assertNotDisposed();
      const live = locateController(input.sessionId, input.workspaceId, "rewriteAssistantOutput");
      const session = live.runtime.session;
      if (live.activeRun && !live.activeRun.settled) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionBusy,
          message: "Wait for the current run to finish before rewriting assistant output.",
          operation: "rewriteAssistantOutput",
          recoverable: true,
        });
      }
      if (typeof input.text !== "string") {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "Rewritten text is required.",
          operation: "rewriteAssistantOutput",
          recoverable: true,
        });
      }
      if (input.text.length > MAX_ASSISTANT_REWRITE_CHARS) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "The rewritten text is too long.",
          operation: "rewriteAssistantOutput",
          recoverable: true,
        });
      }
      const projected = projectSessionMessages(session);
      const target = projected.find((message) => message.id === input.messageId);
      if (!target || target.role !== "assistant") {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "That assistant message is not in this session.",
          operation: "rewriteAssistantOutput",
          recoverable: true,
        });
      }
      const displayed = joinedText(target.blocks);
      if (input.text === displayed) {
        return buildSnapshot({ refreshCatalog: false, live });
      }
      const original = originalJoinedText(target.blocks);
      session.sessionManager.appendCustomEntry(ASSISTANT_REWRITE_CUSTOM_TYPE, {
        messageId: input.messageId,
        text: input.text === original ? null : input.text,
        rewrittenAt: new Date().toISOString(),
      });
      const snapshot = await buildSnapshot({ refreshCatalog: false, live });
      emitFor(live, {
        type: RUNTIME_EVENT_TYPES.sessionSnapshot,
        sessionId: snapshot.session.id,
        payload: snapshot,
      });
      return snapshot;
    },
    async resolveHostDialog(input: ResolveHostDialogInput) {
      assertNotDisposed();
      const live =
        input.sessionId !== undefined
          ? locateController(input.sessionId, input.workspaceId, "resolveHostDialog")
          : requireLiveSession();
      if (input.sessionId !== undefined) {
        requireMatchingSessionKey(live.key, input, "resolveHostDialog");
      }
      live.extensionHost?.resolveDialog(input);
    },
    getPermissionSettings() {
      assertNotDisposed();
      return currentPermissionSettings();
    },
    async updatePermissionSettings(input: UpdatePermissionSettingsInput) {
      assertNotDisposed();
      if (hasAnyActiveRun()) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionBusy,
          message: "Wait for the current run to finish before changing permission settings.",
          operation: "updatePermissionSettings",
          recoverable: true,
        });
      }
      applyPermissionSettingsPatch({
        agentDir,
        appliesToSharedPiAgentDir: options.appliesToSharedPiAgentDir === true,
        patch: input,
        ...(selected?.workspace.path ?? lastWorkspace?.path
          ? { workspacePath: selected?.workspace.path ?? lastWorkspace!.path }
          : {}),
        yoloActive: registry.list().some((entry) => entry.extensionHost?.yoloActive === true),
      });
      try {
        for (const live of registry.list()) {
          await live.runtime.session.reload();
          await bindHostUi(live);
        }
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
      if (selected) {
        const snapshot = await buildSnapshot({ live: selected });
        emitFor(selected, {
          type: RUNTIME_EVENT_TYPES.featureSnapshot,
          sessionId: snapshot.session.id,
          payload: snapshot.features,
        });
        emitFor(selected, {
          type: RUNTIME_EVENT_TYPES.sessionSnapshot,
          sessionId: snapshot.session.id,
          payload: snapshot,
        });
      }
      return currentPermissionSettings();
    },
    async trustProjectPermissionRules(workspacePath: string) {
      assertNotDisposed();
      if (hasAnyActiveRun()) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionBusy,
          message: "Wait for the current run to finish before changing project trust.",
          operation: "trustProjectPermissionRules",
          recoverable: true,
        });
      }
      const cwd = await canonicalizeWorkspaceDirectory(workspacePath, "trustProjectPermissionRules");
      approvedProjectPaths.add(cwd);
      for (const live of registry.list()) {
        if (live.key.workspaceId !== cwd) {
          continue;
        }
        live.runtime.services.settingsManager.setProjectTrusted(true);
        await live.runtime.session.reload();
        await bindHostUi(live);
        const snapshot = await buildSnapshot({ live });
        emitFor(live, {
          type: RUNTIME_EVENT_TYPES.featureSnapshot,
          sessionId: snapshot.session.id,
          payload: snapshot.features,
        });
        emitFor(live, {
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
      if (hasAnyActiveRun()) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionBusy,
          message: "Wait for the current run to finish before importing an API key.",
          operation: "importProviderApiKey",
          recoverable: true,
        });
      }
      const providers = await persistProviderApiKey(modelRuntime, input);
      await refreshModelsAfterAuth();
      return { providers };
    },
    async listProviderAccounts(): Promise<ProviderAccountsResult> {
      assertNotDisposed();
      return accountsResult();
    },
    async startProviderLogin(input: StartProviderLoginInput): Promise<ProviderAuthFlowSnapshot> {
      assertNotDisposed();
      const providerId = input.providerId.trim();
      if (providerId.length === 0 || !isProviderAuthMethod(input.method)) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "providerId and a supported login method are required.",
          operation: "startProviderLogin",
          recoverable: true,
        });
      }
      const snapshot = await authFlow.start({
        providerId,
        method: input.method,
        runActive: hasAnyActiveRun(),
      });
      assertJsonSafe(snapshot, "startProviderLogin");
      assertNoCanaries(snapshot, authFlow.canaries(), "startProviderLogin");
      return snapshot;
    },
    async respondProviderAuthPrompt(input: RespondProviderAuthPromptInput): Promise<ProviderAuthFlowSnapshot> {
      assertNotDisposed();
      const snapshot = await authFlow.respond(input);
      assertJsonSafe(snapshot, "respondProviderAuthPrompt");
      assertNoCanaries(snapshot, [...authFlow.canaries(), input.value], "respondProviderAuthPrompt");
      return snapshot;
    },
    async openProviderAuthLink(input: OpenProviderAuthLinkInput): Promise<void> {
      assertNotDisposed();
      await authFlow.openLink(input);
    },
    async cancelProviderLogin(input: CancelProviderLoginInput): Promise<ProviderAuthFlowSnapshot> {
      assertNotDisposed();
      const snapshot = await authFlow.cancel(input);
      assertJsonSafe(snapshot, "cancelProviderLogin");
      assertNoCanaries(snapshot, authFlow.canaries(), "cancelProviderLogin");
      return snapshot;
    },
    async logoutProvider(input: LogoutProviderInput): Promise<ProviderAccountsResult> {
      assertNotDisposed();
      if (hasAnyActiveRun()) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionBusy,
          message: "Wait for the current run to finish before changing provider accounts.",
          operation: "logoutProvider",
          recoverable: true,
        });
      }
      await logoutProviderAccount(modelRuntime, input.providerId);
      await refreshModelsAfterAuth();
      return accountsResult();
    },
    async searchWorkspaceReferences(input: SearchWorkspaceReferencesInput): Promise<SearchWorkspaceReferencesResult> {
      assertNotDisposed();
      const workspacePath = selected?.workspace.path ?? lastWorkspace?.path;
      if (!workspacePath) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.workspaceNotSelected,
          message: "Select a workspace before searching files.",
          operation: "searchWorkspaceReferences",
          recoverable: true,
        });
      }
      const query = typeof input.query === "string" ? input.query.slice(0, MAX_WORKSPACE_REFERENCE_QUERY) : "";
      await retrieval.bind(workspacePath);
      const result = await retrieval.searchPaths({
        query,
        workspacePath,
        ...(input.kinds ? { kinds: input.kinds } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
      });
      assertJsonSafe(result, "searchWorkspaceReferences");
      return result;
    },
    getSkillSettings() {
      assertNotDisposed();
      const snapshot = skillSources.snapshot();
      assertJsonSafe(snapshot, "getSkillSettings");
      return snapshot;
    },
    setEnabledSkillSources(sourceIds) {
      assertNotDisposed();
      skillSources.setEnabledExternalSources(sourceIds);
      const snapshot = skillSources.snapshot();
      assertJsonSafe(snapshot, "setEnabledSkillSources");
      return snapshot;
    },
    async updateSkillSourceSettings(input) {
      assertNotDisposed();
      if (!isExternalSkillSourceId(input.sourceId)) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "Unknown skill source.",
          operation: "updateSkillSourceSettings",
          recoverable: true,
        });
      }
      const snapshot = skillSources.setSourceEnabled(input.sourceId, input.enabled === true);
      assertJsonSafe(snapshot, "updateSkillSourceSettings");
      return snapshot;
    },
    async refreshSkills() {
      assertNotDisposed();
      const snapshot = skillSources.refresh();
      assertJsonSafe(snapshot, "refreshSkills");
      return snapshot;
    },
    getGitHubMcpSettings() {
      assertNotDisposed();
      const snapshot = githubMcp.snapshot();
      assertJsonSafe(snapshot, "getGitHubMcpSettings");
      return snapshot;
    },
    async updateGitHubMcpSettings(input: UpdateGitHubMcpSettingsInput) {
      assertNotDisposed();
      const snapshot = await githubMcp.setEnabled(input.enabled === true);
      await rebindIdleGitHubSessions();
      assertJsonSafe(snapshot, "updateGitHubMcpSettings");
      return snapshot;
    },
    async importGitHubPat(input: ImportGitHubPatInput) {
      assertNotDisposed();
      const snapshot = await githubMcp.importPat(input.token);
      await rebindIdleGitHubSessions();
      assertJsonSafe(snapshot, "importGitHubPat");
      assertNoCanaries(snapshot, [input.token], "importGitHubPat");
      return snapshot;
    },
    async logoutGitHubMcp() {
      assertNotDisposed();
      const snapshot = await githubMcp.logout();
      await rebindIdleGitHubSessions();
      assertJsonSafe(snapshot, "logoutGitHubMcp");
      return snapshot;
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
      await authFlow.dispose();
      listeners.clear();
      try {
        await registry.disposeAll();
      } finally {
        await retrieval.dispose();
        await web.dispose();
        await githubMcp.dispose();
        selected = undefined;
        restoreAgentDirEnv(previousAgentDirEnv, options.agentDir);
      }
    },
  };

  function currentPermissionSettings() {
    const workspacePath = selected?.workspace.path ?? lastWorkspace?.path;
    const settings = readPermissionSettings({
      agentDir,
      appliesToSharedPiAgentDir: options.appliesToSharedPiAgentDir === true,
      ...(workspacePath ? { workspacePath } : {}),
      yoloActive: registry.list().some((entry) => entry.extensionHost?.yoloActive === true),
    });
    return {
      ...settings,
      projectPermissionRulesTrusted: workspacePath ? isProjectApproved(workspacePath) : true,
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
    live: LiveSession,
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
    let resolved = text;
    if (references.length > 0) {
      const workspacePath = live.workspace.path;
      const validated = [];
      for (const token of references) {
        validated.push(await validateWorkspaceReference(token, workspacePath));
      }
      resolved = serializeWorkspaceReferences(text, validated);
    }
    return skillSources.expandInsertedSkills(resolved);
  }

  function takePreparedImages(
    live: LiveSession,
    imageIds: readonly string[] | undefined,
    operation: string,
  ) {
    if (!imageIds || imageIds.length === 0) {
      return [];
    }
    return live.preparedImages.lookup(imageIds, operation);
  }

  function forgetPreparedImages(live: LiveSession, imageIds: readonly string[] | undefined): void {
    if (!imageIds || imageIds.length === 0) {
      return;
    }
    live.preparedImages.forget(imageIds);
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
    const live = locateController(input.sessionId, input.workspaceId, operation);
    const session = live.runtime.session;
    if (!live.activeRun || live.activeRun.settled || live.activeRun.runId !== input.runId) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.invalidCommand,
        message: operation === "steerRun" ? "Steer requires the current run." : "A follow-up requires the current run.",
        operation,
        recoverable: true,
      });
    }
    const promptText = await resolvePromptText(input, operation, live);
    const records = takePreparedImages(live, input.imageIds, operation);
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
      await retrieval.runWithWorkspace(live.workspace.path, () =>
        enqueue(
          session,
          promptText,
          records.map((record) => record.content),
        ),
      );
    } catch (error) {
      throw toHarnessError(error, operation, HARNESS_ERROR_CODES.promptRejected);
    }
    forgetPreparedImages(live, input.imageIds);
    const snapshot = await buildSnapshot({ refreshCatalog: false, live });
    emitFor(live, {
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      sessionId: session.sessionId,
      runId: live.activeRun.runId,
      payload: snapshot,
    });
    const admission: QueueAdmission = {
      sessionId: session.sessionId,
      workspaceId: live.key.workspaceId,
      runId: live.activeRun.runId,
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

function projectSessionMessages(session: AgentSession) {
  return applyRewriteOverlays(
    projectMessages(session.messages),
    collectRewriteOverlays(session.sessionManager.getEntries()),
  );
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
