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
  isSessionCatalogScope,
  isSessionKey,
  MAX_ASSISTANT_REWRITE_CHARS,
  MAX_PREPARED_IMAGES,
  MAX_PROVIDER_AUTH_VALUE,
  MAX_WORKSPACE_REFERENCE_QUERY,
  MAX_WORKSPACE_REFERENCE_RESULTS,
  MAX_WORKSPACE_REFERENCES_PER_PROMPT,
  MAX_GITHUB_PAT_CHARS,
  nodeVersionMeetsMinimum,
  type AbortRunInput,
  type ArchiveSessionInput,
  type BootstrapState,
  type CancelProviderLoginInput,
  type CredentialProviderSummary,
  type CreateSessionInput,
  type FeatureSnapshot,
  type GetSessionSnapshotInput,
  type HarnessSettingsSnapshot,
  type ImportProviderApiKeyInput,
  type ImportProviderApiKeyResult,
  type ListSessionCatalogInput,
  type ListWorkspaceSessionsInput,
  type LogoutProviderInput,
  type OpenProviderAuthLinkInput,
  type OpenRecentWorkspaceInput,
  type OpenSessionInput,
  type PrepareImageInput,
  type PreparedImageSummary,
  type PrepareRemoveArchivedSessionsInput,
  type PrepareRemoveArchivedSessionsResult,
  type PrepareRemoveProjectInput,
  type PrepareRemoveProjectResult,
  type PrepareRemoveSessionInput,
  type PrepareRemoveSessionResult,
  type PromptAdmission,
  type ProviderAccountsResult,
  type ProviderAuthFlowSnapshot,
  type QueueAdmission,
  type QueueFollowUpInput,
  type RecentWorkspaceRecord,
  type RemovePreparedImageInput,
  type RemoveArchivedSessionsInput,
  type RemoveArchivedSessionsResult,
  type RemoveProjectInput,
  type RemoveProjectResult,
  type RemoveSessionInput,
  type RemoveSessionResult,
  type ReorderRecentWorkspacesInput,
  type ResolveHostDialogInput,
  type RespondProviderAuthPromptInput,
  type RestoreSessionInput,
  type RewriteAssistantOutputInput,
  type RuntimeEvent,
  type SearchWorkspaceReferencesInput,
  type SearchWorkspaceReferencesResult,
  type SendPromptInput,
  type SessionCatalogEntry,
  type SessionKey,
  type SessionActivitySummary,
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
  type UpdateSkillSourceSettingsInput,
  type SkillSettingsSnapshot,
  type UpdateGitHubMcpSettingsInput,
  type ImportGitHubPatInput,
  type ImportGitHubPatResult,
  type GitHubMcpSettingsSnapshot,
  type WorkspaceReferenceToken,
  type WorkspaceSnapshot,
  RUNTIME_EVENT_TYPES,
  eventSessionKey,
  sessionKeyEquals,
  sessionKeyId,
} from "@pho-code/protocol";
import type { HarnessRuntime } from "@pho-code/runtime";
import {
  archiveSessionMetadata,
  forgetSessionLifecycle,
  forgetWorkspace,
  isPermissionWorkspaceTrusted,
  markSessionViewed,
  pruneOrphanSessionLifecycle,
  recordSessionOutcome,
  rememberWorkspace,
  reorderRecentWorkspaces as applyRecentWorkspaceOrder,
  restoreSessionMetadata,
  selectSession,
  setAppearance,
  setEnabledSkillSources,
  setGitHubMcpAccountLogin,
  setGitHubMcpEnabled,
  trustPermissionWorkspace,
  type AppMetadata,
  type AppMetadataStore,
} from "./metadata";
import {
  filterCatalogScope,
  isArchivedSession,
  isSelectedSession,
  projectCatalogActivity,
  projectCatalogEntry,
  selectedSessionKey,
} from "./session-catalog";

