import {
  INTENDED_PI_SDK,
  PINNED_ELECTRON,
  PROTOCOL_VERSION,
  assertJsonSafe,
  createHarnessError,
  HARNESS_ERROR_CODES,
  isHarnessError,
  isAppearanceMode,
  isAppearancePalette,
  isChatFontSize,
  isGlassStrength,
  isManagedPermissionProfileId,
  isProviderAuthMethod,
  isThinkingLevel,
  isUiFontSize,
  isWorkspaceReferenceToken,
  MAX_ASSISTANT_REWRITE_CHARS,
  MAX_PREPARED_IMAGES,
  MAX_PROVIDER_AUTH_VALUE,
  MAX_WORKSPACE_REFERENCE_QUERY,
  MAX_WORKSPACE_REFERENCE_RESULTS,
  MAX_WORKSPACE_REFERENCES_PER_PROMPT,
  nodeVersionMeetsMinimum,
  type AbortRunInput,
  type BootstrapState,
  type CancelProviderLoginInput,
  type CredentialProviderSummary,
  type CreateSessionInput,
  type FeatureSnapshot,
  type HarnessSettingsSnapshot,
  type ImportProviderApiKeyInput,
  type ImportProviderApiKeyResult,
  type ListWorkspaceSessionsInput,
  type LogoutProviderInput,
  type OpenProviderAuthLinkInput,
  type OpenRecentWorkspaceInput,
  type OpenSessionInput,
  type PrepareImageInput,
  type PreparedImageSummary,
  type PromptAdmission,
  type ProviderAccountsResult,
  type ProviderAuthFlowSnapshot,
  type QueueAdmission,
  type QueueFollowUpInput,
  type RecentWorkspaceRecord,
  type RemovePreparedImageInput,
  type ReorderRecentWorkspacesInput,
  type ResolveHostDialogInput,
  type RespondProviderAuthPromptInput,
  type RewriteAssistantOutputInput,
  type RuntimeEvent,
  type SearchWorkspaceReferencesInput,
  type SearchWorkspaceReferencesResult,
  type SendPromptInput,
  type SessionSnapshot,
  type SessionSummary,
  type AppearanceMode,
  type AppearancePalette,
  type AppearanceSettings,
  type SetSessionModelInput,
  type SetThinkingLevelInput,
  type StartProviderLoginInput,
  type SteerRunInput,
  type Unsubscribe,
  type UpdateAppearanceSettingsInput,
  type UpdatePermissionSettingsInput,
  type WorkspaceReferenceToken,
  type WorkspaceSnapshot,
} from "@pho-code/protocol";
import type { HarnessRuntime } from "@pho-code/runtime";
import {
  isPermissionWorkspaceTrusted,
  rememberWorkspace,
  reorderRecentWorkspaces as applyRecentWorkspaceOrder,
  selectSession,
  setAppearance,
  trustPermissionWorkspace,
  type AppMetadata,
  type AppMetadataStore,
} from "./metadata";

export interface ApplicationHostVersions {
  electron: string;
  embeddedNode: string;
}

export interface AppearanceHost {
  applyAppearance(appearance: Pick<AppearanceSettings, "palette" | "mode" | "glassEnabled" | "glassStrength">): void;
}

