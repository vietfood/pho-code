import {
  INTENDED_PI_SDK,
  PINNED_ELECTRON,
  PROTOCOL_VERSION,
  assertJsonSafe,
  createHarnessError,
  HARNESS_ERROR_CODES,
  isHarnessError,
  isManagedPermissionProfileId,
  isThinkingLevel,
  isThemePreference,
  nodeVersionMeetsMinimum,
  type AbortRunInput,
  type BootstrapState,
  type CredentialProviderSummary,
  type CreateSessionInput,
  type FeatureSnapshot,
  type HarnessSettingsSnapshot,
  type ImportProviderApiKeyInput,
  type ImportProviderApiKeyResult,
  type ListWorkspaceSessionsInput,
  type OpenRecentWorkspaceInput,
  type OpenSessionInput,
  type PromptAdmission,
  type ResolveHostDialogInput,
  type RuntimeEvent,
  type SendPromptInput,
  type SessionSnapshot,
  type SessionSummary,
  type SetSessionModelInput,
  type SetThinkingLevelInput,
  type ThemePreference,
  type Unsubscribe,
  type UpdateAppearanceSettingsInput,
  type UpdatePermissionSettingsInput,
  type WorkspaceSnapshot,
} from "@pho-code/protocol";
import type { HarnessRuntime } from "@pho-code/runtime";
import { rememberWorkspace, selectSession, setAppearanceTheme, type AppMetadata, type AppMetadataStore } from "./metadata";

export interface ApplicationHostVersions {
  electron: string;
  embeddedNode: string;
}

export interface AppearanceHost {
  applyTheme(theme: ThemePreference): void;
}

export interface ApplicationService {
  getBootstrapState(): BootstrapState;
  openPickedWorkspace(path: string): Promise<WorkspaceSnapshot>;
  openRecentWorkspace(input: OpenRecentWorkspaceInput): Promise<WorkspaceSnapshot>;
  listWorkspaceSessions(input: ListWorkspaceSessionsInput): Promise<SessionSummary[]>;
  createSession(input?: CreateSessionInput): Promise<SessionSnapshot>;
  openSession(input: OpenSessionInput): Promise<SessionSnapshot>;
  sendPrompt(input: SendPromptInput): Promise<PromptAdmission>;
  abortRun(input: AbortRunInput): Promise<void>;
  setSessionModel(input: SetSessionModelInput): Promise<SessionSnapshot>;
  setThinkingLevel(input: SetThinkingLevelInput): Promise<SessionSnapshot>;
  resolveHostDialog(input: ResolveHostDialogInput): Promise<void>;
  getSettings(): HarnessSettingsSnapshot;
  updateAppearanceSettings(input: UpdateAppearanceSettingsInput): Promise<HarnessSettingsSnapshot>;
  updatePermissionSettings(input: UpdatePermissionSettingsInput): Promise<HarnessSettingsSnapshot>;
  listCredentialProviders(): Promise<CredentialProviderSummary[]>;
  importProviderApiKey(input: ImportProviderApiKeyInput): Promise<ImportProviderApiKeyResult>;
  subscribe(listener: (event: RuntimeEvent) => void): Unsubscribe;
  shutdown(): Promise<void>;
}

const MAX_PROMPT_LENGTH = 100_000;

