import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionRuntime,
  AgentSessionRuntimeDiagnostic,
  SessionInfo,
} from "@pho-agent/runtime/feature-api";
import {
  agentProjectRequiresTrust,
  createAgentModelRuntime,
  createAgentProjectTrustStore,
  createAgentResourceLoader,
  createAgentSettingsManager,
  createInMemoryAgentSettings,
  createNewAgentSessionRuntime,
  createPiSessionRuntimeFactory,
  generateSessionTitle,
  getAgentDir,
  listAgentSessions,
  openAgentSessionRuntime,
  registerAgentTestProvider,
} from "@pho-agent/runtime";
import type { FauxProviderHandle } from "@pho-agent/runtime/feature-api";
import {
  RUNTIME_EVENT_TYPES,
  CHANGE_REVIEW_COPY,
  createHarnessError,
  failCommand,
  HARNESS_ERROR_CODES,
  idleRunState,
  isProviderAuthMethod,
  isThinkingLevel,
  isWorkspaceReferenceToken,
  MAX_ASSISTANT_REWRITE_CHARS,
  MAX_CONTEXT_PROMPT_PREAMBLE_CHARS,
  MAX_QUEUE_MESSAGE_PREVIEW,
  MAX_WORKSPACE_REFERENCE_QUERY,
  MAX_WORKSPACE_REFERENCES_PER_PROMPT,
  emptyQueueState,
  GITHUB_MCP_FEATURE_ID,
  isExternalSkillSourceId,
  requireMatchingSessionKey,
  sessionKeyId,
  sessionTitleSeed,
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
  type UpdateSessionContextPromptInput,
  type SearchWorkspaceReferencesInput,
  type SearchWorkspaceReferencesResult,
  type SendPromptInput,
  type SessionQueueState,
  type SessionSnapshot,
  type SessionKey,
  type SetSessionModelInput,
  type SetThinkingLevelInput,
  type SetFastModeInput,
  type SetSessionModeInput,
  type UpdateSessionPlanDocumentInput,
  type ExecuteSessionPlanInput,
  type StartProviderLoginInput,
  type SteerRunInput,
  type ThinkingLevel,
  type Unsubscribe,
  type UpdatePermissionSettingsInput,
  type UpdateGitHubMcpSettingsInput,
  type UpdateSandboxSettingsInput,
  type SandboxSettingsSnapshot,
  type ImportGitHubPatInput,
  type ContextUsageSummary,
  type SessionUsageSummary,
  type WorkspaceSnapshot,
  type WorkspaceSummary,
  type ApproveChangesInput,
  type ApplyUndoChangesInput,
  type ChangeDiffPage,
  type ChangeFileViewPage,
  type ChangeReviewSetSnapshot,
  type ChangeScope,
  type GetChangeDiffInput,
  type GetChangeFileViewInput,
  type PrepareUndoChangesInput,
  type UndoPreview,
  MAX_CHANGE_REVIEWS_ON_SNAPSHOT,
  ASK_USER_QUESTION_TOOL_NAME,
  UPDATE_PLAN_DOCUMENT_TOOL_NAME,
  TODO_TOOL_NAME,
  EXECUTE_PLAN_TOOL_NAME,
  isSessionAgentMode,
  planDocumentTooLarge,
  parseSandboxSettingsPatch,
  type PlanTodoItem,
} from "@pho-code/protocol";
import { createExtensionHost, type ExtensionHost } from "./extension-host";
import { applyCursorSdkHarnessPolicy, cursorProviderHasOwnerCredentials, registerCursorProviderAccount } from "./cursor-sdk-policy";
import { advertisedCatalogModel, assertModelAdmissible, catalogHasModel } from "./model-catalog";
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
import { hostPhoCodeRuntime } from "./hosted-runtime";
import { createLazyAcpBackend } from "@pho-agent/backend-acp";
import { createLazyCodexBackend } from "@pho-agent/backend-codex";
import { CODEX_DEVELOPER_INSTRUCTIONS, createCodexWorkspaceSearchTool } from "./external-backend-tools";
import { validateSessionArtifact } from "./session-artifact";
import { previewToolResult, previewUnknown } from "./preview";
import { todosFromToolArgs, todosFromToolResult } from "./todo-tool";
import { createNodeModuleResourceLocator, type ResourceLocator } from "./resource-locator";
import { projectFeatureSnapshot } from "./resources";
import {
  applyPermissionSettingsPatch,
  readPermissionSettings,
  syncHarnessPermissionPolicy,
} from "./permission-settings";
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
import {
  applyDisabledSectionIds,
  compileContextPrompt,
  CONTEXT_PROMPT_CUSTOM_TYPE,
  liveContextPromptSections,
} from "./context-prompt";
import { CONTEXT_PROMPT_FEATURE_ID, createContextPromptFeature } from "./context-prompt-feature";
import {
  PLAN_EXECUTE_CUSTOM_TYPE,
  PLAN_EXECUTE_PROMPT,
  beginPlanExecuteRecord,
  planExecuteFinishedByTodos,
  planExecuteRefusal,
  planExecuteRefusalMessage,
} from "./plan-agent-state";
import { resolveCuratedSkillsRoot } from "./skills-feature";
import { createGitHubMcpFeature } from "./github-mcp-feature";
import { createGitHubMcpRuntime } from "./github-mcp-runtime";
import { createAgentSandbox, type SandboxRuntimeSnapshot } from "./sandbox-runtime";
import { createSandboxFeature, SANDBOX_FEATURE_ID } from "./sandbox-feature";
import {
  canonicalizeSandboxPathList,
  createSandboxSettingsStore,
  sandboxSettingsPath,
  toSandboxSettingsSnapshot,
} from "./sandbox-settings";
import { createOsSecretStore, type SecretStore } from "./secret-store";
import { projectModelSummary, modelSupportsImages } from "./model-summary";
import { createPreparedImageStore } from "./image-store";
import {
  createSessionRegistry,
} from "./session-registry";
import { createDeterministicTestProvider, createHarnessMarkTool, TEST_TOOL_NAME } from "./test-model";
import { createChangeCaptureFeature, type ChangeCaptureHost } from "./change-feature";
import { createChangeCaptureService, type ChangeCaptureService } from "./change-capture";
import { createFileChangeLedgerStore } from "./change-ledger-store";
import { createChangeReviewRuntime, type ChangeReviewRuntime } from "./change-review";
import { createAtomicChangeRecoveryService } from "./change-recovery";
import { firstUserText, projectSessionMessages } from "./transcript";
import {
  ASSISTANT_REWRITE_CUSTOM_TYPE,
  joinedText,
  originalJoinedText,
} from "./assistant-rewrite";
import {
  collectWorkspaceReferenceTokens,
  serializeWorkspaceReferences,
  validateWorkspaceReference,
} from "./workspace-reference";
import { canonicalizeWorkspaceDirectory } from "./workspace-path";
import { createPhoCodeScopeAdapter } from "./pho-code-scope-adapter";
import { createRuntimeEventEmitter } from "./runtime-event-emitter";
import { createRuntimeEventProjector } from "./runtime-events";
import { createCompiledContextPromptCache } from "./compiled-context-prompt-cache";
import { createProjectTrust } from "./project-trust";
import { createControllerLookup } from "./runtime-controller-lookup";
import { createRunLifecycle, type ActiveRun } from "./runtime-run-lifecycle";
import { createWorkspaceCatalogPort, liveSessionSummary, sessionSummaryFromInfo } from "./workspace-catalog";
import { createPlanContextProjector, toolPromptSources } from "./runtime-plan-context";
import { createWorkspaceCatalogCache } from "./workspace-catalog-cache";
import { createDisposeLatch } from "./dispose-latch";
import { createSessionSelection } from "./session-selection";

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
  rgPath?: string;
}