export interface ApplicationService {
  getBootstrapState(): BootstrapState;
  openPickedWorkspace(path: string): Promise<WorkspaceSnapshot>;
  openRecentWorkspace(input: OpenRecentWorkspaceInput): Promise<WorkspaceSnapshot>;
  reorderRecentWorkspaces(input: ReorderRecentWorkspacesInput): Promise<RecentWorkspaceRecord[]>;
  listWorkspaceSessions(input: ListWorkspaceSessionsInput): Promise<SessionSummary[]>;
  createSession(input?: CreateSessionInput): Promise<SessionSnapshot>;
  openSession(input: OpenSessionInput): Promise<SessionSnapshot>;
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
  getSettings(): HarnessSettingsSnapshot;
  updateAppearanceSettings(input: UpdateAppearanceSettingsInput): Promise<HarnessSettingsSnapshot>;
  updatePermissionSettings(input: UpdatePermissionSettingsInput): Promise<HarnessSettingsSnapshot>;
  trustProjectPermissionRules(): Promise<HarnessSettingsSnapshot>;
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
  input.appearanceHost?.applyAppearance({
    palette: metadata.palette,
    mode: metadata.mode,
    glassEnabled: metadata.glassEnabled,
    glassStrength: metadata.glassStrength,
  });
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
        approveProjectResources: isPermissionWorkspaceTrusted(metadata, record.id),
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
    async reorderRecentWorkspaces(command: ReorderRecentWorkspacesInput) {
      assertActive();
      if (!Array.isArray(command.workspaceIds) || command.workspaceIds.some((id) => typeof id !== "string" || id.trim() === "")) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "workspaceIds must be a non-empty list of workspace ids.",
          operation: "reorderRecentWorkspaces",
          recoverable: true,
        });
      }
      const next = applyRecentWorkspaceOrder(
        metadata,
        command.workspaceIds.map((id) => id.trim()),
      );
      if (next === metadata) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "workspaceIds must be a permutation of the current recent workspaces.",
          operation: "reorderRecentWorkspaces",
          recoverable: true,
        });
      }
      await persist(next);
      const records = next.recentWorkspaces;
      assertJsonSafe(records, "reorderRecentWorkspaces");
      return records;
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
      const payload = parsePromptPayload(command, "sendPrompt");
      requireOpenSession(session, sessionId, "sendPrompt");
      try {
        const admission = await input.runtime.sendPrompt({
          sessionId,
          ...payload,
        });
        assertJsonSafe(admission, "sendPrompt");
        return admission;
      } catch (error) {
        throw normalizeCommandError(error, "sendPrompt");
      }
    },
    async steerRun(command: SteerRunInput) {
      assertActive();
      const sessionId = requireNonEmptyString(command.sessionId, "sessionId", "steerRun");
      const runId = requireNonEmptyString(command.runId, "runId", "steerRun");
      const payload = parsePromptPayload(command, "steerRun");
      requireOpenSession(session, sessionId, "steerRun");
      try {
        const admission = await input.runtime.steerRun({
          sessionId,
          runId,
          ...payload,
        });
        assertJsonSafe(admission, "steerRun");
        return admission;
      } catch (error) {
        throw normalizeCommandError(error, "steerRun");
      }
    },
    async queueFollowUp(command: QueueFollowUpInput) {
      assertActive();
      const sessionId = requireNonEmptyString(command.sessionId, "sessionId", "queueFollowUp");
      const runId = requireNonEmptyString(command.runId, "runId", "queueFollowUp");
      const payload = parsePromptPayload(command, "queueFollowUp");
      requireOpenSession(session, sessionId, "queueFollowUp");
      try {
        const admission = await input.runtime.queueFollowUp({
          sessionId,
          runId,
          ...payload,
        });
        assertJsonSafe(admission, "queueFollowUp");
        return admission;
      } catch (error) {
        throw normalizeCommandError(error, "queueFollowUp");
      }
    },
    async prepareImage(command: PrepareImageInput) {
      assertActive();
      try {
        const summary = await input.runtime.prepareImage(command);
        assertJsonSafe(summary, "prepareImage");
        return summary;
      } catch (error) {
        throw normalizeCommandError(error, "prepareImage");
      }
    },
    async removePreparedImage(command: RemovePreparedImageInput) {
      assertActive();
      const imageId = requireNonEmptyString(command.imageId, "imageId", "removePreparedImage");
      try {
        await input.runtime.removePreparedImage({ imageId });
      } catch (error) {
        throw normalizeCommandError(error, "removePreparedImage");
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
    async rewriteAssistantOutput(command: RewriteAssistantOutputInput) {
      assertActive();
      const sessionId = requireNonEmptyString(command.sessionId, "sessionId", "rewriteAssistantOutput");
      const messageId = requireNonEmptyString(command.messageId, "messageId", "rewriteAssistantOutput");
      if (typeof command.text !== "string") {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "Rewritten text is required.",
          operation: "rewriteAssistantOutput",
          recoverable: true,
        });
      }
      if (command.text.length > MAX_ASSISTANT_REWRITE_CHARS) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "The rewritten text is too long.",
          operation: "rewriteAssistantOutput",
          recoverable: true,
        });
      }
      if (!session || session.session.id !== sessionId) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.sessionNotFound,
          message: "Open a session before rewriting assistant output.",
          operation: "rewriteAssistantOutput",
          recoverable: true,
        });
      }
      try {
        const snapshot = await input.runtime.rewriteAssistantOutput({
          sessionId,
          messageId,
          text: command.text,
        });
        session = snapshot;
        workspace = {
          workspace: snapshot.workspace,
          sessions: snapshot.sessions,
          models: snapshot.models,
          features: snapshot.features,
          ...(snapshot.modelError ? { modelError: snapshot.modelError } : {}),
        };
        assertJsonSafe(snapshot, "rewriteAssistantOutput");
        return snapshot;
      } catch (error) {
        throw normalizeCommandError(error, "rewriteAssistantOutput");
      }
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
      const patch: {
        palette?: AppearancePalette;
        mode?: AppearanceMode;
        glassEnabled?: boolean;
        glassStrength?: number;
        uiFontSize?: number;
        chatFontSize?: number;
      } = {};
      if (command.palette !== undefined) {
        if (!isAppearancePalette(command.palette)) {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.invalidCommand,
            message: "Unknown appearance palette.",
            operation: "updateAppearanceSettings",
            recoverable: true,
          });
        }
        patch.palette = command.palette;
      }
      if (command.mode !== undefined) {
        if (!isAppearanceMode(command.mode)) {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.invalidCommand,
            message: "Unknown appearance mode.",
            operation: "updateAppearanceSettings",
            recoverable: true,
          });
        }
        patch.mode = command.mode;
      }
      if (command.glassEnabled !== undefined) {
        if (typeof command.glassEnabled !== "boolean") {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.invalidCommand,
            message: "glassEnabled must be a boolean.",
            operation: "updateAppearanceSettings",
            recoverable: true,
          });
        }
        patch.glassEnabled = command.glassEnabled;
      }
      if (command.glassStrength !== undefined) {
        if (!isGlassStrength(command.glassStrength)) {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.invalidCommand,
            message: "Glass strength must be an integer between 0 and 100.",
            operation: "updateAppearanceSettings",
            recoverable: true,
          });
        }
        patch.glassStrength = command.glassStrength;
      }
      if (command.uiFontSize !== undefined) {
        if (!isUiFontSize(command.uiFontSize)) {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.invalidCommand,
            message: "UI font size must be an integer between 12 and 20.",
            operation: "updateAppearanceSettings",
            recoverable: true,
          });
        }
        patch.uiFontSize = command.uiFontSize;
      }
      if (command.chatFontSize !== undefined) {
        if (!isChatFontSize(command.chatFontSize)) {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.invalidCommand,
            message: "Chat font size must be an integer between 12 and 20.",
            operation: "updateAppearanceSettings",
            recoverable: true,
          });
        }
        patch.chatFontSize = command.chatFontSize;
      }
      if (
        patch.palette === undefined &&
        patch.mode === undefined &&
        patch.glassEnabled === undefined &&
        patch.glassStrength === undefined &&
        patch.uiFontSize === undefined &&
        patch.chatFontSize === undefined
      ) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "No appearance settings were provided.",
          operation: "updateAppearanceSettings",
          recoverable: true,
        });
      }
      await persist(setAppearance(metadata, patch));
      input.appearanceHost?.applyAppearance({
        palette: metadata.palette,
        mode: metadata.mode,
        glassEnabled: metadata.glassEnabled,
        glassStrength: metadata.glassStrength,
      });
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
            message:
              "Choose baby (strict), okay, you got it, or with great power comes great responsibility to replace a custom permission policy.",
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
      const permission = decoratePermissionSettings(await input.runtime.updatePermissionSettings(patch));
      const snapshot: HarnessSettingsSnapshot = {
        appearance: appearanceFromMetadata(metadata),
        permission,
      };
      assertJsonSafe(snapshot, "updatePermissionSettings");
      return snapshot;
    },
    async trustProjectPermissionRules() {
      assertActive();
      if (!workspace) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "Select a workspace before trusting its project permission rules.",
          operation: "trustProjectPermissionRules",
          recoverable: true,
        });
      }
      const permission = await input.runtime.trustProjectPermissionRules(workspace.workspace.path);
      await persist(trustPermissionWorkspace(metadata, workspace.workspace.id));
      workspace = {
        ...workspace,
        workspace: { ...workspace.workspace, projectResourcesApproved: true },
      };
      if (session) {
        session = {
          ...session,
          workspace: { ...session.workspace, projectResourcesApproved: true },
        };
      }
      const snapshot: HarnessSettingsSnapshot = {
        appearance: appearanceFromMetadata(metadata),
        permission: { ...permission, projectPermissionRulesRemembered: true },
      };
      assertJsonSafe(snapshot, "trustProjectPermissionRules");
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
    async listProviderAccounts() {
      assertActive();
      const result = await input.runtime.listProviderAccounts();
      assertJsonSafe(result, "listProviderAccounts");
      return result;
    },
    async startProviderLogin(command: StartProviderLoginInput) {
      assertActive();
      const providerId = requireNonEmptyString(command.providerId, "providerId", "startProviderLogin");
      if (!isProviderAuthMethod(command.method)) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "method must be api_key or oauth.",
          operation: "startProviderLogin",
          recoverable: true,
        });
      }
      const snapshot = await input.runtime.startProviderLogin({ providerId, method: command.method });
      assertJsonSafe(snapshot, "startProviderLogin");
      return snapshot;
    },
    async respondProviderAuthPrompt(command: RespondProviderAuthPromptInput) {
      assertActive();
      const flowId = requireNonEmptyString(command.flowId, "flowId", "respondProviderAuthPrompt");
      const promptId = requireNonEmptyString(command.promptId, "promptId", "respondProviderAuthPrompt");
      if (typeof command.value !== "string") {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "value is required.",
          operation: "respondProviderAuthPrompt",
          recoverable: true,
        });
      }
      if (command.value.length > MAX_PROVIDER_AUTH_VALUE) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "That response is too long.",
          operation: "respondProviderAuthPrompt",
          recoverable: true,
        });
      }
      const snapshot = await input.runtime.respondProviderAuthPrompt({
        flowId,
        promptId,
        value: command.value,
      });
      assertJsonSafe(snapshot, "respondProviderAuthPrompt");
      if (command.value.length >= 8 && JSON.stringify(snapshot).includes(command.value)) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidSnapshot,
          message: "Login prompt refused to return a secret.",
          operation: "respondProviderAuthPrompt",
        });
      }
      return snapshot;
    },
    async openProviderAuthLink(command: OpenProviderAuthLinkInput) {
      assertActive();
      const flowId = requireNonEmptyString(command.flowId, "flowId", "openProviderAuthLink");
      const linkId = requireNonEmptyString(command.linkId, "linkId", "openProviderAuthLink");
      await input.runtime.openProviderAuthLink({ flowId, linkId });
    },
    async cancelProviderLogin(command: CancelProviderLoginInput) {
      assertActive();
      const flowId = requireNonEmptyString(command.flowId, "flowId", "cancelProviderLogin");
      const snapshot = await input.runtime.cancelProviderLogin({ flowId });
      assertJsonSafe(snapshot, "cancelProviderLogin");
      return snapshot;
    },
    async logoutProvider(command: LogoutProviderInput) {
      assertActive();
      const providerId = requireNonEmptyString(command.providerId, "providerId", "logoutProvider");
      const result = await input.runtime.logoutProvider({ providerId });
      assertJsonSafe(result, "logoutProvider");
      return result;
    },
    async searchWorkspaceReferences(command: SearchWorkspaceReferencesInput) {
      assertActive();
      if (!workspace) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.workspaceNotSelected,
          message: "Select a workspace before searching files.",
          operation: "searchWorkspaceReferences",
          recoverable: true,
        });
      }
      const query = typeof command.query === "string" ? command.query.slice(0, MAX_WORKSPACE_REFERENCE_QUERY) : "";
      const limit =
        typeof command.limit === "number" && Number.isFinite(command.limit)
          ? Math.max(1, Math.min(Math.floor(command.limit), MAX_WORKSPACE_REFERENCE_RESULTS))
          : undefined;
      const result = await input.runtime.searchWorkspaceReferences({
        query,
        ...(command.kinds ? { kinds: command.kinds } : {}),
        ...(limit !== undefined ? { limit } : {}),
      });
      assertJsonSafe(result, "searchWorkspaceReferences");
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
      appearance: appearanceFromMetadata(metadata),
      permission: decoratePermissionSettings(input.runtime.getPermissionSettings()),
    };
  }

  function decoratePermissionSettings(permission: HarnessSettingsSnapshot["permission"]) {
    const workspaceId = workspace?.workspace.id;
    return {
      ...permission,
      projectPermissionRulesRemembered: workspaceId
        ? isPermissionWorkspaceTrusted(metadata, workspaceId)
        : false,
    };
  }

  function appearanceFromMetadata(current: AppMetadata) {
    return {
      palette: current.palette,
      mode: current.mode,
      glassEnabled: current.glassEnabled,
      glassStrength: current.glassStrength,
      uiFontSize: current.uiFontSize,
      chatFontSize: current.chatFontSize,
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
        approveProjectResources: isPermissionWorkspaceTrusted(metadata, workspaceId),
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

function parseWorkspaceReferences(
  value: unknown,
  operation: string,
): WorkspaceReferenceToken[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidWorkspaceReference,
      message: "Workspace references must be an array.",
      operation,
      recoverable: true,
    });
  }
  if (value.length > MAX_WORKSPACE_REFERENCES_PER_PROMPT) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidWorkspaceReference,
      message: `A prompt can include at most ${MAX_WORKSPACE_REFERENCES_PER_PROMPT} workspace references.`,
      operation,
      recoverable: true,
    });
  }
  return value.map((entry) => {
    if (!isWorkspaceReferenceToken(entry)) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.invalidWorkspaceReference,
        message: "Each workspace reference must include a relative path.",
        operation,
        recoverable: true,
      });
    }
    return { path: entry.path.trim(), kind: entry.kind };
  });
}