export function createApplicationService(input: {
  runtime: HarnessRuntime;
  versions: ApplicationHostVersions;
  metadataStore: AppMetadataStore;
  appearanceHost?: AppearanceHost;
}): ApplicationService {
  let shutdownAttempt: Promise<void> | undefined;
  let metadata = input.metadataStore.load();
  input.appearanceHost?.applyTheme(metadata.theme);
  let workspace: WorkspaceSnapshot | undefined;
  let session: SessionSnapshot | undefined;

  function assertActive(): void {
    if (shutdownAttempt) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.shuttingDown,
        message: "The application is shutting down.",
        operation: "command",
      });
    }
  }

  async function persist(next: AppMetadata): Promise<void> {
    metadata = next;
    await input.metadataStore.save(next);
  }

  return {
    getBootstrapState() {
      assertActive();
      const capabilities = input.runtime.getCapabilities();
      const embeddedNodeCompatible = nodeVersionMeetsMinimum(
        input.versions.embeddedNode,
        PINNED_ELECTRON.minimumEmbeddedNode,
      );
      const state: BootstrapState = {
        protocolVersion: PROTOCOL_VERSION,
        appName: "Pho Code",
        milestone: capabilities.piRuntime ? "vertical-slice" : "bootstrap",
        capabilities: {
          piRuntime: capabilities.piRuntime,
        },
        versions: {
          electron: input.versions.electron,
          embeddedNode: input.versions.embeddedNode,
        },
        embeddedNodeCompatible,
        intendedPiSdk: {
          packageName: INTENDED_PI_SDK.packageName,
          version: INTENDED_PI_SDK.version,
          enginesNode: INTENDED_PI_SDK.enginesNode,
        },
        recentWorkspaces: metadata.recentWorkspaces,
        models: workspace?.models ?? session?.models ?? [],
        sessions: workspace?.sessions ?? session?.sessions ?? [],
      };
      if (workspace?.features) {
        state.features = workspace.features;
      } else if (session?.features) {
        state.features = session.features;
      }
      if (workspace) {
        state.selectedWorkspace = workspace.workspace;
      }
      if (workspace?.modelError) {
        state.modelError = workspace.modelError;
      }
      if (session?.modelError) {
        state.modelError = session.modelError;
      }
      if (session) {
        state.activeSession = session;
      }
      assertJsonSafe(state, "getBootstrapState");
      return state;
    },
    async openPickedWorkspace(path: string) {
      assertActive();
      requireNonEmptyString(path, "path", "openPickedWorkspace");
      const snapshot = await input.runtime.inspectWorkspace({
        path,
        approveProjectResources: true,
      });
      workspace = snapshot;
      session = undefined;
      await persist(
        selectSession(
          rememberWorkspace(metadata, {
            id: snapshot.workspace.id,
            path: snapshot.workspace.path,
            displayName: snapshot.workspace.displayName,
            lastOpenedAt: snapshot.workspace.lastOpenedAt,
          }),
          undefined,
        ),
      );
      assertJsonSafe(snapshot, "openPickedWorkspace");
      return snapshot;
    },
    async openRecentWorkspace(command: OpenRecentWorkspaceInput) {
      assertActive();
      const workspaceId = requireNonEmptyString(command.workspaceId, "workspaceId", "openRecentWorkspace");
      const record = metadata.recentWorkspaces.find((entry) => entry.id === workspaceId);
      if (!record) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.workspaceInaccessible,
          message: "That workspace is not in the recent list.",
          operation: "openRecentWorkspace",
          recoverable: true,
        });
      }
      const snapshot = await input.runtime.inspectWorkspace({
        path: record.path,
        approveProjectResources: false,
      });
      workspace = snapshot;
      session = undefined;
      await persist(
        selectSession(
          rememberWorkspace(metadata, {
            id: snapshot.workspace.id,
            path: snapshot.workspace.path,
            displayName: snapshot.workspace.displayName,
            lastOpenedAt: snapshot.workspace.lastOpenedAt,
          }),
          undefined,
        ),
      );
      assertJsonSafe(snapshot, "openRecentWorkspace");
      return snapshot;
    },
    async listWorkspaceSessions(command: ListWorkspaceSessionsInput) {
      assertActive();
      const workspaceId = requireNonEmptyString(command.workspaceId, "workspaceId", "listWorkspaceSessions");
      const path = resolveWorkspacePath(workspaceId);
      const sessions = await input.runtime.listWorkspaceSessions(path);
      assertJsonSafe(sessions, "listWorkspaceSessions");
      return sessions;
    },
    async createSession(command: CreateSessionInput = {}) {
      assertActive();
      if (typeof command.workspaceId === "string" && command.workspaceId.trim() !== "") {
        await ensureWorkspaceSelected(command.workspaceId.trim(), "createSession");
      }
      if (!workspace) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.workspaceNotSelected,
          message: "Select a workspace before creating a session.",
          operation: "createSession",
          recoverable: true,
        });
      }
      const snapshot = await input.runtime.createSession(workspace.workspace.id);
      session = snapshot;
      workspace = {
        workspace: snapshot.workspace,
        sessions: snapshot.sessions,
        models: snapshot.models,
        features: snapshot.features,
        ...(snapshot.modelError ? { modelError: snapshot.modelError } : {}),
      };
      await persist(selectSession(metadata, snapshot.session.id));
      assertJsonSafe(snapshot, "createSession");
      return snapshot;
    },
    async openSession(command: OpenSessionInput) {
      assertActive();
      const sessionId = requireNonEmptyString(command.sessionId, "sessionId", "openSession");
      if (typeof command.workspaceId === "string" && command.workspaceId.trim() !== "") {
        await ensureWorkspaceSelected(command.workspaceId.trim(), "openSession");
      }
      if (!workspace) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.workspaceNotSelected,
          message: "Select a workspace before opening a session.",
          operation: "openSession",
          recoverable: true,
        });
      }
      const snapshot = await input.runtime.openSession(workspace.workspace.id, sessionId);
      session = snapshot;
      workspace = {
        workspace: snapshot.workspace,
        sessions: snapshot.sessions,
        models: snapshot.models,
        features: snapshot.features,
        ...(snapshot.modelError ? { modelError: snapshot.modelError } : {}),
      };
      await persist(selectSession(metadata, snapshot.session.id));
      assertJsonSafe(snapshot, "openSession");
      return snapshot;
    },
    async sendPrompt(command: SendPromptInput) {
      assertActive();
      const sessionId = requireNonEmptyString(command.sessionId, "sessionId", "sendPrompt");
      const text = requireNonEmptyString(command.text, "text", "sendPrompt");
      if (text.length > MAX_PROMPT_LENGTH) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "The prompt is too long.",
          operation: "sendPrompt",
          recoverable: true,
        });
      }
      if (!session || session.session.id !== sessionId) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionNotFound,
          message: "Open a session before sending a prompt.",
          operation: "sendPrompt",
          recoverable: true,
        });
      }
      try {
        const admission = await input.runtime.sendPrompt({ sessionId, text });
        assertJsonSafe(admission, "sendPrompt");
        return admission;
      } catch (error) {
        throw normalizeCommandError(error, "sendPrompt");
      }
    },
    async abortRun(command: AbortRunInput) {
      assertActive();
      const sessionId = requireNonEmptyString(command.sessionId, "sessionId", "abortRun");
      const runId = requireNonEmptyString(command.runId, "runId", "abortRun");
      await input.runtime.abortRun({ sessionId, runId });
    },
    async setSessionModel(command: SetSessionModelInput) {
      assertActive();
      const sessionId = requireNonEmptyString(command.sessionId, "sessionId", "setSessionModel");
      const provider = requireNonEmptyString(command.provider, "provider", "setSessionModel");
      const id = requireNonEmptyString(command.id, "id", "setSessionModel");
      if (!session || session.session.id !== sessionId) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionNotFound,
          message: "Open a session before changing the model.",
          operation: "setSessionModel",
          recoverable: true,
        });
      }
      const snapshot = await input.runtime.setSessionModel({ sessionId, provider, id });
      session = snapshot;
      workspace = {
        workspace: snapshot.workspace,
        sessions: snapshot.sessions,
        models: snapshot.models,
        features: snapshot.features,
        ...(snapshot.modelError ? { modelError: snapshot.modelError } : {}),
      };
      assertJsonSafe(snapshot, "setSessionModel");
      return snapshot;
    },
    async setThinkingLevel(command: SetThinkingLevelInput) {
      assertActive();
      const sessionId = requireNonEmptyString(command.sessionId, "sessionId", "setThinkingLevel");
      if (!isThinkingLevel(command.level)) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "Unknown thinking level.",
          operation: "setThinkingLevel",
          recoverable: true,
        });
      }
      if (!session || session.session.id !== sessionId) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionNotFound,
          message: "Open a session before changing the thinking level.",
          operation: "setThinkingLevel",
          recoverable: true,
        });
      }
      const snapshot = await input.runtime.setThinkingLevel({ sessionId, level: command.level });
      session = snapshot;
      workspace = {
        workspace: snapshot.workspace,
        sessions: snapshot.sessions,
        models: snapshot.models,
        features: snapshot.features,
        ...(snapshot.modelError ? { modelError: snapshot.modelError } : {}),
      };
      assertJsonSafe(snapshot, "setThinkingLevel");
      return snapshot;
    },
    async resolveHostDialog(command: ResolveHostDialogInput) {
      assertActive();
      const requestId = requireNonEmptyString(command.requestId, "requestId", "resolveHostDialog");
      await input.runtime.resolveHostDialog({
        requestId,
        ...(command.cancelled === true ? { cancelled: true } : {}),
        ...(command.confirmed === true ? { confirmed: true } : {}),
        ...(typeof command.selected === "string" ? { selected: command.selected } : {}),
        ...(typeof command.value === "string" ? { value: command.value } : {}),
      });
    },
    getSettings() {
      assertActive();
      const snapshot = settingsSnapshot();
      assertJsonSafe(snapshot, "getSettings");
      return snapshot;
    },
    async updateAppearanceSettings(command: UpdateAppearanceSettingsInput) {
      assertActive();
      if (!isThemePreference(command.theme)) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "Unknown appearance theme.",
          operation: "updateAppearanceSettings",
          recoverable: true,
        });
      }
      await persist(setAppearanceTheme(metadata, command.theme));
      input.appearanceHost?.applyTheme(command.theme);
      const snapshot = settingsSnapshot();
      assertJsonSafe(snapshot, "updateAppearanceSettings");
      return snapshot;
    },
    async updatePermissionSettings(command: UpdatePermissionSettingsInput) {
      assertActive();
      const patch: UpdatePermissionSettingsInput = {};
      if (command.profile !== undefined) {
        if (!isManagedPermissionProfileId(command.profile)) {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.invalidCommand,
            message: "Choose Guarded or Balanced to replace a custom permission policy.",
            operation: "updatePermissionSettings",
            recoverable: true,
          });
        }
        patch.profile = command.profile;
      }
      if (command.yoloMode !== undefined) {
        if (typeof command.yoloMode !== "boolean") {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.invalidCommand,
            message: "yoloMode must be a boolean.",
            operation: "updatePermissionSettings",
            recoverable: true,
          });
        }
        patch.yoloMode = command.yoloMode;
      }
      if (command.permissionReviewLog !== undefined) {
        if (typeof command.permissionReviewLog !== "boolean") {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.invalidCommand,
            message: "permissionReviewLog must be a boolean.",
            operation: "updatePermissionSettings",
            recoverable: true,
          });
        }
        patch.permissionReviewLog = command.permissionReviewLog;
      }
      if (patch.profile === undefined && patch.yoloMode === undefined && patch.permissionReviewLog === undefined) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "No permission settings were provided.",
          operation: "updatePermissionSettings",
          recoverable: true,
        });
      }
      const permission = await input.runtime.updatePermissionSettings(patch);
      const snapshot: HarnessSettingsSnapshot = {
        appearance: { theme: metadata.theme },
        permission,
      };
      assertJsonSafe(snapshot, "updatePermissionSettings");
      return snapshot;
    },
    async listCredentialProviders() {
      assertActive();
      const providers = await input.runtime.listCredentialProviders();
      assertJsonSafe(providers, "listCredentialProviders");
      return providers;
    },
    async importProviderApiKey(command: ImportProviderApiKeyInput) {
      assertActive();
      const providerId = requireNonEmptyString(command.providerId, "providerId", "importProviderApiKey");
      const apiKey = requireNonEmptyString(command.apiKey, "apiKey", "importProviderApiKey");
      const result = await input.runtime.importProviderApiKey({ providerId, apiKey });
      assertJsonSafe(result, "importProviderApiKey");
      if (JSON.stringify(result).includes(apiKey)) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidSnapshot,
          message: "Credential import refused to return a secret.",
          operation: "importProviderApiKey",
        });
      }
      return result;
    },
    subscribe(listener) {
      return input.runtime.subscribe((event) => {
        if (event.type === "sessionSnapshot" || event.type === "runSettled") {
          session = event.payload as SessionSnapshot;
          workspace = {
            workspace: session.workspace,
            sessions: session.sessions,
            models: session.models,
            features: session.features,
            ...(session.modelError ? { modelError: session.modelError } : {}),
          };
        }
        if (event.type === "featureSnapshot" && workspace) {
          const features = event.payload as FeatureSnapshot;
          workspace = { ...workspace, features };
          if (session) {
            session = { ...session, features };
          }
        }
        listener(event);
      });
    },
    shutdown() {
      if (!shutdownAttempt) {
        shutdownAttempt = input.runtime.dispose();
      }
      return shutdownAttempt;
    },
  };

  function settingsSnapshot(): HarnessSettingsSnapshot {
    return {
      appearance: { theme: metadata.theme },
      permission: input.runtime.getPermissionSettings(),
    };
  }

  function resolveWorkspacePath(workspaceId: string): string {
    if (workspace?.workspace.id === workspaceId) {
      return workspace.workspace.path;
    }
    const record = metadata.recentWorkspaces.find((entry) => entry.id === workspaceId);
    if (record) {
      return record.path;
    }
    return workspaceId;
  }

  async function ensureWorkspaceSelected(workspaceId: string, operation: string): Promise<void> {
    if (workspace?.workspace.id === workspaceId) {
      return;
    }
    const path = resolveWorkspacePath(workspaceId);
    try {
      const snapshot = await input.runtime.inspectWorkspace({
        path,
        approveProjectResources: false,
      });
      workspace = snapshot;
      session = undefined;
      await persist(
        selectSession(
          rememberWorkspace(metadata, {
            id: snapshot.workspace.id,
            path: snapshot.workspace.path,
            displayName: snapshot.workspace.displayName,
            lastOpenedAt: snapshot.workspace.lastOpenedAt,
          }),
          undefined,
        ),
      );
    } catch (error) {
      if (isHarnessError(error)) {
        throw error;
      }
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.workspaceInaccessible,
        message: "That workspace is not available.",
        operation,
        recoverable: true,
      });
    }
  }
}

export function untrustedSenderError(operation: string) {
  return createHarnessError({
    code: HARNESS_ERROR_CODES.untrustedSender,
    message: "The renderer is not allowed to invoke this command.",
    operation,
    recoverable: false,
  });
}

function requireNonEmptyString(value: unknown, field: string, operation: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: `${field} is required.`,
      operation,
      recoverable: true,
    });
  }
  return value.trim();
}

function normalizeCommandError(error: unknown, operation: string) {
  if (isHarnessError(error)) {
    return error;
  }
  return createHarnessError({
    code: HARNESS_ERROR_CODES.runFailed,
    message: error instanceof Error ? error.message : "The command failed.",
    operation,
    recoverable: true,
  });
}
