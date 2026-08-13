import {
  createHarnessError,
  HARNESS_ERROR_CODES,
  emptyFeatureSnapshot,
  emptySettingsSnapshot,
  type AbortRunInput,
  type CancelProviderLoginInput,
  type CredentialProviderSummary,
  type FeatureSnapshot,
  type ImportProviderApiKeyInput,
  type ImportProviderApiKeyResult,
  type LogoutProviderInput,
  type OpenProviderAuthLinkInput,
  type PermissionSettings,
  type PrepareImageInput,
  type PreparedImageSummary,
  type PromptAdmission,
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
  type SessionSnapshot,
  type SessionSummary,
  type SetSessionModelInput,
  type SetThinkingLevelInput,
  type StartProviderLoginInput,
  type SteerRunInput,
  type Unsubscribe,
  type UpdatePermissionSettingsInput,
  type WorkspaceSnapshot,
} from "@pho-code/protocol";

export interface RuntimeCapabilities {
  piRuntime: boolean;
}

export interface InspectWorkspaceInput {
  path: string;
  approveProjectResources: boolean;
}

export interface HarnessRuntime {
  readonly disposeCount: number;
  getCapabilities(): RuntimeCapabilities;
  getAgentDir(): string;
  inspectWorkspace(input: InspectWorkspaceInput): Promise<WorkspaceSnapshot>;
  listWorkspaceSessions(workspaceId: string): Promise<SessionSummary[]>;
  createSession(workspaceId: string): Promise<SessionSnapshot>;
  openSession(workspaceId: string, sessionId: string): Promise<SessionSnapshot>;
  sendPrompt(input: SendPromptInput): Promise<PromptAdmission>;
  steerRun(input: SteerRunInput): Promise<QueueAdmission>;
  queueFollowUp(input: QueueFollowUpInput): Promise<QueueAdmission>;
  prepareImage(input: PrepareImageInput): Promise<PreparedImageSummary>;
  removePreparedImage(input: RemovePreparedImageInput): Promise<void>;
  abortRun(input: AbortRunInput): Promise<void>;
  setSessionModel(input: SetSessionModelInput): Promise<SessionSnapshot>;
  setThinkingLevel(input: SetThinkingLevelInput): Promise<SessionSnapshot>;
  rewriteAssistantOutput(input: RewriteAssistantOutputInput): Promise<SessionSnapshot>;
  resolveHostDialog(input: ResolveHostDialogInput): Promise<void>;
  getPermissionSettings(): PermissionSettings;
  trustProjectPermissionRules(workspacePath: string): Promise<PermissionSettings>;
  updatePermissionSettings(input: UpdatePermissionSettingsInput): Promise<PermissionSettings>;
  listCredentialProviders(): Promise<CredentialProviderSummary[]>;
  importProviderApiKey(input: ImportProviderApiKeyInput): Promise<ImportProviderApiKeyResult>;
  listProviderAccounts(): Promise<ProviderAccountsResult>;
  startProviderLogin(input: StartProviderLoginInput): Promise<ProviderAuthFlowSnapshot>;
  respondProviderAuthPrompt(input: RespondProviderAuthPromptInput): Promise<ProviderAuthFlowSnapshot>;
  openProviderAuthLink(input: OpenProviderAuthLinkInput): Promise<void>;
  cancelProviderLogin(input: CancelProviderLoginInput): Promise<ProviderAuthFlowSnapshot>;
  logoutProvider(input: LogoutProviderInput): Promise<ProviderAccountsResult>;
  searchWorkspaceReferences(input: SearchWorkspaceReferencesInput): Promise<SearchWorkspaceReferencesResult>;
  subscribe(listener: (event: RuntimeEvent) => void): Unsubscribe;
  dispose(): Promise<void>;
}

export function createStubHarnessRuntime(): HarnessRuntime {
  return createDisposableStubHarnessRuntime();
}

export function createDisposableStubHarnessRuntime(options?: {
  onDispose?: () => Promise<void> | void;
  blockDispose?: Promise<void>;
}): HarnessRuntime & {
  readonly disposed: boolean;
  readonly disposeCount: number;
} {
  const state = { disposed: false, disposeCount: 0 };
  return {
    get disposed() {
      return state.disposed;
    },
    get disposeCount() {
      return state.disposeCount;
    },
    getCapabilities() {
      return { piRuntime: false };
    },
    getAgentDir() {
      throw unavailable("getAgentDir");
    },
    inspectWorkspace() {
      return Promise.reject(unavailable("inspectWorkspace"));
    },
    listWorkspaceSessions() {
      return Promise.reject(unavailable("listWorkspaceSessions"));
    },
    createSession() {
      return Promise.reject(unavailable("createSession"));
    },
    openSession() {
      return Promise.reject(unavailable("openSession"));
    },
    sendPrompt() {
      return Promise.reject(unavailable("sendPrompt"));
    },
    steerRun() {
      return Promise.reject(unavailable("steerRun"));
    },
    queueFollowUp() {
      return Promise.reject(unavailable("queueFollowUp"));
    },
    prepareImage() {
      return Promise.reject(unavailable("prepareImage"));
    },
    removePreparedImage() {
      return Promise.reject(unavailable("removePreparedImage"));
    },
    abortRun() {
      return Promise.reject(unavailable("abortRun"));
    },
    setSessionModel() {
      return Promise.reject(unavailable("setSessionModel"));
    },
    setThinkingLevel() {
      return Promise.reject(unavailable("setThinkingLevel"));
    },
    rewriteAssistantOutput() {
      return Promise.reject(unavailable("rewriteAssistantOutput"));
    },
    resolveHostDialog() {
      return Promise.reject(unavailable("resolveHostDialog"));
    },
    getPermissionSettings() {
      return emptySettingsSnapshot().permission;
    },
    updatePermissionSettings() {
      return Promise.reject(unavailable("updatePermissionSettings"));
    },
    trustProjectPermissionRules() {
      return Promise.reject(unavailable("trustProjectPermissionRules"));
    },
    listCredentialProviders() {
      return Promise.reject(unavailable("listCredentialProviders"));
    },
    importProviderApiKey() {
      return Promise.reject(unavailable("importProviderApiKey"));
    },
    listProviderAccounts() {
      return Promise.reject(unavailable("listProviderAccounts"));
    },
    startProviderLogin() {
      return Promise.reject(unavailable("startProviderLogin"));
    },
    respondProviderAuthPrompt() {
      return Promise.reject(unavailable("respondProviderAuthPrompt"));
    },
    openProviderAuthLink() {
      return Promise.reject(unavailable("openProviderAuthLink"));
    },
    cancelProviderLogin() {
      return Promise.reject(unavailable("cancelProviderLogin"));
    },
    logoutProvider() {
      return Promise.reject(unavailable("logoutProvider"));
    },
    searchWorkspaceReferences() {
      return Promise.reject(unavailable("searchWorkspaceReferences"));
    },
    subscribe() {
      return () => undefined;
    },
    async dispose() {
      if (state.disposed) {
        return;
      }

      if (options?.blockDispose) {
        await options.blockDispose;
      }

      state.disposed = true;
      state.disposeCount += 1;
      await options?.onDispose?.();
    },
  };
}

export function emptyStubFeatures(): FeatureSnapshot {
  return emptyFeatureSnapshot();
}

function unavailable(operation: string) {
  return createHarnessError({
    code: HARNESS_ERROR_CODES.runtimeUnavailable,
    message: "The Pi runtime is not connected.",
    operation,
  });
}