function parseImageIds(value: unknown, operation: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidImage,
      message: "Image ids must be an array.",
      operation,
      recoverable: true,
    });
  }
  if (value.length > MAX_PREPARED_IMAGES) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidImage,
      message: `A prompt can include at most ${MAX_PREPARED_IMAGES} images.`,
      operation,
      recoverable: true,
    });
  }
  return value.map((entry) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.invalidImage,
        message: "Each image id must be a non-empty string.",
        operation,
        recoverable: true,
      });
    }
    return entry.trim();
  });
}

function parsePromptPayload(
  command: { text?: string; references?: unknown; imageIds?: unknown },
  operation: string,
): { text: string; references?: WorkspaceReferenceToken[]; imageIds?: string[] } {
  const text = typeof command.text === "string" ? command.text : "";
  const references = parseWorkspaceReferences(command.references, operation);
  const imageIds = parseImageIds(command.imageIds, operation);
  if (text.trim() === "" && references.length === 0 && imageIds.length === 0) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "A prompt, workspace reference, or image is required.",
      operation,
      recoverable: true,
    });
  }
  if (text.length > MAX_PROMPT_LENGTH) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "The prompt is too long.",
      operation,
      recoverable: true,
    });
  }
  return {
    text,
    ...(references.length > 0 ? { references } : {}),
    ...(imageIds.length > 0 ? { imageIds } : {}),
  };
}

function requireOpenSession(
  session: SessionSnapshot | undefined,
  sessionId: string,
  operation: string,
): void {
  if (!session || session.session.id !== sessionId) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.sessionNotFound,
      message: "Open a session before sending a prompt.",
      operation,
      recoverable: true,
    });
  }
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