export interface ApplicationHostVersions {
  appVersion: string;
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
  listSessionCatalog(input: ListSessionCatalogInput): Promise<SessionCatalogEntry[]>;
  getSessionSnapshot(input: GetSessionSnapshotInput): Promise<SessionSnapshot>;
  createSession(input?: CreateSessionInput): Promise<SessionSnapshot>;
  openSession(input: OpenSessionInput): Promise<SessionSnapshot>;
  archiveSession(input: ArchiveSessionInput): Promise<SessionCatalogEntry>;
  restoreSession(input: RestoreSessionInput): Promise<SessionCatalogEntry>;
  prepareRemoveSession(input: PrepareRemoveSessionInput): Promise<PrepareRemoveSessionResult>;
  removeSession(input: RemoveSessionInput): Promise<RemoveSessionResult>;
  prepareRemoveProject(input: PrepareRemoveProjectInput): Promise<PrepareRemoveProjectResult>;
  removeProject(input: RemoveProjectInput): Promise<RemoveProjectResult>;
  prepareRemoveArchivedSessions(
    input: PrepareRemoveArchivedSessionsInput,
  ): Promise<PrepareRemoveArchivedSessionsResult>;
  removeArchivedSessions(input: RemoveArchivedSessionsInput): Promise<RemoveArchivedSessionsResult>;
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
  updateSkillSourceSettings(input: UpdateSkillSourceSettingsInput): Promise<HarnessSettingsSnapshot>;
  refreshSkills(): Promise<SkillSettingsSnapshot>;
  updateGitHubMcpSettings(input: UpdateGitHubMcpSettingsInput): Promise<HarnessSettingsSnapshot>;
  importGitHubPat(input: ImportGitHubPatInput): Promise<ImportGitHubPatResult>;
  removeGitHubPat(): Promise<GitHubMcpSettingsSnapshot>;
  subscribe(listener: (event: RuntimeEvent) => void): Unsubscribe;
  shutdown(): Promise<void>;
}