// Stop must return the chat to Send even when Pi ignores the abort signal.
// The value is recorded in docs/urgent/agent-stop/logs/2026-08-19-m1-bounded-stop.md.
const ABORT_IDLE_DEADLINE_MS = 1_000;

// Resolves true when Pi idled within the deadline; false when the deadline
// fired or abort threw (the session state is then unknown and recovered by
// reopening the controller).
async function abortSessionWithDeadline(session: AgentSession): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      session.abort().then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ABORT_IDLE_DEADLINE_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

interface LiveSession {
  key: SessionKey;
  runtime: AgentSessionRuntime;
  workspace: WorkspaceSummary;
  preparedImages: ReturnType<typeof createPreparedImageStore>;
  generation: number;
  githubBindingRevision: number;
  selectedAt: number;
  disposing: boolean;
  activeRun?: ActiveRun;
  unsubscribe?: Unsubscribe;
  extensionHost?: ExtensionHost;
  planTodos: PlanTodoItem[];
  autoTitleAttempted?: boolean;
  titleGeneration?: AbortController;
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
  syncHarnessPermissionPolicy(agentDir);
  const projectTrust = createProjectTrust({
    store: createAgentProjectTrustStore(agentDir),
    requiresTrust: agentProjectRequiresTrust,
  });
  const scopeAdapter = createPhoCodeScopeAdapter();
  const events = createRuntimeEventEmitter();
  const emit = events.emit;
  const compiledPrompts = createCompiledContextPromptCache();
  const planContext = createPlanContextProjector<LiveSession>({ compiledPrompts });
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
  const sandboxDataDir = options.applicationDataDir ?? agentDir;
  const sandboxSettings = createSandboxSettingsStore(sandboxDataDir);
  // Deterministic tests keep unsandboxed bash unless a settings file opts in, so
  // permission journeys stay stable while production defaults sandbox on.
  if (options.deterministicTestModel === true && !existsSync(sandboxSettingsPath(sandboxDataDir))) {
    sandboxSettings.disableWithoutPersisting();
  }
  const sandbox = createAgentSandbox({
    enabled: sandboxSettings.current.enabled,
    networkMode: sandboxSettings.current.networkMode,
    allowedDomains: sandboxSettings.current.allowedDomains,
    includePackageRegistryDefaults: sandboxSettings.current.includePackageRegistryDefaults,
    additionalReadPaths: sandboxSettings.current.additionalReadPaths,
    additionalWritePaths: sandboxSettings.current.additionalWritePaths,
    agentDir,
    ...(options.applicationDataDir ? { applicationDataDir: options.applicationDataDir } : {}),
    ...(options.resourcesRoot ? { resourcesRoot: options.resourcesRoot } : {}),
    ...(options.rgPath ? { rgPath: options.rgPath } : {}),
  });
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
  const contextPromptFeature = createContextPromptFeature({
    compiledFor: (input) => compiledPrompts.compiledFor(input),
  });
  const changeCaptureHost: ChangeCaptureHost = {
    capture: undefined,
    resolveScope: () => undefined,
  };
  const changeCaptureFeature = createChangeCaptureFeature(changeCaptureHost);
  const featureManifest = {
    features: [
      createSandboxFeature(sandbox),
      ...(options.deterministicTestModel
        ? baseManifest.features.filter(
            (feature) => feature.id !== CONTEXT_PROMPT_FEATURE_ID && feature.id !== SANDBOX_FEATURE_ID,
          )
        : [
            ...baseManifest.features.filter(
              (feature) =>
                feature.id !== SKILL_INVOKE_FEATURE_ID &&
                feature.id !== GITHUB_MCP_FEATURE_ID &&
                feature.id !== CONTEXT_PROMPT_FEATURE_ID &&
                feature.id !== SANDBOX_FEATURE_ID,
            ),
            createSkillInvokeFeature(skillSources),
            createGitHubMcpFeature(githubMcp),
          ]),
      contextPromptFeature,
      changeCaptureFeature,
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
  const modelRuntime = await createAgentModelRuntime(agentDir);

  const testProvider: FauxProviderHandle | undefined = options.deterministicTestModel
    ? createDeterministicTestProvider()
    : undefined;
  if (testProvider) {
    registerAgentTestProvider(modelRuntime, testProvider);
  }
  if (options.testOAuthFlow) {
    modelRuntime.registerNativeProvider(createTestOAuthProvider());
  }

  if (featureManifest.features.some((feature) => feature.id === CURSOR_SDK_FEATURE_ID && (feature.extensionPaths?.length ?? 0) > 0)) {
    registerCursorProviderAccount(modelRuntime);
  }

  const testTool = options.deterministicTestModel ? createHarnessMarkTool() : undefined;

  const disposal = createDisposeLatch();
  const selection = createSessionSelection<LiveSession>();
  let generation = 0;
  let githubBindingRevision = 0;
  const catalogCache = createWorkspaceCatalogCache();

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

  const catalog = createWorkspaceCatalogPort({
    modelRuntime,
    testProvider,
    cache: catalogCache,
    listSessionInfos: (cwd) => listAgentSessions(cwd, agentDir),
    listResident: () => registry.list(),
    isProjectApproved: (cwd) => projectTrust.isApproved(cwd),
    cursorAuthenticated: () => cursorProviderHasOwnerCredentials(modelRuntime),
  });
  const { listModels, listSessions, mergeResidentSessions, workspaceSummary } = catalog;
  const clearCatalogCache = catalog.clear;
  const resolveCatalog = catalog.resolve;

  const runs = createRunLifecycle<LiveSession>({ finishRun });
  const createActiveRun = runs.start;
  const watchPromptDone = runs.watchPromptDone;

  const controllers = createControllerLookup<LiveSession>({
    get: (key) => registry.get(key),
    list: () => registry.list(),
    selected: () => selection.current,
  });
  const locateController = controllers.locate;

  const projection = createRuntimeEventProjector<LiveSession>({
    emit,
    sandboxStatus: () => sandbox.snapshot().status,
    isSelected: (session) => selection.current === session,
    listSessions: () => registry.list(),
  });
  const { emitActivity, emitFor, emitFullSnapshot, emitSessionSnapshot, rememberSandboxedBashCall, toolEventPayload } =
    projection;

  const changeStore = createFileChangeLedgerStore(path.join(options.applicationDataDir ?? agentDir, "change-ledger", "v1"));
  const changeCapture: ChangeCaptureService = createChangeCaptureService({
    store: changeStore,
    onUpdated: (summary) => {
      emit({
        type: RUNTIME_EVENT_TYPES.changeReviewUpdated,
        workspaceId: summary.workspaceId,
        sessionId: summary.sessionId,
        runId: summary.runId,
        payload: summary,
      });
    },
  });
  changeCaptureHost.capture = changeCapture;
  changeCaptureHost.resolveScope = (cwd, sessionId) => {
    const live = registry.list().find(
      (session) =>
        session.key.sessionId === sessionId &&
        (session.workspace.path === cwd || session.key.workspaceId === cwd),
    );
    if (!live?.activeRun) {
      return undefined;
    }
    return {
      workspaceId: live.key.workspaceId,
      sessionId: live.key.sessionId,
      runId: live.activeRun.runId,
      workspacePath: live.workspace.path,
    };
  };
  const changeReview: ChangeReviewRuntime = createChangeReviewRuntime({
    capture: changeCapture,
    resolveWorkspacePath: (workspaceId) => canonicalizeWorkspaceDirectory(workspaceId, "getChangeReviewSet"),
    recovery: createAtomicChangeRecoveryService(removalService),
    removal: removalService,
    trashContext: {
      agentDir,
      ...(options.applicationDataDir ? { applicationDataDir: options.applicationDataDir } : {}),
      ...(options.resourcesRoot ? { resourcesRoot: options.resourcesRoot } : {}),
    },
  });

  async function instantiateSession(workspaceId: string, sessionId?: string): Promise<LiveSession> {
    const canonicalWorkspace = await canonicalizeWorkspaceDirectory(
      workspaceId,
      sessionId ? "openSession" : "createSession",
    );
    const scopeId = scopeAdapter.registerWorkspace(canonicalWorkspace, canonicalWorkspace);
    const { runtimeDirectory: cwd } = await scopeAdapter.resolve(scopeId);
    await ensureSandboxInitialized(cwd);
    const workspace = workspaceSummary(cwd);
    const next = sessionId
      ? await openPiRuntime(cwd, sessionId)
      : await createNewAgentSessionRuntime(createRuntime, { cwd, agentDir });
    const key: SessionKey = { workspaceId: cwd, sessionId: next.session.sessionId };
    generation += 1;
    const live: LiveSession = {
      key,
      runtime: next,
      workspace,
      preparedImages: createPreparedImageStore(),
      generation,
      githubBindingRevision,
      selectedAt: Date.now(),
      disposing: false,
      planTodos: [],
    };
    reportDiagnostics(next.diagnostics);
    next.setBeforeSessionInvalidate(() => {
      live.unsubscribe?.();
      live.unsubscribe = undefined;
    });
    next.setRebindSession(async () => {
      bindSession(live);
      await bindHostUi(live);
      planContext.hydrateTodos(live);
    });
    bindSession(live);
    await bindHostUi(live);
    planContext.hydrateTodos(live);
    await ensureSessionModelIsSelectable(live);
    await retrieval.bind(cwd);
    return live;
  }

  async function openPiRuntime(cwd: string, sessionId: string): Promise<AgentSessionRuntime> {
    const runtime = await openAgentSessionRuntime(createRuntime, { cwd, agentDir, sessionId });
    if (!runtime) {
      failCommand("openSession", "The selected session was not found.", HARNESS_ERROR_CODES.sessionNotFound, { sessionId });
    }
    return runtime;
  }

  async function disposeLiveSession(session: LiveSession, _reason: "evicted" | "removed" | "shutdown"): Promise<void> {
    if (session.disposing) {
      return;
    }
    session.disposing = true;
    session.titleGeneration?.abort();
    session.titleGeneration = undefined;
    session.extensionHost?.cancelPending();
    if (session.activeRun && !session.activeRun.settled) {
      session.activeRun.abortRequested = true;
      const piSession = session.runtime.session;
      // Bounded like abortRun: a stuck session must not hold shutdown or
      // controller eviction hostage to waitForIdle/promptDone.
      piSession.clearQueue();
      if (piSession.isBashRunning) {
        piSession.abortBash();
      }
      piSession.abortRetry();
      piSession.abortCompaction();
      try {
        await abortSessionWithDeadline(piSession);
      } catch {
        // Best-effort abort during eviction or shutdown.
      }
    }
    session.unsubscribe?.();
    session.unsubscribe = undefined;
    compiledPrompts.forget(sessionKeyId(session.key));
    session.extensionHost?.dispose();
    session.extensionHost = undefined;
    session.preparedImages.clear();
    try {
      await session.runtime.services.settingsManager.flush();
    } catch (error) {
      console.error("Failed to flush Pi settings during session dispose:", error);
    }
    await session.runtime.dispose();
    selection.clearIf(session);
    await releaseWorkspaceIfUnused(session.workspace.path);
  }

  // Recovery after a forced Stop: the run is already settled, so disposal
  // skips the cooperative abort wait, and the controller is reconstructed
  // from the authoritative Pi JSONL under the same session id.
  async function reopenStuckController(live: LiveSession): Promise<void> {
    const key = live.key;
    const wasSelected = selection.current === live;
    try {
      await registry.remove(key);
      const reopened = await registry.open(key);
      if (wasSelected) {
        await selectLiveSession(reopened);
      } else {
        emitActivity();
      }
    } catch (error) {
      console.error("Failed to reopen a stuck session after Stop:", error);
      emitActivity();
    }
  }

  function workspaceHasResidentController(workspacePath: string): boolean {
    return registry.list().some((entry) => entry.workspace.path === workspacePath);
  }

  async function releaseWorkspaceIfUnused(workspacePath: string | undefined): Promise<void> {
    if (!workspacePath) {
      return;
    }
    if (workspaceHasResidentController(workspacePath) || selection.lastWorkspace?.path === workspacePath) {
      return;
    }
    await retrieval.unbind(workspacePath);
  }

  function hasAnyActiveRun(): boolean {
    return registry.activeRunCount() > 0;
  }

  async function resolveListedSession(cwd: string, sessionId: string, operation: string): Promise<SessionInfo> {
    const infos = await listAgentSessions(cwd, agentDir);
    const info = infos.find((entry) => entry.id === sessionId);
    if (!info) {
      failCommand(operation, "The selected session was not found.", HARNESS_ERROR_CODES.sessionNotFound, { sessionId });
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
      failCommand(operation, "This chat is still running or waiting. Stop it first, then try again.", HARNESS_ERROR_CODES.sessionRemovalRefused);
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
        failCommand("startProviderLogin", "Unknown provider.");
      }
      if (method === "oauth" && !provider.auth.oauth) {
        failCommand("startProviderLogin", "That provider does not support OAuth login in this application.");
      }
      if (method === "api_key" && typeof provider.auth.apiKey?.login !== "function") {
        failCommand("startProviderLogin", "That provider does not accept an API key in this application.");
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
    const { models } = await listModels();
    for (const session of registry.list()) {
      await ensureSessionModelIsSelectable(session, models);
      emitSessionSnapshot(session, await buildSnapshot({ live: session }));
    }
  }

  async function accountsResult(): Promise<ProviderAccountsResult> {
    const providers = await listProviderAccounts(modelRuntime);
    const result: ProviderAccountsResult = {
      providers,
      flow: authFlow.snapshot(),
    };
    assertNoCanaries(result, authFlow.canaries(), "listProviderAccounts");
    return result;
  }

  async function ensureSessionModelIsSelectable(
    live: LiveSession,
    listedModels?: readonly ModelSummary[],
  ): Promise<void> {
    const models = listedModels ?? (await listModels()).models;
    if (catalogHasModel(models, live.runtime.session.model)) {
      return;
    }
    const next = models[0];
    if (!next) {
      return;
    }
    const model = modelRuntime.getModel(next.provider, next.id);
    if (!model) {
      return;
    }
    try {
      await live.runtime.session.setModel(model);
    } catch (error) {
      console.error("Failed to bind a selectable session model:", error);
    }
  }

  async function buildSnapshot(options: { refreshCatalog?: boolean; live?: LiveSession } = {}): Promise<SessionSnapshot> {
    const refreshCatalog = options.refreshCatalog !== false;
    const live = options.live ?? requireLiveSession();
    const session = live.runtime.session;
    const workspace = live.workspace;
    const activeRun = live.activeRun;
    const { models, modelError, sessions } = await resolveCatalog(workspace.path, refreshCatalog);
    const model = advertisedCatalogModel(session.model, models, projectModelSummary);
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
      session: liveSessionSummary(workspace.id, session),
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
      contextPrompt: planContext.projectContextPrompt(live),
      plan: planContext.projectPlan(live),
      changeReviews: (await changeCapture.listSessionReviews(workspace.id, session.sessionId)).slice(
        -MAX_CHANGE_REVIEWS_ON_SNAPSHOT,
      ),
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

  async function rebindIdleGitHubSessions(): Promise<void> {
    const selectedKey = selection.current?.key;
    await registry.evictUnprotected();
    if (!selectedKey) {
      return;
    }
    selection.rebind(await registry.open(selectedKey));
    registry.select(selectedKey);
  }

  async function rebindIdleSandboxSessions(): Promise<void> {
    for (const live of registry.list()) {
      if (!live.runtime.session) {
        continue;
      }
      await live.runtime.session.reload();
      await bindHostUi(live);
    }
  }

  async function applyStoredSandboxToEngine(workspacePath?: string): Promise<SandboxRuntimeSnapshot> {
    return sandbox.initialize({
      enabled: sandboxSettings.current.enabled,
      networkMode: sandboxSettings.current.networkMode,
      allowedDomains: sandboxSettings.current.allowedDomains,
      includePackageRegistryDefaults: sandboxSettings.current.includePackageRegistryDefaults,
      additionalReadPaths: canonicalizeSandboxPathList(sandboxSettings.current.additionalReadPaths),
      additionalWritePaths: canonicalizeSandboxPathList(sandboxSettings.current.additionalWritePaths),
      ...(workspacePath ? { workspacePath } : {}),
    });
  }

  async function ensureSandboxInitialized(workspacePath: string): Promise<void> {
    if (!sandboxSettings.current.enabled) {
      return;
    }
    await applyStoredSandboxToEngine(workspacePath);
  }

  /** Bumping the revision without rebinding leaves idle sessions on a stale binding. */
  async function invalidateGitHubBinding(): Promise<void> {
    githubBindingRevision += 1;
    await rebindIdleGitHubSessions();
  }

  async function refreshGitHubBinding(live: LiveSession): Promise<void> {
    if (live.githubBindingRevision === githubBindingRevision) {
      return;
    }
    await live.runtime.session.reload();
    await bindHostUi(live);
    live.githubBindingRevision = githubBindingRevision;
  }

  async function loadWorkspaceFeatures(cwd: string): Promise<FeatureSnapshot> {
    const live = registry.list().find((entry) => entry.key.workspaceId === cwd) ?? selection.current;
    if (live?.runtime.session && live.key.workspaceId === cwd) {
      return withHostDiagnostics(
        projectFeatureSnapshot(featureManifest, live.runtime.session.resourceLoader, compositionDiagnostics),
        live,
      );
    }
    const settingsManager = createAgentSettingsManager(cwd, agentDir);
    const loader = await createAgentResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      ...resourceLoaderOptions(),
    }, {
      resolveProjectTrust: async () => projectTrust.isApproved(cwd),
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
    const live = selection.current;
    if (!live) {
      failCommand("session", "No active session is open.", HARNESS_ERROR_CODES.sessionNotFound);
    }
    return live;
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
    planContext.applyToolPolicy(live);
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
        rememberSandboxedBashCall(live, event.toolName, event.toolCallId);
        emitFor(live, {
          type: RUNTIME_EVENT_TYPES.toolEvent,
          sessionId,
          runId,
          payload: toolEventPayload(runId, event, "running", previewUnknown(event.args), ""),
        });
        if (event.toolName === TODO_TOOL_NAME && planContext.rememberTodos(live, todosFromToolArgs(event.args))) {
          await emitSessionPlanSnapshot(live, sessionId, runId);
        }
        return;
      case "tool_execution_update":
        if (!runId) {
          return;
        }
        emitFor(live, {
          type: RUNTIME_EVENT_TYPES.toolEvent,
          sessionId,
          runId,
          payload: toolEventPayload(
            runId,
            event,
            "running",
            previewUnknown(event.args),
            previewToolResult(event.partialResult),
          ),
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
          payload: toolEventPayload(
            runId,
            event,
            event.isError ? "failed" : "completed",
            "",
            previewToolResult(event.result),
          ),
        });
        if (event.toolName === TODO_TOOL_NAME) {
          planContext.rememberTodos(live, todosFromToolResult(event.result));
          const record = planContext.readPlanAgent(live);
          if (planExecuteFinishedByTodos(record, live.planTodos)) {
            planContext.persistPlanAgent(live, { executing: false });
          }
        }
        if (
          event.toolName === UPDATE_PLAN_DOCUMENT_TOOL_NAME ||
          event.toolName === TODO_TOOL_NAME ||
          event.toolName === EXECUTE_PLAN_TOOL_NAME
        ) {
          await emitSessionPlanSnapshot(live, sessionId, runId);
        }
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
      case "session_info_changed": {
        emitFor(live, {
          type: RUNTIME_EVENT_TYPES.sessionSnapshot,
          sessionId,
          payload: await buildSnapshot({ refreshCatalog: false, live }),
        });
        emitActivity();
        return;
      }
      default:
        return;
    }
  }

  function maybeStartSessionTitle(live: LiveSession): void {
    if (options.deterministicTestModel || live.autoTitleAttempted || live.disposing) {
      return;
    }
    if (live.runtime.session.sessionName?.trim()) {
      return;
    }
    const seed = sessionTitleSeed(firstUserText(live.runtime.session.messages) ?? "");
    if (!seed) {
      return;
    }
    live.autoTitleAttempted = true;
    const controller = new AbortController();
    live.titleGeneration = controller;
    void generateSessionTitle(live.runtime.session, seed, { signal: controller.signal })
      .then(async (title) => {
        if (!title || live.disposing || live.runtime.session.sessionName?.trim()) {
          return;
        }
        live.runtime.session.setSessionName(title);
        emitFor(live, {
          type: RUNTIME_EVENT_TYPES.sessionSnapshot,
          sessionId: live.key.sessionId,
          payload: await buildSnapshot({ refreshCatalog: false, live }),
        });
        emitActivity();
      })
      .catch((error) => {
        console.error("Session title generation failed:", error);
      })
      .finally(() => {
        if (live.titleGeneration === controller) {
          live.titleGeneration = undefined;
        }
      });
  }

  async function finishRun(live: LiveSession, run: ActiveRun, error?: unknown): Promise<void> {
    if (run.settled || live.activeRun?.runId !== run.runId) {
      return;
    }
    run.settled = true;
    live.activeRun = undefined;
    try {
      await changeCapture.reconcileInterrupted({
        workspaceId: live.key.workspaceId,
        sessionId: live.key.sessionId,
        runId: run.runId,
      });
    } catch (reconcileError) {
      console.error("Change-ledger reconciliation failed:", reconcileError);
    }
    const planRecord = planContext.readPlanAgent(live);
    if (planRecord.executing) {
      planContext.persistPlanAgent(live, { executing: false });
      planContext.applyToolPolicy(live);
    }
    const failedMessage = live.runtime.session.agent.state.errorMessage;
    try {
      await refreshGitHubBinding(live);
    } catch (bindingError) {
      console.error("Failed to refresh GitHub MCP tools after the run settled:", bindingError);
    }
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
      maybeStartSessionTitle(live);
      return;
    }

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
    maybeStartSessionTitle(live);
  }

  const createRuntime = createPiSessionRuntimeFactory({
    modelRuntime,
    resourceLoaderOptions,
    resolveProjectTrust: (cwd) => projectTrust.isApproved(cwd),
    ...(options.deterministicTestModel
      ? {
          settingsManager: () =>
            createInMemoryAgentSettings({
              compaction: { enabled: false },
              retry: { enabled: false },
            }),
        }
      : {}),
    sessionOptions: () => ({
      ...(testProvider ? { model: testProvider.getModel(), thinkingLevel: "off" } : {}),
      ...(testTool
        ? {
            customTools: [testTool],
            tools: [
              TEST_TOOL_NAME,
              "bash",
              TRASH_TOOL_NAME,
              ASK_USER_QUESTION_TOOL_NAME,
              UPDATE_PLAN_DOCUMENT_TOOL_NAME,
              TODO_TOOL_NAME,
              "read",
              "write",
              "edit",
              "ls",
              "grep",
              "find",
            ],
          }
        : {}),
    }),
  });

  async function emitSessionPlanSnapshot(
    live: LiveSession,
    sessionId: string,
    runId: string | undefined,
  ): Promise<void> {
    emitFor(live, {
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      sessionId,
      runId,
      payload: await buildSnapshot({ refreshCatalog: false, live }),
    });
  }

  function refuseIfBusy(live: LiveSession, operation: string, message: string): void {
    if (live.activeRun && !live.activeRun.settled) {
      failCommand(operation, message, HARNESS_ERROR_CODES.sessionBusy);
    }
  }

  async function assertTurnAdmission(live: LiveSession, operation: string): Promise<void> {
    registry.assertCanAdmitRun(operation);
    const { models, modelError } = await listModels();
    assertModelAdmissible({ models, boundModel: live.runtime.session.model, modelError, operation });
  }

  async function publishSnapshot(live: LiveSession): Promise<SessionSnapshot> {
    const snapshot = await buildSnapshot({ refreshCatalog: false, live });
    emitSessionSnapshot(live, snapshot);
    return snapshot;
  }

  async function selectLiveSession(live: LiveSession): Promise<SessionSnapshot> {
    selection.select(live);
    registry.select(live.key);
    await retrieval.bind(live.workspace.path);
    clearCatalogCache();
    const snapshot = await buildSnapshot({ live });
    emitSessionSnapshot(live, snapshot);
    emitActivity();
    return snapshot;
  }

  async function publishAdmittedRun(live: LiveSession, run: ActiveRun): Promise<SessionSnapshot> {
    const sessionId = live.runtime.session.sessionId;
    const snapshot = await buildSnapshot({ live });
    emitFor(live, {
      type: RUNTIME_EVENT_TYPES.sessionSnapshot,
      sessionId,
      runId: run.runId,
      payload: snapshot,
    });
    emitFor(live, {
      type: RUNTIME_EVENT_TYPES.runAdmitted,
      sessionId,
      runId: run.runId,
      payload: {
        sessionId,
        workspaceId: live.key.workspaceId,
        runId: run.runId,
        admitted: true,
      },
    });
    emitActivity();
    return snapshot;
  }

  const runtime: HarnessRuntime = {
    get disposeCount() {
      return disposal.count;
    },
    getCapabilities() {
      return { piRuntime: true };
    },
    listAgentBackends() {
      return [];
    },
    getAgentDir() {
      return agentDir;
    },
    async inspectWorkspace(input: InspectWorkspaceInput) {
      assertNotDisposed();
      const cwd = await canonicalizeWorkspaceDirectory(input.path, "inspectWorkspace");
      scopeAdapter.registerWorkspace(cwd, cwd);
      if (input.approveProjectResources) {
        projectTrust.approveForSession(cwd);
      }
      const previousWorkspace = selection.rememberWorkspace(workspaceSummary(cwd));
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
      return registry.list().map(projection.projectActivity);
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
      return selectLiveSession(await registry.create(cwd));
    },
    async openSession(workspaceId: string, sessionId: string) {
      assertNotDisposed();
      const cwd = await canonicalizeWorkspaceDirectory(workspaceId, "openSession");
      return selectLiveSession(await registry.open({ workspaceId: cwd, sessionId }));
    },
    async inspectRemovableSession(key: SessionKey): Promise<RemovableSessionInspection> {
      assertNotDisposed();
      const cwd = await canonicalizeWorkspaceDirectory(key.workspaceId, "prepareRemoveSession");
      refuseBusyRemoval(registry.get({ workspaceId: cwd, sessionId: key.sessionId }), "prepareRemoveSession");
      if (await changeCapture.hasUnreadableReview(cwd, key.sessionId)) {
        failCommand("prepareRemoveSession", CHANGE_REVIEW_COPY.ledgerUnreadable, HARNESS_ERROR_CODES.changeReviewCorrupt);
      }
      if (await changeCapture.hasBlockingReview(cwd, key.sessionId)) {
        failCommand("prepareRemoveSession", "This chat still has pending write/edit review. Approve those changes first.", HARNESS_ERROR_CODES.sessionRemovalRefused);
      }
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
        if (await changeCapture.hasUnreadableReview(cwd, input.sessionId)) {
          failCommand("removeSession", CHANGE_REVIEW_COPY.ledgerUnreadable, HARNESS_ERROR_CODES.changeReviewCorrupt);
        }
        if (await changeCapture.hasBlockingReview(cwd, input.sessionId)) {
          failCommand("removeSession", "This chat still has pending write/edit review. Approve those changes first.", HARNESS_ERROR_CODES.sessionRemovalRefused);
        }
        const info = await resolveListedSession(cwd, input.sessionId, "removeSession");
        const artifact = await validateListedArtifact(cwd, info);
        if (artifact.fingerprint !== input.fingerprint) {
          failCommand("removeSession", "The session transcript changed before it could be moved to Trash.", HARNESS_ERROR_CODES.sessionArtifactInvalid);
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
      refuseIfBusy(live, "sendPrompt", "The session is already running a prompt.");
      await refreshGitHubBinding(live);
      const session = live.runtime.session;
      await assertTurnAdmission(live, "sendPrompt");

      const promptText = await resolvePromptText(input, "sendPrompt", live);
      const images = takePreparedImages(live, input.imageIds, "sendPrompt");
      if (promptText.trim() === "" && images.length === 0) {
        failCommand("sendPrompt", "A prompt, workspace reference, or image is required.");
      }
      if (images.length > 0 && !modelSupportsImages(session.model)) {
        failCommand("sendPrompt", "The selected model does not accept images.", HARNESS_ERROR_CODES.imagesUnsupported);
      }

      const run = createActiveRun(live);
      const runId = run.runId;
      let admitted = false;
      let resolvePreflight: (value: boolean) => void = () => undefined;
      const preflight = new Promise<boolean>((resolve) => {
        resolvePreflight = resolve;
      });

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
      watchPromptDone(live, run, promptDone, () => run.settled && !admitted);

      admitted = await preflight;
      if (!admitted) {
        await promptDone.catch(() => undefined);
        failCommand("sendPrompt", "The prompt was rejected before admission.", HARNESS_ERROR_CODES.promptRejected, { sessionId: session.sessionId, runId });
      }
      forgetPreparedImages(live, input.imageIds);

      const admission: PromptAdmission = {
        sessionId: session.sessionId,
        workspaceId: live.key.workspaceId,
        runId,
        admitted: true,
      };
      await publishAdmittedRun(live, run);
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
      return summary;
    },
    async removePreparedImage(input: RemovePreparedImageInput) {
      assertNotDisposed();
      const imageId = typeof input.imageId === "string" ? input.imageId.trim() : "";
      if (imageId.length === 0) {
        failCommand("removePreparedImage", "An image id is required.", HARNESS_ERROR_CODES.invalidImage);
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
      const run = live.activeRun;
      if (!run || run.runId !== input.runId) {
        return;
      }
      run.abortRequested = true;
      session.clearQueue();
      live.extensionHost?.cancelPending();
      if (session.isBashRunning) {
        session.abortBash();
      }
      session.abortRetry();
      session.abortCompaction();
      const idled = await abortSessionWithDeadline(session);
      if (run.settled || idled) {
        // Settlement is observed by the watchPromptDone observer; the IPC
        // path never awaits promptDone.
        return;
      }
      // The deadline fired: publish cancelled so Send returns, then recover a
      // still-busy Pi session by reopening the controller from Pi JSONL.
      await finishRun(live, run);
      if (!session.isIdle) {
        await reopenStuckController(live);
      }
    },
    async setSessionModel(input: SetSessionModelInput) {
      assertNotDisposed();
      const live = locateController(input.sessionId, input.workspaceId, "setSessionModel");
      const session = live.runtime.session;
      refuseIfBusy(live, "setSessionModel", "Wait for the current run to finish before changing the model.");
      const { models } = await listModels();
      if (!catalogHasModel(models, input)) {
        failCommand(
          "setSessionModel",
          "Sign in to a provider account in Settings before selecting this model.",
          HARNESS_ERROR_CODES.noAuthenticatedModel,
        );
      }
      const model = modelRuntime.getModel(input.provider, input.id);
      if (!model) {
        failCommand("setSessionModel", `Model ${input.provider}/${input.id} is not available.`);
      }
      try {
        await session.setModel(model);
      } catch (error) {
        failCommand("setSessionModel", error instanceof Error ? error.message : "Unable to set the model.");
      }
      return publishSnapshot(live);
    },
    async setThinkingLevel(input: SetThinkingLevelInput) {
      assertNotDisposed();
      const live = locateController(input.sessionId, input.workspaceId, "setThinkingLevel");
      const session = live.runtime.session;
      refuseIfBusy(live, "setThinkingLevel", "Wait for the current run to finish before changing the thinking level.");
      if (!isThinkingLevel(input.level)) {
        failCommand("setThinkingLevel", "Unknown thinking level.");
      }
      if (input.level === "default" || input.level === "none" || input.level === "ultra") {
        failCommand("setThinkingLevel", "That reasoning level is not supported by Pi.");
      }
      session.setThinkingLevel(input.level);
      return publishSnapshot(live);
    },
    async setFastMode(_input: SetFastModeInput) {
      failCommand("setFastMode", "Fast mode is not supported by Pi.");
    },
    async setSessionMode(input: SetSessionModeInput) {
      assertNotDisposed();
      const live = locateController(input.sessionId, input.workspaceId, "setSessionMode");
      refuseIfBusy(live, "setSessionMode", "Wait for the current run to finish before changing Plan or Agent.");
      if (!isSessionAgentMode(input.mode)) {
        failCommand("setSessionMode", "Unknown session mode.");
      }
      planContext.persistPlanAgent(live, { mode: input.mode, executing: false });
      planContext.applyToolPolicy(live);
      return publishSnapshot(live);
    },
    async updateSessionPlanDocument(input: UpdateSessionPlanDocumentInput) {
      assertNotDisposed();
      const live = locateController(input.sessionId, input.workspaceId, "updateSessionPlanDocument");
      refuseIfBusy(
        live,
        "updateSessionPlanDocument",
        "Wait for the current run to finish before editing the Plan document.",
      );
      const current = planContext.readPlanAgent(live);
      if (current.executing) {
        failCommand("updateSessionPlanDocument", "The Plan document is inspect-only while Execute is running.");
      }
      if (typeof input.documentMarkdown !== "string") {
        failCommand("updateSessionPlanDocument", "Plan document markdown is required.");
      }
      if (planDocumentTooLarge(input.documentMarkdown)) {
        failCommand("updateSessionPlanDocument", "The Plan document is too large.");
      }
      planContext.persistPlanAgent(live, { documentMarkdown: input.documentMarkdown });
      return publishSnapshot(live);
    },
    async executeSessionPlan(input: ExecuteSessionPlanInput) {
      assertNotDisposed();
      const live = locateController(input.sessionId, input.workspaceId, "executeSessionPlan");
      refuseIfBusy(live, "executeSessionPlan", "Wait for the current run to finish before executing the plan.");
      const current = planContext.readPlanAgent(live);
      const refusal = planExecuteRefusal(current);
      if (refusal) {
        failCommand("executeSessionPlan", planExecuteRefusalMessage(refusal));
      }
      await assertTurnAdmission(live, "executeSessionPlan");
      planContext.persistPlanAgent(live, beginPlanExecuteRecord(current));
      planContext.applyToolPolicy(live);

      const session = live.runtime.session;
      let run: ActiveRun;
      try {
        run = createActiveRun(live);
        watchPromptDone(
          live,
          run,
          retrieval.runWithWorkspace(live.workspace.path, () =>
            session.sendCustomMessage(
              {
                customType: PLAN_EXECUTE_CUSTOM_TYPE,
                content: PLAN_EXECUTE_PROMPT,
                display: false,
              },
              { triggerTurn: true },
            ),
          ),
        );
      } catch (error) {
        planContext.persistPlanAgent(live, { mode: current.mode, executing: false });
        planContext.applyToolPolicy(live);
        throw error;
      }
      return publishAdmittedRun(live, run);
    },
    async rewriteAssistantOutput(input: RewriteAssistantOutputInput) {
      assertNotDisposed();
      const live = locateController(input.sessionId, input.workspaceId, "rewriteAssistantOutput");
      const session = live.runtime.session;
      refuseIfBusy(live, "rewriteAssistantOutput", "Wait for the current run to finish before rewriting assistant output.");
      if (typeof input.text !== "string") {
        failCommand("rewriteAssistantOutput", "Rewritten text is required.");
      }
      if (input.text.length > MAX_ASSISTANT_REWRITE_CHARS) {
        failCommand("rewriteAssistantOutput", "The rewritten text is too long.");
      }
      const projected = projectSessionMessages(session);
      const target = projected.find((message) => message.id === input.messageId);
      if (!target || target.role !== "assistant") {
        failCommand("rewriteAssistantOutput", "That assistant message is not in this session.");
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
      return publishSnapshot(live);
    },
    async updateSessionContextPrompt(input: UpdateSessionContextPromptInput) {
      assertNotDisposed();
      const live = locateController(input.sessionId, input.workspaceId, "updateSessionContextPrompt");
      const session = live.runtime.session;
      refuseIfBusy(live, "updateSessionContextPrompt", "Wait for the current run to finish before changing the context prompt.");
      if (!planContext.contextPromptEditable(live)) {
        failCommand("updateSessionContextPrompt", "Context prompt can only be customized before the first message.");
      }
      if (input.reset === true) {
        session.sessionManager.appendCustomEntry(CONTEXT_PROMPT_CUSTOM_TYPE, { reset: true });
        compiledPrompts.forget(sessionKeyId(live.key));
        planContext.applyToolPolicy(live);
      } else {
        const preamble = typeof input.preamble === "string" ? input.preamble : "";
        if (preamble.length > MAX_CONTEXT_PROMPT_PREAMBLE_CHARS) {
          failCommand("updateSessionContextPrompt", "The context prompt preamble is too long.");
        }
        const disabledSectionIds = [];
        for (const id of input.disabledSectionIds ?? []) {
          if (typeof id !== "string" || id.trim() === "") {
            failCommand("updateSessionContextPrompt", "Each disabled section id must be a non-empty string.");
          }
          disabledSectionIds.push(id);
        }
        const sections = applyDisabledSectionIds(
          liveContextPromptSections(
            live.workspace.path,
            toolPromptSources(session),
            session.resourceLoader.getAgentsFiles().agentsFiles,
          ),
          disabledSectionIds,
        );
        const compiled = compileContextPrompt({
          preamble,
          sections,
          cwd: live.workspace.path,
        });
        session.sessionManager.appendCustomEntry(CONTEXT_PROMPT_CUSTOM_TYPE, {
          preamble,
          disabledSectionIds,
          compiled,
          sections,
        });
        compiledPrompts.record(sessionKeyId(live.key), compiled);
        planContext.applyToolPolicy(live);
      }
      return publishSnapshot(live);
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
        failCommand("updatePermissionSettings", "Wait for the current run to finish before changing permission settings.", HARNESS_ERROR_CODES.sessionBusy);
      }
      const permissionWorkspacePath = selection.activeWorkspacePath();
      applyPermissionSettingsPatch({
        agentDir,
        appliesToSharedPiAgentDir: options.appliesToSharedPiAgentDir === true,
        patch: input,
        ...(permissionWorkspacePath ? { workspacePath: permissionWorkspacePath } : {}),
        yoloActive: registry.list().some((entry) => entry.extensionHost?.yoloActive === true),
      });
      try {
        for (const live of registry.list()) {
          await live.runtime.session.reload();
          await bindHostUi(live);
        }
      } catch (error) {
        failCommand("updatePermissionSettings", "Permission settings were saved; restart required.", HARNESS_ERROR_CODES.resourceReloadFailed, {
          detail: error instanceof Error ? error.message : "reload failed",
        });
      }
      const activeSession = selection.current;
      if (activeSession) {
        emitFullSnapshot(activeSession, await buildSnapshot({ live: activeSession }));
      }
      return currentPermissionSettings();
    },
    async trustProjectPermissionRules(workspacePath: string) {
      assertNotDisposed();
      if (hasAnyActiveRun()) {
        failCommand("trustProjectPermissionRules", "Wait for the current run to finish before changing project trust.", HARNESS_ERROR_CODES.sessionBusy);
      }
      const cwd = await canonicalizeWorkspaceDirectory(workspacePath, "trustProjectPermissionRules");
      projectTrust.approveForSession(cwd);
      for (const live of registry.list()) {
        if (live.key.workspaceId !== cwd) {
          continue;
        }
        live.runtime.services.settingsManager.setProjectTrusted(true);
        await live.runtime.session.reload();
        await bindHostUi(live);
        emitFullSnapshot(live, await buildSnapshot({ live }));
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
        failCommand("importProviderApiKey", "Wait for the current run to finish before importing an API key.", HARNESS_ERROR_CODES.sessionBusy);
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
        failCommand("startProviderLogin", "providerId and a supported login method are required.");
      }
      const snapshot = await authFlow.start({
        providerId,
        method: input.method,
        runActive: hasAnyActiveRun(),
      });
      assertNoCanaries(snapshot, authFlow.canaries(), "startProviderLogin");
      return snapshot;
    },
    async respondProviderAuthPrompt(input: RespondProviderAuthPromptInput): Promise<ProviderAuthFlowSnapshot> {
      assertNotDisposed();
      const snapshot = await authFlow.respond(input);
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
      assertNoCanaries(snapshot, authFlow.canaries(), "cancelProviderLogin");
      return snapshot;
    },
    async logoutProvider(input: LogoutProviderInput): Promise<ProviderAccountsResult> {
      assertNotDisposed();
      if (hasAnyActiveRun()) {
        failCommand("logoutProvider", "Wait for the current run to finish before changing provider accounts.", HARNESS_ERROR_CODES.sessionBusy);
      }
      await logoutProviderAccount(modelRuntime, input.providerId);
      await refreshModelsAfterAuth();
      return accountsResult();
    },
    async searchWorkspaceReferences(input: SearchWorkspaceReferencesInput): Promise<SearchWorkspaceReferencesResult> {
      assertNotDisposed();
      const workspacePath = selection.activeWorkspacePath();
      if (!workspacePath) {
        failCommand("searchWorkspaceReferences", "Select a workspace before searching files.", HARNESS_ERROR_CODES.workspaceNotSelected);
      }
      const query = typeof input.query === "string" ? input.query.slice(0, MAX_WORKSPACE_REFERENCE_QUERY) : "";
      await retrieval.bind(workspacePath);
      return retrieval.searchPaths({
        query,
        workspacePath,
        ...(input.kinds ? { kinds: input.kinds } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
      });
    },
    getSkillSettings() {
      assertNotDisposed();
      return skillSources.snapshot();
    },
    setEnabledSkillSources(sourceIds) {
      assertNotDisposed();
      skillSources.setEnabledExternalSources(sourceIds);
      return skillSources.snapshot();
    },
    async updateSkillSourceSettings(input) {
      assertNotDisposed();
      if (!isExternalSkillSourceId(input.sourceId)) {
        failCommand("updateSkillSourceSettings", "Unknown skill source.");
      }
      return skillSources.setSourceEnabled(input.sourceId, input.enabled === true);
    },
    async refreshSkills() {
      assertNotDisposed();
      return skillSources.refresh();
    },
    getGitHubMcpSettings() {
      assertNotDisposed();
      return githubMcp.snapshot();
    },
    getSandboxSettings() {
      assertNotDisposed();
      return currentSandboxSettings();
    },
    async updateSandboxSettings(input: UpdateSandboxSettingsInput) {
      assertNotDisposed();
      if (hasAnyActiveRun()) {
        failCommand("updateSandboxSettings", "Wait for the current run to finish before changing sandbox settings.", HARNESS_ERROR_CODES.sessionBusy);
      }
      const parsed = parseSandboxSettingsPatch(input);
      if (!parsed.ok) {
        failCommand("updateSandboxSettings", parsed.message);
      }
      sandboxSettings.apply(parsed.patch);
      const workspacePath = selection.activeWorkspacePath();
      const live = await applyStoredSandboxToEngine(workspacePath);
      const snapshot = toSandboxSettingsSnapshot(sandboxSettings.current, live);
      await rebindIdleSandboxSessions();
      return snapshot;
    },
    async updateGitHubMcpSettings(input: UpdateGitHubMcpSettingsInput) {
      assertNotDisposed();
      const snapshot = await githubMcp.setEnabled(input.enabled === true);
      await invalidateGitHubBinding();
      return snapshot;
    },
    async importGitHubPat(input: ImportGitHubPatInput) {
      assertNotDisposed();
      const snapshot = await githubMcp.importPat(input.token);
      await invalidateGitHubBinding();
      assertNoCanaries(snapshot, [input.token], "importGitHubPat");
      return snapshot;
    },
    async removeGitHubPat() {
      assertNotDisposed();
      const snapshot = await githubMcp.removePat();
      await invalidateGitHubBinding();
      return snapshot;
    },
    async getChangeReviewSet(scope: ChangeScope): Promise<ChangeReviewSetSnapshot> {
      assertNotDisposed();
      return changeReview.getReviewSet(await canonicalizeChangeScope(scope, "getChangeReviewSet"));
    },
    async getChangeDiff(command: GetChangeDiffInput): Promise<ChangeDiffPage> {
      assertNotDisposed();
      return changeReview.getDiff({
        ...(await canonicalizeChangeScope(command, "getChangeDiff")),
        relativePath: command.relativePath,
        ...(command.cursor ? { cursor: command.cursor } : {}),
        ...(command.contextLines !== undefined ? { contextLines: command.contextLines } : {}),
      });
    },
    async getChangeFileView(command: GetChangeFileViewInput): Promise<ChangeFileViewPage> {
      assertNotDisposed();
      return changeReview.getFileView({
        ...(await canonicalizeChangeScope(command, "getChangeFileView")),
        relativePath: command.relativePath,
        version: command.version,
        ...(command.cursor ? { cursor: command.cursor } : {}),
      });
    },
    async approveChanges(command: ApproveChangesInput): Promise<ChangeReviewSetSnapshot> {
      assertNotDisposed();
      return changeReview.approve({
        ...(await canonicalizeChangeScope(command, "approveChanges")),
        expectedRevision: command.expectedRevision,
        ...(command.relativePaths ? { relativePaths: command.relativePaths } : {}),
      });
    },
    async prepareUndoChanges(command: PrepareUndoChangesInput): Promise<UndoPreview> {
      assertNotDisposed();
      return changeReview.prepareUndo({
        ...(await canonicalizeChangeScope(command, "prepareUndoChanges")),
        relativePath: command.relativePath,
        expectedRevision: command.expectedRevision,
      });
    },
    async applyUndoChanges(command: ApplyUndoChangesInput): Promise<ChangeReviewSetSnapshot> {
      assertNotDisposed();
      return changeReview.applyUndo({
        ...(await canonicalizeChangeScope(command, "applyUndoChanges")),
        previewToken: command.previewToken,
      });
    },
    subscribe: events.subscribe,
    async dispose() {
      if (!disposal.claim()) {
        return;
      }
      clearCatalogCache();
      await authFlow.dispose();
      events.clear();
      try {
        await registry.disposeAll();
      } finally {
        await retrieval.dispose();
        await web.dispose();
        await githubMcp.dispose();
        await sandbox.reset();
        selection.clear();
        restoreAgentDirEnv(previousAgentDirEnv, options.agentDir);
      }
    },
  };

  function currentPermissionSettings() {
    const workspacePath = selection.activeWorkspacePath();
    const settings = readPermissionSettings({
      agentDir,
      appliesToSharedPiAgentDir: options.appliesToSharedPiAgentDir === true,
      ...(workspacePath ? { workspacePath } : {}),
      yoloActive: registry.list().some((entry) => entry.extensionHost?.yoloActive === true),
    });
    return {
      ...settings,
      projectPermissionRulesTrusted: workspacePath ? projectTrust.isApproved(workspacePath) : true,
    };
  }

  function currentSandboxSettings(): SandboxSettingsSnapshot {
    return toSandboxSettingsSnapshot(sandboxSettings.current, sandbox.snapshot());
  }

  function assertNotDisposed(): void {
    if (disposal.disposed) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.shuttingDown,
        message: "The runtime is disposed.",
        operation: "runtime",
      });
    }
  }

  async function canonicalizeChangeScope(scope: ChangeScope, operation: string): Promise<ChangeScope> {
    const cwd = await canonicalizeWorkspaceDirectory(scope.workspaceId, operation);
    return {
      workspaceId: cwd,
      sessionId: scope.sessionId.trim(),
      runId: scope.runId.trim(),
    };
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
        failCommand(operation, "Each workspace reference must include a relative path.", HARNESS_ERROR_CODES.invalidWorkspaceReference);
      }
      explicit.push({
        path: token.path.trim(),
        ...(token.kind ? { kind: token.kind } : {}),
      });
    }
    const references = collectWorkspaceReferenceTokens(text, explicit);
    if (references.length > MAX_WORKSPACE_REFERENCES_PER_PROMPT) {
      failCommand(operation, `A prompt can include at most ${MAX_WORKSPACE_REFERENCES_PER_PROMPT} workspace references.`, HARNESS_ERROR_CODES.invalidWorkspaceReference);
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
      failCommand(operation, operation === "steerRun" ? "Steer requires the current run." : "A follow-up requires the current run.");
    }
    const promptText = await resolvePromptText(input, operation, live);
    const records = takePreparedImages(live, input.imageIds, operation);
    if (promptText.trim() === "" && records.length === 0) {
      failCommand(operation, "A prompt, workspace reference, or image is required.");
    }
    if (records.length > 0 && !modelSupportsImages(session.model)) {
      failCommand(operation, "The selected model does not accept images.", HARNESS_ERROR_CODES.imagesUnsupported);
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
    return admission;
  }

  return hostPhoCodeRuntime(runtime, {
    backends: [
      createLazyCodexBackend({
        scope: scopeAdapter,
        developerInstructions: CODEX_DEVELOPER_INSTRUCTIONS,
        dynamicTools: [createCodexWorkspaceSearchTool(scopeAdapter, retrieval)],
      }),
      createLazyAcpBackend({
        id: "claude-acp",
        label: "Claude",
        command: "claude-agent-acp",
        scope: scopeAdapter,
      }),
    ],
  });
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
