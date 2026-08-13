import {
  createHarnessError,
  HARNESS_ERROR_CODES,
  emptyFeatureSnapshot,
  emptySettingsSnapshot,
  type AbortRunInput,
  type CredentialProviderSummary,
  type FeatureSnapshot,
  type ImportProviderApiKeyInput,
  type ImportProviderApiKeyResult,
  type PermissionSettings,
  type PromptAdmission,
  type ResolveHostDialogInput,
  type RuntimeEvent,
  type SendPromptInput,
  type SessionSnapshot,
  type SessionSummary,
  type SetSessionModelInput,
  type SetThinkingLevelInput,
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
  abortRun(input: AbortRunInput): Promise<void>;
  setSessionModel(input: SetSessionModelInput): Promise<SessionSnapshot>;
  setThinkingLevel(input: SetThinkingLevelInput): Promise<SessionSnapshot>;
  resolveHostDialog(input: ResolveHostDialogInput): Promise<void>;
  getPermissionSettings(): PermissionSettings;
  updatePermissionSettings(input: UpdatePermissionSettingsInput): Promise<PermissionSettings>;
  listCredentialProviders(): Promise<CredentialProviderSummary[]>;
  importProviderApiKey(input: ImportProviderApiKeyInput): Promise<ImportProviderApiKeyResult>;
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
    abortRun() {
      return Promise.reject(unavailable("abortRun"));
    },
    setSessionModel() {
      return Promise.reject(unavailable("setSessionModel"));
    },
    setThinkingLevel() {
      return Promise.reject(unavailable("setThinkingLevel"));
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
    listCredentialProviders() {
      return Promise.reject(unavailable("listCredentialProviders"));
    },
    importProviderApiKey() {
      return Promise.reject(unavailable("importProviderApiKey"));
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