const MAX_PROMPT_LENGTH = 100_000;
const REMOVAL_TOKEN_TTL_MS = 30_000;

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
  input.runtime.setEnabledSkillSources(metadata.enabledSkillSources);
  let workspace: WorkspaceSnapshot | undefined;
  let session: SessionSnapshot | undefined;
  const pendingRemovals = new Map<string, { key: SessionKey; fingerprint: string; expiresAt: number }>();
  const pendingProjectRemovals = new Map<
    string,
    {
      workspaceId: string;
      sessions: Array<{ sessionId: string; fingerprint: string }>;
      expiresAt: number;
    }
  >();
  const pendingArchivedRemovals = new Map<
    string,
    {
      workspaceId: string;
      sessions: Array<{ sessionId: string; fingerprint: string }>;
      expiresAt: number;
    }
  >();

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
        appVersion: input.versions.appVersion,
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
        sessions: ordinarySessions(workspace?.sessions ?? session?.sessions ?? []),
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
      const sessions = ordinarySessions(await input.runtime.listWorkspaceSessions(path));
      assertJsonSafe(sessions, "listWorkspaceSessions");
      return sessions;
    },
    async listSessionCatalog(command: ListSessionCatalogInput) {
      assertActive();
      const workspaceId = requireNonEmptyString(command.workspaceId, "workspaceId", "listSessionCatalog");
      if (!isSessionCatalogScope(command.scope)) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "scope must be active, archived, or all.",
          operation: "listSessionCatalog",
          recoverable: true,
        });
      }
      const entries = await loadSessionCatalog(workspaceId, command.scope);
      assertJsonSafe(entries, "listSessionCatalog");
      return entries;
    },
    async getSessionSnapshot(command: GetSessionSnapshotInput) {
      assertActive();
      const key = requireSessionKey(command, "getSessionSnapshot");
      const snapshot = await input.runtime.getSessionSnapshot(key);
      if (isSelectedSession(selectedSessionKey(session), key)) {
        adoptSelectedSnapshot(snapshot);
      }
      assertJsonSafe(snapshot, "getSessionSnapshot");
      return snapshot;
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
      replaceSelectedSnapshot(snapshot);
      await persist(
        markSessionViewed(selectSession(metadata, snapshot.session.id), {
          workspaceId: snapshot.workspace.id,
          sessionId: snapshot.session.id,
        }, new Date().toISOString()),
      );
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
      replaceSelectedSnapshot(snapshot);
      await persist(
        markSessionViewed(selectSession(metadata, snapshot.session.id), {
          workspaceId: snapshot.workspace.id,
          sessionId: snapshot.session.id,
        }, new Date().toISOString()),
      );
      assertJsonSafe(snapshot, "openSession");
      return snapshot;
    },
    async archiveSession(command: ArchiveSessionInput) {
      assertActive();
      const key = requireSessionKey(command, "archiveSession");
      await persist(archiveSessionMetadata(metadata, key, new Date().toISOString()));
      const entry = await loadCatalogEntry(key);
      assertJsonSafe(entry, "archiveSession");
      return entry;
    },
    async restoreSession(command: RestoreSessionInput) {
      assertActive();
      const key = requireSessionKey(command, "restoreSession");
      await persist(restoreSessionMetadata(metadata, key));
      const entry = await loadCatalogEntry(key);
      assertJsonSafe(entry, "restoreSession");
      return entry;
    },
    async prepareRemoveSession(command: PrepareRemoveSessionInput) {
      assertActive();
      const key = requireSessionKey(command, "prepareRemoveSession");
      const inspected = await input.runtime.inspectRemovableSession(key);
      const entry = await loadCatalogEntry(key);
      const confirmationToken = crypto.randomUUID();
      const expiresAt = Date.now() + REMOVAL_TOKEN_TTL_MS;
      pendingRemovals.set(confirmationToken, {
        key,
        fingerprint: inspected.fingerprint,
        expiresAt,
      });
      const result: PrepareRemoveSessionResult = {
        workspaceId: key.workspaceId,
        sessionId: key.sessionId,
        title: inspected.title || entry.title,
        workspaceDisplayName: workspaceDisplayName(key.workspaceId),
        confirmationToken,
        sharedAgentDir: input.runtime.getPermissionSettings().appliesToSharedPiAgentDir === true,
        expiresAt: new Date(expiresAt).toISOString(),
      };
      assertJsonSafe(result, "prepareRemoveSession");
      return result;
    },
    async removeSession(command: RemoveSessionInput) {
      assertActive();
      const key = requireSessionKey(command, "removeSession");
      const confirmationToken = requireNonEmptyString(command.confirmationToken, "confirmationToken", "removeSession");
      const pending = pendingRemovals.get(confirmationToken);
      pendingRemovals.delete(confirmationToken);
      if (!pending || Date.now() > pending.expiresAt || !sessionKeyEquals(pending.key, key)) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "That removal confirmation expired. Prepare the chat again.",
          operation: "removeSession",
          recoverable: true,
        });
      }
      const removed = await input.runtime.removeValidatedSession({
        ...key,
        fingerprint: pending.fingerprint,
      });
      await persist(forgetSessionLifecycle(metadata, key));
      if (session && session.session.id === key.sessionId && session.workspace.id === key.workspaceId) {
        session = undefined;
      }
      const result: RemoveSessionResult = {
        workspaceId: key.workspaceId,
        sessionId: key.sessionId,
        title: removed.title,
        method: removed.method,
        recoverable: true,
      };
      assertJsonSafe(result, "removeSession");
      return result;
    },
    async prepareRemoveProject(command: PrepareRemoveProjectInput) {
      assertActive();
      const workspaceId = requireNonEmptyString(command.workspaceId, "workspaceId", "prepareRemoveProject");
      const record = metadata.recentWorkspaces.find((entry) => entry.id === workspaceId);
      if (!record) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.workspaceInaccessible,
          message: "That project is not in the recent list.",
          operation: "prepareRemoveProject",
          recoverable: true,
        });
      }
      const entries = await loadSessionCatalog(workspaceId, "all");
      const sessions: Array<{ sessionId: string; fingerprint: string }> = [];
      for (const entry of entries) {
        const inspected = await input.runtime.inspectRemovableSession({
          workspaceId,
          sessionId: entry.sessionId,
        });
        sessions.push({ sessionId: entry.sessionId, fingerprint: inspected.fingerprint });
      }
      const confirmationToken = crypto.randomUUID();
      const expiresAt = Date.now() + REMOVAL_TOKEN_TTL_MS;
      pendingProjectRemovals.set(confirmationToken, {
        workspaceId,
        sessions,
        expiresAt,
      });
      const result: PrepareRemoveProjectResult = {
        workspaceId,
        displayName: record.displayName,
        path: record.path,
        sessionCount: sessions.length,
        confirmationToken,
        sharedAgentDir: input.runtime.getPermissionSettings().appliesToSharedPiAgentDir === true,
        expiresAt: new Date(expiresAt).toISOString(),
      };
      assertJsonSafe(result, "prepareRemoveProject");
      return result;
    },
    async removeProject(command: RemoveProjectInput) {
      assertActive();
      const workspaceId = requireNonEmptyString(command.workspaceId, "workspaceId", "removeProject");
      const confirmationToken = requireNonEmptyString(command.confirmationToken, "confirmationToken", "removeProject");
      const pending = pendingProjectRemovals.get(confirmationToken);
      pendingProjectRemovals.delete(confirmationToken);
      if (!pending || Date.now() > pending.expiresAt || pending.workspaceId !== workspaceId) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "That removal confirmation expired. Prepare the project again.",
          operation: "removeProject",
          recoverable: true,
        });
      }
      let method = "macos-trash";
      for (const target of pending.sessions) {
        const removed = await input.runtime.removeValidatedSession({
          workspaceId,
          sessionId: target.sessionId,
          fingerprint: target.fingerprint,
        });
        method = removed.method;
        await persist(forgetSessionLifecycle(metadata, { workspaceId, sessionId: target.sessionId }));
      }
      await persist(forgetWorkspace(metadata, workspaceId));
      if (session?.workspace.id === workspaceId) {
        session = undefined;
      }
      if (workspace?.workspace.id === workspaceId) {
        workspace = undefined;
      }
      const result: RemoveProjectResult = {
        workspaceId,
        removedSessionCount: pending.sessions.length,
        method,
        recoverable: true,
        recentWorkspaces: metadata.recentWorkspaces,
      };
      assertJsonSafe(result, "removeProject");
      return result;
    },
    async prepareRemoveArchivedSessions(command: PrepareRemoveArchivedSessionsInput) {
      assertActive();
      const workspaceId = requireNonEmptyString(command.workspaceId, "workspaceId", "prepareRemoveArchivedSessions");
      const record = metadata.recentWorkspaces.find((entry) => entry.id === workspaceId);
      if (!record) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.workspaceInaccessible,
          message: "That project is not in the recent list.",
          operation: "prepareRemoveArchivedSessions",
          recoverable: true,
        });
      }
      const entries = await loadSessionCatalog(workspaceId, "archived");
      const sessions: Array<{ sessionId: string; fingerprint: string }> = [];
      for (const entry of entries) {
        const inspected = await input.runtime.inspectRemovableSession({
          workspaceId,
          sessionId: entry.sessionId,
        });
        sessions.push({ sessionId: entry.sessionId, fingerprint: inspected.fingerprint });
      }
      if (sessions.length === 0) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "That project has no archived chats to delete.",
          operation: "prepareRemoveArchivedSessions",
          recoverable: true,
        });
      }
      const confirmationToken = crypto.randomUUID();
      const expiresAt = Date.now() + REMOVAL_TOKEN_TTL_MS;
      pendingArchivedRemovals.set(confirmationToken, {
        workspaceId,
        sessions,
        expiresAt,
      });
      const result: PrepareRemoveArchivedSessionsResult = {
        workspaceId,
        displayName: record.displayName,
        path: record.path,
        sessionCount: sessions.length,
        confirmationToken,
        sharedAgentDir: input.runtime.getPermissionSettings().appliesToSharedPiAgentDir === true,
        expiresAt: new Date(expiresAt).toISOString(),
      };
      assertJsonSafe(result, "prepareRemoveArchivedSessions");
      return result;
    },
    async removeArchivedSessions(command: RemoveArchivedSessionsInput) {
      assertActive();
      const workspaceId = requireNonEmptyString(command.workspaceId, "workspaceId", "removeArchivedSessions");
      const confirmationToken = requireNonEmptyString(
        command.confirmationToken,
        "confirmationToken",
        "removeArchivedSessions",
      );
      const pending = pendingArchivedRemovals.get(confirmationToken);
      pendingArchivedRemovals.delete(confirmationToken);
      if (!pending || Date.now() > pending.expiresAt || pending.workspaceId !== workspaceId) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "That removal confirmation expired. Prepare the archived chats again.",
          operation: "removeArchivedSessions",
          recoverable: true,
        });
      }
      let method = "macos-trash";
      for (const target of pending.sessions) {
        const removed = await input.runtime.removeValidatedSession({
          workspaceId,
          sessionId: target.sessionId,
          fingerprint: target.fingerprint,
        });
        method = removed.method;
        await persist(forgetSessionLifecycle(metadata, { workspaceId, sessionId: target.sessionId }));
        if (session?.session.id === target.sessionId && session.workspace.id === workspaceId) {
          session = undefined;
        }
      }
      const result: RemoveArchivedSessionsResult = {
        workspaceId,
        removedSessionCount: pending.sessions.length,
        method,
        recoverable: true,
      };
      assertJsonSafe(result, "removeArchivedSessions");
      return result;
    },
    async sendPrompt(command: SendPromptInput) {
      assertActive();
      const scope = sessionCommandScope(command, "sendPrompt");
      const payload = parsePromptPayload(command, "sendPrompt");
      try {
        const admission = await input.runtime.sendPrompt({
          ...scope,
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
      const scope = sessionCommandScope(command, "steerRun");
      const runId = requireNonEmptyString(command.runId, "runId", "steerRun");
      const payload = parsePromptPayload(command, "steerRun");
      try {
        const admission = await input.runtime.steerRun({
          ...scope,
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
      const scope = sessionCommandScope(command, "queueFollowUp");
      const runId = requireNonEmptyString(command.runId, "runId", "queueFollowUp");
      const payload = parsePromptPayload(command, "queueFollowUp");
      try {
        const admission = await input.runtime.queueFollowUp({
          ...scope,
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
        const summary = await input.runtime.prepareImage({
          ...command,
          ...(command.sessionId
            ? sessionCommandScope(command as { sessionId: string; workspaceId?: string }, "prepareImage")
            : {}),
        });
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
        await input.runtime.removePreparedImage({
          imageId,
          ...(command.sessionId ? sessionCommandScope(command as { sessionId: string; workspaceId?: string }, "removePreparedImage") : {}),
        });
      } catch (error) {
        throw normalizeCommandError(error, "removePreparedImage");
      }
    },
    async abortRun(command: AbortRunInput) {
      assertActive();
      const scope = sessionCommandScope(command, "abortRun");
      const runId = requireNonEmptyString(command.runId, "runId", "abortRun");
      await input.runtime.abortRun({ ...scope, runId });
    },
    async setSessionModel(command: SetSessionModelInput) {
      assertActive();
      const scope = sessionCommandScope(command, "setSessionModel");
      const provider = requireNonEmptyString(command.provider, "provider", "setSessionModel");
      const id = requireNonEmptyString(command.id, "id", "setSessionModel");
      const snapshot = await input.runtime.setSessionModel({ ...scope, provider, id });
      adoptSelectedSnapshot(snapshot);
      assertJsonSafe(snapshot, "setSessionModel");
      return snapshot;
    },
    async setThinkingLevel(command: SetThinkingLevelInput) {
      assertActive();
      const scope = sessionCommandScope(command, "setThinkingLevel");
      if (!isThinkingLevel(command.level)) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "Unknown thinking level.",
          operation: "setThinkingLevel",
          recoverable: true,
        });
      }
      const snapshot = await input.runtime.setThinkingLevel({ ...scope, level: command.level });
      adoptSelectedSnapshot(snapshot);
      assertJsonSafe(snapshot, "setThinkingLevel");
      return snapshot;
    },
    async rewriteAssistantOutput(command: RewriteAssistantOutputInput) {
      assertActive();
      const scope = sessionCommandScope(command, "rewriteAssistantOutput");
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
      try {
        const snapshot = await input.runtime.rewriteAssistantOutput({
          ...scope,
          messageId,
          text: command.text,
        });
        adoptSelectedSnapshot(snapshot);
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
        ...(typeof command.sessionId === "string" && command.sessionId.trim() !== ""
          ? sessionCommandScope({ sessionId: command.sessionId, workspaceId: command.workspaceId }, "resolveHostDialog")
          : {}),
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
        skills: input.runtime.getSkillSettings(),
        githubMcp: input.runtime.getGitHubMcpSettings(),
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
        skills: input.runtime.getSkillSettings(),
        githubMcp: input.runtime.getGitHubMcpSettings(),
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
    async updateSkillSourceSettings(command: UpdateSkillSourceSettingsInput) {
      assertActive();
      const skills = await input.runtime.updateSkillSourceSettings(command);
      await persist(setEnabledSkillSources(metadata, skills.sources.filter((source) => source.enabled && source.sourceId !== "pho-code").map((source) => source.sourceId)));
      const snapshot = settingsSnapshot();
      assertJsonSafe(snapshot, "updateSkillSourceSettings");
      return snapshot;
    },
    async refreshSkills() {
      assertActive();
      const skills = await input.runtime.refreshSkills();
      assertJsonSafe(skills, "refreshSkills");
      return skills;
    },
    async updateGitHubMcpSettings(command: UpdateGitHubMcpSettingsInput) {
      assertActive();
      if (command.enabled === true && command.acknowledgedDisclosure !== true) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "Confirm the GitHub read-only disclosure before enabling GitHub MCP.",
          operation: "updateGitHubMcpSettings",
          recoverable: true,
        });
      }
      const githubMcp = await input.runtime.updateGitHubMcpSettings({ enabled: command.enabled === true });
      await persistGitHubMetadata(githubMcp);
      const snapshot = settingsSnapshot();
      assertJsonSafe(snapshot, "updateGitHubMcpSettings");
      return snapshot;
    },
    async importGitHubPat(command: ImportGitHubPatInput) {
      assertActive();
      const token = requireNonEmptyString(command.token, "token", "importGitHubPat");
      if (token.length > MAX_GITHUB_PAT_CHARS) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "That GitHub token is too long.",
          operation: "importGitHubPat",
          recoverable: true,
        });
      }
      const githubMcp = await input.runtime.importGitHubPat({ token });
      assertJsonSafe(githubMcp, "importGitHubPat");
      if (JSON.stringify(githubMcp).includes(token)) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidSnapshot,
          message: "GitHub PAT import refused to return a secret.",
          operation: "importGitHubPat",
        });
      }
      await persistGitHubMetadata(githubMcp);
      return { githubMcp };
    },
    async removeGitHubPat() {
      assertActive();
      const githubMcp = await input.runtime.removeGitHubPat();
      await persistGitHubMetadata(githubMcp);
      assertJsonSafe(githubMcp, "removeGitHubPat");
      return githubMcp;
    },
    subscribe(listener) {
      return input.runtime.subscribe((event) => {
        const selectedKey = selectedSessionKey(session);
        const eventKey = eventSessionKey(event);
        const matchesSelected =
          selectedKey !== undefined && eventKey !== undefined && sessionKeyEquals(selectedKey, eventKey);

        if (
          (event.type === RUNTIME_EVENT_TYPES.sessionSnapshot || event.type === RUNTIME_EVENT_TYPES.runSettled) &&
          matchesSelected
        ) {
          adoptSelectedSnapshot(event.payload as SessionSnapshot);
        }
        if (event.type === RUNTIME_EVENT_TYPES.featureSnapshot && matchesSelected && workspace) {
          const features = event.payload as FeatureSnapshot;
          workspace = { ...workspace, features };
          if (session) {
            session = { ...session, features };
          }
        }
        if (
          eventKey &&
          selectedKey &&
          !sessionKeyEquals(eventKey, selectedKey) &&
          (event.type === RUNTIME_EVENT_TYPES.runSettled || event.type === RUNTIME_EVENT_TYPES.runFailed)
        ) {
          const outcome =
            event.type === RUNTIME_EVENT_TYPES.runFailed
              ? "failed"
              : (event.payload as SessionSnapshot).run.status === "failed"
                ? "failed"
                : (event.payload as SessionSnapshot).run.status === "cancelled"
                  ? undefined
                  : "completed";
          if (outcome) {
            void persist(recordSessionOutcome(metadata, eventKey, outcome, event.occurredAt));
          }
        }
        if (event.type === RUNTIME_EVENT_TYPES.sessionRemoved) {
          const removed = event.payload as { workspaceId: string; sessionId: string };
          if (
            session &&
            session.session.id === removed.sessionId &&
            session.workspace.id === removed.workspaceId
          ) {
            session = undefined;
          }
        }
        if (event.type === RUNTIME_EVENT_TYPES.sessionActivity) {
          listener({
            ...event,
            payload: enrichActivity(event.payload as SessionCatalogEntry["activity"][]),
          });
          return;
        }
        listener(event);
      });
    },
    shutdown() {
      if (!shutdownAttempt) {
        pendingRemovals.clear();
        shutdownAttempt = input.runtime.dispose();
      }
      return shutdownAttempt;
    },
  };

  function settingsSnapshot(): HarnessSettingsSnapshot {
    return {
      appearance: appearanceFromMetadata(metadata),
      permission: decoratePermissionSettings(input.runtime.getPermissionSettings()),
      skills: input.runtime.getSkillSettings(),
      githubMcp: input.runtime.getGitHubMcpSettings(),
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

  async function persistGitHubMetadata(githubMcp: GitHubMcpSettingsSnapshot): Promise<void> {
    await persist(
      setGitHubMcpAccountLogin(setGitHubMcpEnabled(metadata, githubMcp.enabled), githubMcp.account.login),
    );
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

  function workspaceDisplayName(workspaceId: string): string {
    if (workspace?.workspace.id === workspaceId) {
      return workspace.workspace.displayName;
    }
    const record = metadata.recentWorkspaces.find((entry) => entry.id === workspaceId);
    return record?.displayName ?? workspaceId;
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

  function replaceSelectedSnapshot(snapshot: SessionSnapshot): void {
    session = snapshot;
    workspace = {
      workspace: snapshot.workspace,
      sessions: snapshot.sessions,
      models: snapshot.models,
      features: snapshot.features,
      ...(snapshot.modelError ? { modelError: snapshot.modelError } : {}),
    };
  }

  function adoptSelectedSnapshot(snapshot: SessionSnapshot): void {
    const selected = selectedSessionKey(session);
    const key = { workspaceId: snapshot.workspace.id, sessionId: snapshot.session.id };
    if (selected && !sessionKeyEquals(selected, key)) {
      return;
    }
    replaceSelectedSnapshot(snapshot);
  }

  function ordinarySessions(sessions: readonly SessionSummary[]): SessionSummary[] {
    return sessions.filter(
      (entry) => !isArchivedSession(metadata, { workspaceId: entry.workspaceId, sessionId: entry.id }),
    );
  }

  function enrichActivity(summaries: readonly SessionActivitySummary[]): SessionActivitySummary[] {
    const selected = selectedSessionKey(session);
    return summaries.map((summary) =>
      projectCatalogActivity(metadata, summary, summary, isSelectedSession(selected, summary)),
    );
  }

  async function loadSessionCatalog(workspaceId: string, scope: ListSessionCatalogInput["scope"]): Promise<SessionCatalogEntry[]> {
    const path = resolveWorkspacePath(workspaceId);
    const listed = await input.runtime.listWorkspaceSessions(path);
    const liveById = new Map(
      input.runtime.listSessionActivity().map((entry) => [sessionKeyId(entry), entry] as const),
    );
    const selected = selectedSessionKey(session);
    const known: SessionKey[] = [
      ...metadata.sessionLifecycle.filter((entry) => entry.workspaceId !== workspaceId),
      ...listed.map((entry) => ({ workspaceId: entry.workspaceId, sessionId: entry.id })),
    ];
    const pruned = pruneOrphanSessionLifecycle(metadata, known);
    if (pruned !== metadata) {
      void persist(pruned);
    }
    const entries = listed.map((entry) => {
      const key = { workspaceId: entry.workspaceId, sessionId: entry.id };
      return projectCatalogEntry(metadata, entry, liveById.get(sessionKeyId(key)), isSelectedSession(selected, key));
    });
    return filterCatalogScope(entries, scope);
  }

  async function loadCatalogEntry(key: SessionKey): Promise<SessionCatalogEntry> {
    const entries = await loadSessionCatalog(key.workspaceId, "all");
    const entry = entries.find((candidate) => sessionKeyEquals(candidate, key));
    if (!entry) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.sessionNotFound,
        message: "The selected session was not found.",
        operation: "sessionCatalog",
        recoverable: true,
      });
    }
    return entry;
  }

  function requireSessionKey(value: Partial<SessionKey>, operation: string): SessionKey {
    if (!isSessionKey(value)) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.invalidCommand,
        message: `${operation} requires workspaceId and sessionId.`,
        operation,
        recoverable: true,
      });
    }
    return value;
  }

  function sessionCommandScope(
    command: { sessionId: string; workspaceId?: string },
    operation: string,
  ): { sessionId: string; workspaceId?: string } {
    const sessionId = requireNonEmptyString(command.sessionId, "sessionId", operation);
    const workspaceId =
      typeof command.workspaceId === "string" && command.workspaceId.trim() !== ""
        ? command.workspaceId.trim()
        : undefined;
    return workspaceId ? { sessionId, workspaceId } : { sessionId };
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
