import {
  INTENDED_PI_SDK,
  PINNED_ELECTRON,
  PROTOCOL_VERSION,
  createHarnessError,
  failCommand,
  HARNESS_ERROR_CODES,
  isHarnessError,
  isAppearanceMode,
  isAppearancePalette,
  isChatFontSize,
  isGlassStrength,
  isManagedPermissionProfileId,
  isProviderAuthMethod,
  isThinkingLevel,
  isSessionAgentMode,
  planDocumentTooLarge,
  isUiFontSize,
  isWorkEntryIconPack,
  sanitizeFontFamilyName,
  isWorkspaceReferenceToken,
  isSessionCatalogScope,
  isSessionKey,
  MAX_ASSISTANT_REWRITE_CHARS,
  MAX_CONTEXT_PROMPT_PREAMBLE_CHARS,
  MAX_PREPARED_IMAGES,
  MAX_PROVIDER_AUTH_VALUE,
  MAX_WORKSPACE_REFERENCE_QUERY,
  MAX_WORKSPACE_REFERENCE_RESULTS,
  MAX_WORKSPACE_REFERENCES_PER_PROMPT,
  MAX_GITHUB_PAT_CHARS,
  nodeVersionMeetsMinimum,
  parseAskUserAnswers,
  parseSandboxSettingsPatch,
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
  type PiRuntimeStatusSnapshot,
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
  type UpdateSessionContextPromptInput,
  type RuntimeEvent,
  type SearchWorkspaceReferencesInput,
  type SearchWorkspaceReferencesResult,
  type SendPromptInput,
  type SessionCatalogEntry,
  type SessionKey,
  type SessionActivitySummary,
  type SessionSnapshot,
  type SessionSummary,
  type AppearanceSettings,
  type SetSessionModelInput,
  type SetThinkingLevelInput,
  type SetSessionModeInput,
  type UpdateSessionPlanDocumentInput,
  type ExecuteSessionPlanInput,
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
  type UpdateSandboxSettingsInput,
  type WorkspaceReferenceToken,
  type WorkspaceSnapshot,
  type ApproveChangesInput,
  type ApplyUndoChangesInput,
  type ChangeDiffPage,
  type ChangeFileViewPage,
  type ChangeReviewSetSnapshot,
  type GetChangeDiffInput,
  type GetChangeFileViewInput,
  type GetChangeReviewSetInput,
  type PrepareUndoChangesInput,
  type UndoPreview,
  RUNTIME_EVENT_TYPES,
  eventSessionKey,
  parseChangeDiffCursor,
  parseChangeFileViewCursor,
  requireChangeContextLines,
  requireChangePreviewToken,
  requireChangeRelativePath,
  requireChangeRelativePaths,
  requireChangeRevision,
  requireChangeScope,
  isChangeFileVersion,
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
import type { ApplicationRuntimeHost } from "./runtime-host";

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
  setSessionMode(input: SetSessionModeInput): Promise<SessionSnapshot>;
  updateSessionPlanDocument(input: UpdateSessionPlanDocumentInput): Promise<SessionSnapshot>;
  executeSessionPlan(input: ExecuteSessionPlanInput): Promise<SessionSnapshot>;
  rewriteAssistantOutput(input: RewriteAssistantOutputInput): Promise<SessionSnapshot>;
  updateSessionContextPrompt(input: UpdateSessionContextPromptInput): Promise<SessionSnapshot>;
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
  updateSandboxSettings(input: UpdateSandboxSettingsInput): Promise<HarnessSettingsSnapshot>;
  importGitHubPat(input: ImportGitHubPatInput): Promise<ImportGitHubPatResult>;
  removeGitHubPat(): Promise<GitHubMcpSettingsSnapshot>;
  getChangeReviewSet(input: GetChangeReviewSetInput): Promise<ChangeReviewSetSnapshot>;
  getChangeDiff(input: GetChangeDiffInput): Promise<ChangeDiffPage>;
  getChangeFileView(input: GetChangeFileViewInput): Promise<ChangeFileViewPage>;
  approveChanges(input: ApproveChangesInput): Promise<ChangeReviewSetSnapshot>;
  prepareUndoChanges(input: PrepareUndoChangesInput): Promise<UndoPreview>;
  applyUndoChanges(input: ApplyUndoChangesInput): Promise<ChangeReviewSetSnapshot>;
  subscribe(listener: (event: RuntimeEvent) => void): Unsubscribe;
  shutdown(): Promise<void>;
}

const MAX_PROMPT_LENGTH = 100_000;
const REMOVAL_TOKEN_TTL_MS = 30_000;

/** Single-use, expiring confirmation tokens for destructive removals. */
function createPendingRemovalStore<T>(expiredMessage: string) {
  const pending = new Map<string, { value: T; expiresAt: number }>();
  return {
    mint(value: T): { confirmationToken: string; expiresAt: string } {
      const confirmationToken = crypto.randomUUID();
      const expiresAt = Date.now() + REMOVAL_TOKEN_TTL_MS;
      pending.set(confirmationToken, { value, expiresAt });
      return { confirmationToken, expiresAt: new Date(expiresAt).toISOString() };
    },
    redeem(token: string, operation: string, matches: (value: T) => boolean): T {
      const entry = pending.get(token);
      pending.delete(token);
      if (!entry || Date.now() > entry.expiresAt || !matches(entry.value)) {
        failCommand(operation, expiredMessage);
      }
      return entry.value;
    },
    clear(): void {
      pending.clear();
    },
  };
}

type PendingSessionRemoval = { key: SessionKey; fingerprint: string };
type PendingBulkRemoval = {
  workspaceId: string;
  sessions: Array<{ backendId?: string; sessionId: string; fingerprint: string }>;
};

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
  const sessionRemovals = createPendingRemovalStore<PendingSessionRemoval>(
    "That removal confirmation expired. Prepare the chat again.",
  );
  const projectRemovals = createPendingRemovalStore<PendingBulkRemoval>(
    "That removal confirmation expired. Prepare the project again.",
  );
  const archivedRemovals = createPendingRemovalStore<PendingBulkRemoval>(
    "That removal confirmation expired. Prepare the archived chats again.",
  );

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

  async function selectWorkspaceSnapshot(snapshot: WorkspaceSnapshot): Promise<WorkspaceSnapshot> {
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
    return snapshot;
  }

  function requireRecentWorkspace(workspaceId: string, operation: string): RecentWorkspaceRecord {
    const record = metadata.recentWorkspaces.find((entry) => entry.id === workspaceId);
    if (!record) {
      failCommand(operation, "That project is not in the recent list.", HARNESS_ERROR_CODES.workspaceInaccessible);
    }
    return record;
  }

  async function collectRemovableSessions(
    workspaceId: string,
    scope: ListSessionCatalogInput["scope"],
  ): Promise<PendingBulkRemoval["sessions"]> {
    const entries = await loadSessionCatalog(workspaceId, scope);
    const sessions: PendingBulkRemoval["sessions"] = [];
    for (const entry of entries) {
      const inspected = await input.runtime.inspectRemovableSession({
        ...(entry.backendId ? { backendId: entry.backendId } : {}),
        workspaceId,
        sessionId: entry.sessionId,
      });
      sessions.push({
        ...(entry.backendId ? { backendId: entry.backendId } : {}),
        sessionId: entry.sessionId,
        fingerprint: inspected.fingerprint,
      });
    }
    return sessions;
  }

  async function removeValidatedBulk(pending: PendingBulkRemoval): Promise<string> {
    let method = "macos-trash";
    for (const target of pending.sessions) {
      const removed = await input.runtime.removeValidatedSession({
        ...(target.backendId ? { backendId: target.backendId } : {}),
        workspaceId: pending.workspaceId,
        sessionId: target.sessionId,
        fingerprint: target.fingerprint,
      });
      method = removed.method;
      await persist(forgetSessionLifecycle(metadata, {
        ...(target.backendId ? { backendId: target.backendId } : {}),
        workspaceId: pending.workspaceId,
        sessionId: target.sessionId,
      }));
    }
    return method;
  }

  const service: ApplicationService = {
    getBootstrapState() {
      assertActive();
      const capabilities = input.runtime.getCapabilities();
      const piRuntime = runtimeStatus(input.runtime, capabilities.piRuntime);
      const state: BootstrapState = {
        protocolVersion: PROTOCOL_VERSION,
        appName: "Pho Code",
        appVersion: input.versions.appVersion,
        milestone: piRuntime.status === "ready" ? "vertical-slice" : "bootstrap",
        capabilities: {
          piRuntime: piRuntime.status === "ready",
        },
        piRuntime,
        versions: {
          electron: input.versions.electron,
          embeddedNode: input.versions.embeddedNode,
        },
        embeddedNodeCompatible: nodeVersionMeetsMinimum(
          input.versions.embeddedNode,
          PINNED_ELECTRON.minimumEmbeddedNode,
        ),
        intendedPiSdk: {
          packageName: INTENDED_PI_SDK.packageName,
          version: INTENDED_PI_SDK.version,
          enginesNode: INTENDED_PI_SDK.enginesNode,
        },
        recentWorkspaces: metadata.recentWorkspaces,
        agentBackends: input.runtime.listAgentBackends(),
        models: workspace?.models ?? session?.models ?? [],
        sessions: ordinarySessions(workspace?.sessions ?? session?.sessions ?? []),
      };
      const features = workspace?.features ?? session?.features;
      if (features) {
        state.features = features;
      }
      if (workspace) {
        state.selectedWorkspace = workspace.workspace;
      }
      const modelError = session?.modelError ?? workspace?.modelError;
      if (modelError) {
        state.modelError = modelError;
      }
      if (session) {
        state.activeSession = session;
      }
      return state;
    },
    async openPickedWorkspace(path: string) {
      assertActive();
      requireNonEmptyString(path, "path", "openPickedWorkspace");
      return selectWorkspaceSnapshot(
        await input.runtime.inspectWorkspace({ path, approveProjectResources: true }),
      );
    },
    async openRecentWorkspace(command: OpenRecentWorkspaceInput) {
      assertActive();
      const workspaceId = requireNonEmptyString(command.workspaceId, "workspaceId", "openRecentWorkspace");
      const record = metadata.recentWorkspaces.find((entry) => entry.id === workspaceId);
      if (!record) {
        failCommand("openRecentWorkspace", "That workspace is not in the recent list.", HARNESS_ERROR_CODES.workspaceInaccessible);
      }
      return selectWorkspaceSnapshot(
        await input.runtime.inspectWorkspace({
          path: record.path,
          approveProjectResources: isPermissionWorkspaceTrusted(metadata, record.id),
        }),
      );
    },
    async reorderRecentWorkspaces(command: ReorderRecentWorkspacesInput) {
      assertActive();
      if (!Array.isArray(command.workspaceIds) || command.workspaceIds.some((id) => typeof id !== "string" || id.trim() === "")) {
        failCommand("reorderRecentWorkspaces", "workspaceIds must be a non-empty list of workspace ids.");
      }
      const next = applyRecentWorkspaceOrder(
        metadata,
        command.workspaceIds.map((id) => id.trim()),
      );
      if (next === metadata) {
        failCommand("reorderRecentWorkspaces", "workspaceIds must be a permutation of the current recent workspaces.");
      }
      await persist(next);
      return next.recentWorkspaces;
    },
    async listWorkspaceSessions(command: ListWorkspaceSessionsInput) {
      assertActive();
      const workspaceId = requireNonEmptyString(command.workspaceId, "workspaceId", "listWorkspaceSessions");
      return ordinarySessions(await input.runtime.listWorkspaceSessions(resolveWorkspacePath(workspaceId)));
    },
    async listSessionCatalog(command: ListSessionCatalogInput) {
      assertActive();
      const workspaceId = requireNonEmptyString(command.workspaceId, "workspaceId", "listSessionCatalog");
      if (!isSessionCatalogScope(command.scope)) {
        failCommand("listSessionCatalog", "scope must be active, archived, or all.");
      }
      return loadSessionCatalog(workspaceId, command.scope);
    },
    async getSessionSnapshot(command: GetSessionSnapshotInput) {
      assertActive();
      const key = requireSessionKey(command, "getSessionSnapshot");
      const snapshot = await input.runtime.getSessionSnapshot(key);
      if (isSelectedSession(selectedSessionKey(session), key)) {
        adoptSelectedSnapshot(snapshot);
      }
      return snapshot;
    },
    async createSession(command: CreateSessionInput = {}) {
      assertActive();
      if (typeof command.workspaceId === "string" && command.workspaceId.trim() !== "") {
        await ensureWorkspaceSelected(command.workspaceId.trim(), "createSession");
      }
      if (!workspace) {
        failCommand("createSession", "Select a workspace before creating a session.", HARNESS_ERROR_CODES.workspaceNotSelected);
      }
      const snapshot = await input.runtime.createSession(workspace.workspace.id, command.backendId);
      replaceSelectedSnapshot(snapshot);
      await persist(
        markSessionViewed(selectSession(metadata, snapshot.session.id, snapshot.session.backendId), {
          ...(snapshot.session.backendId ? { backendId: snapshot.session.backendId } : {}),
          workspaceId: snapshot.workspace.id,
          sessionId: snapshot.session.id,
        }, new Date().toISOString()),
      );
      return snapshot;
    },
    async openSession(command: OpenSessionInput) {
      assertActive();
      const sessionId = requireNonEmptyString(command.sessionId, "sessionId", "openSession");
      if (typeof command.workspaceId === "string" && command.workspaceId.trim() !== "") {
        await ensureWorkspaceSelected(command.workspaceId.trim(), "openSession");
      }
      if (!workspace) {
        failCommand("openSession", "Select a workspace before opening a session.", HARNESS_ERROR_CODES.workspaceNotSelected);
      }
      const snapshot = await input.runtime.openSession(workspace.workspace.id, sessionId, command.backendId);
      replaceSelectedSnapshot(snapshot);
      await persist(
        markSessionViewed(selectSession(metadata, snapshot.session.id, snapshot.session.backendId), {
          ...(snapshot.session.backendId ? { backendId: snapshot.session.backendId } : {}),
          workspaceId: snapshot.workspace.id,
          sessionId: snapshot.session.id,
        }, new Date().toISOString()),
      );
      return snapshot;
    },
    async archiveSession(command: ArchiveSessionInput) {
      assertActive();
      const key = requireSessionKey(command, "archiveSession");
      await persist(archiveSessionMetadata(metadata, key, new Date().toISOString()));
      return loadCatalogEntry(key);
    },
    async restoreSession(command: RestoreSessionInput) {
      assertActive();
      const key = requireSessionKey(command, "restoreSession");
      await persist(restoreSessionMetadata(metadata, key));
      return loadCatalogEntry(key);
    },
    async prepareRemoveSession(command: PrepareRemoveSessionInput) {
      assertActive();
      const key = requireSessionKey(command, "prepareRemoveSession");
      const inspected = await input.runtime.inspectRemovableSession(key);
      const entry = await loadCatalogEntry(key);
      const { confirmationToken, expiresAt } = sessionRemovals.mint({ key, fingerprint: inspected.fingerprint });
      return {
        ...(key.backendId ? { backendId: key.backendId } : {}),
        workspaceId: key.workspaceId,
        sessionId: key.sessionId,
        title: inspected.title || entry.title,
        workspaceDisplayName: workspaceDisplayName(key.workspaceId),
        confirmationToken,
        sharedAgentDir: input.runtime.getPermissionSettings().appliesToSharedPiAgentDir === true,
        expiresAt,
      };
    },
    async removeSession(command: RemoveSessionInput) {
      assertActive();
      const key = requireSessionKey(command, "removeSession");
      const token = requireNonEmptyString(command.confirmationToken, "confirmationToken", "removeSession");
      const pending = sessionRemovals.redeem(token, "removeSession", (value) => sessionKeyEquals(value.key, key));
      const removed = await input.runtime.removeValidatedSession({ ...key, fingerprint: pending.fingerprint });
      await persist(forgetSessionLifecycle(metadata, key));
      if (sessionKeyEquals(selectedSessionKey(session) ?? key, key)) {
        session = undefined;
      }
      return {
        ...(key.backendId ? { backendId: key.backendId } : {}),
        workspaceId: key.workspaceId,
        sessionId: key.sessionId,
        title: removed.title,
        method: removed.method,
        recoverable: true,
      };
    },
    async prepareRemoveProject(command: PrepareRemoveProjectInput) {
      assertActive();
      const workspaceId = requireNonEmptyString(command.workspaceId, "workspaceId", "prepareRemoveProject");
      const record = requireRecentWorkspace(workspaceId, "prepareRemoveProject");
      const sessions = await collectRemovableSessions(workspaceId, "all");
      const { confirmationToken, expiresAt } = projectRemovals.mint({ workspaceId, sessions });
      return {
        workspaceId,
        displayName: record.displayName,
        path: record.path,
        sessionCount: sessions.length,
        confirmationToken,
        sharedAgentDir: input.runtime.getPermissionSettings().appliesToSharedPiAgentDir === true,
        expiresAt,
      };
    },
    async removeProject(command: RemoveProjectInput) {
      assertActive();
      const workspaceId = requireNonEmptyString(command.workspaceId, "workspaceId", "removeProject");
      const token = requireNonEmptyString(command.confirmationToken, "confirmationToken", "removeProject");
      const pending = projectRemovals.redeem(token, "removeProject", (value) => value.workspaceId === workspaceId);
      const method = await removeValidatedBulk(pending);
      await persist(forgetWorkspace(metadata, workspaceId));
      if (session?.workspace.id === workspaceId) {
        session = undefined;
      }
      if (workspace?.workspace.id === workspaceId) {
        workspace = undefined;
      }
      return {
        workspaceId,
        removedSessionCount: pending.sessions.length,
        method,
        recoverable: true,
        recentWorkspaces: metadata.recentWorkspaces,
      };
    },
    async prepareRemoveArchivedSessions(command: PrepareRemoveArchivedSessionsInput) {
      assertActive();
      const workspaceId = requireNonEmptyString(command.workspaceId, "workspaceId", "prepareRemoveArchivedSessions");
      const record = requireRecentWorkspace(workspaceId, "prepareRemoveArchivedSessions");
      const sessions = await collectRemovableSessions(workspaceId, "archived");
      if (sessions.length === 0) {
        failCommand("prepareRemoveArchivedSessions", "That project has no archived chats to delete.");
      }
      const { confirmationToken, expiresAt } = archivedRemovals.mint({ workspaceId, sessions });
      return {
        workspaceId,
        displayName: record.displayName,
        path: record.path,
        sessionCount: sessions.length,
        confirmationToken,
        sharedAgentDir: input.runtime.getPermissionSettings().appliesToSharedPiAgentDir === true,
        expiresAt,
      };
    },
    async removeArchivedSessions(command: RemoveArchivedSessionsInput) {
      assertActive();
      const workspaceId = requireNonEmptyString(command.workspaceId, "workspaceId", "removeArchivedSessions");
      const token = requireNonEmptyString(command.confirmationToken, "confirmationToken", "removeArchivedSessions");
      const pending = archivedRemovals.redeem(token, "removeArchivedSessions", (value) => value.workspaceId === workspaceId);
      const method = await removeValidatedBulk(pending);
      if (
        session &&
        session.workspace.id === workspaceId &&
        pending.sessions.some((target) => sessionKeyEquals(
          {
            ...(target.backendId ? { backendId: target.backendId } : {}),
            workspaceId,
            sessionId: target.sessionId,
          },
          selectedSessionKey(session)!,
        ))
      ) {
        session = undefined;
      }
      return {
        workspaceId,
        removedSessionCount: pending.sessions.length,
        method,
        recoverable: true,
      };
    },
    async sendPrompt(command: SendPromptInput) {
      assertActive();
      const scope = sessionCommandScope(command, "sendPrompt");
      const payload = parsePromptPayload(command, "sendPrompt");
      try {
        return await input.runtime.sendPrompt({ ...scope, ...payload });
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
        return await input.runtime.steerRun({ ...scope, runId, ...payload });
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
        return await input.runtime.queueFollowUp({ ...scope, runId, ...payload });
      } catch (error) {
        throw normalizeCommandError(error, "queueFollowUp");
      }
    },
    async prepareImage(command: PrepareImageInput) {
      assertActive();
      try {
        return await input.runtime.prepareImage({
          ...command,
          ...(command.sessionId
            ? sessionCommandScope(command as { sessionId: string; workspaceId?: string }, "prepareImage")
            : {}),
        });
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
      return snapshot;
    },
    async setThinkingLevel(command: SetThinkingLevelInput) {
      assertActive();
      const scope = sessionCommandScope(command, "setThinkingLevel");
      if (!isThinkingLevel(command.level)) {
        failCommand("setThinkingLevel", "Unknown thinking level.");
      }
      const snapshot = await input.runtime.setThinkingLevel({ ...scope, level: command.level });
      adoptSelectedSnapshot(snapshot);
      return snapshot;
    },
    async setSessionMode(command: SetSessionModeInput) {
      assertActive();
      const scope = sessionCommandScope(command, "setSessionMode");
      if (!isSessionAgentMode(command.mode)) {
        failCommand("setSessionMode", "Unknown session mode.");
      }
      try {
        const snapshot = await input.runtime.setSessionMode({ ...scope, mode: command.mode });
        adoptSelectedSnapshot(snapshot);
        return snapshot;
      } catch (error) {
        throw normalizeCommandError(error, "setSessionMode");
      }
    },
    async updateSessionPlanDocument(command: UpdateSessionPlanDocumentInput) {
      assertActive();
      const scope = sessionCommandScope(command, "updateSessionPlanDocument");
      if (typeof command.documentMarkdown !== "string") {
        failCommand("updateSessionPlanDocument", "Plan document markdown is required.");
      }
      if (planDocumentTooLarge(command.documentMarkdown)) {
        failCommand("updateSessionPlanDocument", "The Plan document is too large.");
      }
      try {
        const snapshot = await input.runtime.updateSessionPlanDocument({
          ...scope,
          documentMarkdown: command.documentMarkdown,
        });
        adoptSelectedSnapshot(snapshot);
        return snapshot;
      } catch (error) {
        throw normalizeCommandError(error, "updateSessionPlanDocument");
      }
    },
    async executeSessionPlan(command: ExecuteSessionPlanInput) {
      assertActive();
      const scope = sessionCommandScope(command, "executeSessionPlan");
      try {
        const snapshot = await input.runtime.executeSessionPlan(scope);
        adoptSelectedSnapshot(snapshot);
        return snapshot;
      } catch (error) {
        throw normalizeCommandError(error, "executeSessionPlan");
      }
    },
    async rewriteAssistantOutput(command: RewriteAssistantOutputInput) {
      assertActive();
      const scope = sessionCommandScope(command, "rewriteAssistantOutput");
      const messageId = requireNonEmptyString(command.messageId, "messageId", "rewriteAssistantOutput");
      if (typeof command.text !== "string") {
        failCommand("rewriteAssistantOutput", "Rewritten text is required.");
      }
      if (command.text.length > MAX_ASSISTANT_REWRITE_CHARS) {
        failCommand("rewriteAssistantOutput", "The rewritten text is too long.");
      }
      try {
        const snapshot = await input.runtime.rewriteAssistantOutput({ ...scope, messageId, text: command.text });
        adoptSelectedSnapshot(snapshot);
        return snapshot;
      } catch (error) {
        throw normalizeCommandError(error, "rewriteAssistantOutput");
      }
    },
    async updateSessionContextPrompt(command: UpdateSessionContextPromptInput) {
      assertActive();
      const scope = sessionCommandScope(command, "updateSessionContextPrompt");
      try {
        if (command.reset === true) {
          const snapshot = await input.runtime.updateSessionContextPrompt({ ...scope, reset: true });
          adoptSelectedSnapshot(snapshot);
          return snapshot;
        }
        if (typeof command.preamble !== "string") {
          failCommand("updateSessionContextPrompt", "A context prompt preamble is required.");
        }
        if (command.preamble.length > MAX_CONTEXT_PROMPT_PREAMBLE_CHARS) {
          failCommand("updateSessionContextPrompt", "The context prompt preamble is too long.");
        }
        const disabledSectionIds: string[] = [];
        for (const id of command.disabledSectionIds ?? []) {
          if (typeof id !== "string" || id.trim() === "") {
            failCommand("updateSessionContextPrompt", "Each disabled section id must be a non-empty string.");
          }
          disabledSectionIds.push(id);
        }
        const snapshot = await input.runtime.updateSessionContextPrompt({
          ...scope,
          preamble: command.preamble,
          disabledSectionIds,
        });
        adoptSelectedSnapshot(snapshot);
        return snapshot;
      } catch (error) {
        throw normalizeCommandError(error, "updateSessionContextPrompt");
      }
    },
    async resolveHostDialog(command: ResolveHostDialogInput) {
      assertActive();
      const requestId = requireNonEmptyString(command.requestId, "requestId", "resolveHostDialog");
      const answers = command.answers !== undefined ? parseAskUserAnswers(command.answers) : undefined;
      if (command.answers !== undefined && answers === null) {
        failCommand("resolveHostDialog", "Questionnaire answers are invalid.");
      }
      await input.runtime.resolveHostDialog({
        requestId,
        ...(typeof command.sessionId === "string" && command.sessionId.trim() !== ""
          ? sessionCommandScope({ backendId: command.backendId, sessionId: command.sessionId, workspaceId: command.workspaceId }, "resolveHostDialog")
          : {}),
        ...(command.cancelled === true ? { cancelled: true } : {}),
        ...(command.confirmed === true ? { confirmed: true } : {}),
        ...(typeof command.selected === "string" ? { selected: command.selected } : {}),
        ...(typeof command.value === "string" ? { value: command.value } : {}),
        ...(answers ? { answers } : {}),
      });
    },
    getSettings() {
      assertActive();
      return settingsSnapshot();
    },
    async updateAppearanceSettings(command: UpdateAppearanceSettingsInput) {
      assertActive();
      const patch: UpdateAppearanceSettingsInput = {};
      const guarded = [
        ["palette", isAppearancePalette, "Unknown appearance palette."],
        ["mode", isAppearanceMode, "Unknown appearance mode."],
        ["workEntryIcons", isWorkEntryIconPack, "Unknown work-entry icon pack."],
        ["glassStrength", isGlassStrength, "Glass strength must be an integer between 0 and 100."],
        ["uiFontSize", isUiFontSize, "UI font size must be an integer between 12 and 20."],
        ["chatFontSize", isChatFontSize, "Chat font size must be an integer between 12 and 20."],
      ] as const;
      for (const [field, isValid, message] of guarded) {
        const value = command[field];
        if (value !== undefined) {
          if (!isValid(value)) {
            failCommand("updateAppearanceSettings", message);
          }
          (patch as Record<string, unknown>)[field] = value;
        }
      }
      for (const field of ["glassEnabled", "fontSmoothing"] as const) {
        const value = command[field];
        if (value !== undefined) {
          if (typeof value !== "boolean") {
            failCommand("updateAppearanceSettings", `${field} must be a boolean.`);
          }
          patch[field] = value;
        }
      }
      for (const field of ["uiFontFamily", "codeFontFamily"] as const) {
        const value = command[field];
        if (value !== undefined) {
          const family = sanitizeFontFamilyName(value);
          if (family === null) {
            failCommand("updateAppearanceSettings", `${field} must be a single installed family name.`);
          }
          patch[field] = family;
        }
      }
      if (Object.keys(patch).length === 0) {
        failCommand("updateAppearanceSettings", "No appearance settings were provided.");
      }
      await persist(setAppearance(metadata, patch));
      input.appearanceHost?.applyAppearance({
        palette: metadata.palette,
        mode: metadata.mode,
        glassEnabled: metadata.glassEnabled,
        glassStrength: metadata.glassStrength,
      });
      return settingsSnapshot();
    },
    async updatePermissionSettings(command: UpdatePermissionSettingsInput) {
      assertActive();
      const patch: UpdatePermissionSettingsInput = {};
      if (command.profile !== undefined) {
        if (!isManagedPermissionProfileId(command.profile)) {
          failCommand(
            "updatePermissionSettings",
            "Choose baby (strict), okay, you got it, or with great power comes great responsibility to replace a custom permission policy.",
          );
        }
        patch.profile = command.profile;
      }
      for (const field of ["yoloMode", "permissionReviewLog"] as const) {
        const value = command[field];
        if (value !== undefined) {
          if (typeof value !== "boolean") {
            failCommand("updatePermissionSettings", `${field} must be a boolean.`);
          }
          patch[field] = value;
        }
      }
      if (Object.keys(patch).length === 0) {
        failCommand("updatePermissionSettings", "No permission settings were provided.");
      }
      const permission = decoratePermissionSettings(await input.runtime.updatePermissionSettings(patch));
      return {
        appearance: appearanceFromMetadata(metadata),
        permission,
        skills: input.runtime.getSkillSettings(),
        githubMcp: input.runtime.getGitHubMcpSettings(),
        sandbox: input.runtime.getSandboxSettings(),
      };
    },
    async trustProjectPermissionRules() {
      assertActive();
      if (!workspace) {
        failCommand("trustProjectPermissionRules", "Select a workspace before trusting its project permission rules.");
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
      return {
        appearance: appearanceFromMetadata(metadata),
        permission: { ...permission, projectPermissionRulesRemembered: true },
        skills: input.runtime.getSkillSettings(),
        githubMcp: input.runtime.getGitHubMcpSettings(),
        sandbox: input.runtime.getSandboxSettings(),
      };
    },
    async listCredentialProviders() {
      assertActive();
      return input.runtime.listCredentialProviders();
    },
    async importProviderApiKey(command: ImportProviderApiKeyInput) {
      assertActive();
      const providerId = requireNonEmptyString(command.providerId, "providerId", "importProviderApiKey");
      const apiKey = requireNonEmptyString(command.apiKey, "apiKey", "importProviderApiKey");
      const result = await input.runtime.importProviderApiKey({ providerId, apiKey });
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
      return input.runtime.listProviderAccounts();
    },
    async startProviderLogin(command: StartProviderLoginInput) {
      assertActive();
      const providerId = requireNonEmptyString(command.providerId, "providerId", "startProviderLogin");
      if (!isProviderAuthMethod(command.method)) {
        failCommand("startProviderLogin", "method must be api_key or oauth.");
      }
      return input.runtime.startProviderLogin({ providerId, method: command.method });
    },
    async respondProviderAuthPrompt(command: RespondProviderAuthPromptInput) {
      assertActive();
      const flowId = requireNonEmptyString(command.flowId, "flowId", "respondProviderAuthPrompt");
      const promptId = requireNonEmptyString(command.promptId, "promptId", "respondProviderAuthPrompt");
      if (typeof command.value !== "string") {
        failCommand("respondProviderAuthPrompt", "value is required.");
      }
      if (command.value.length > MAX_PROVIDER_AUTH_VALUE) {
        failCommand("respondProviderAuthPrompt", "That response is too long.");
      }
      const snapshot = await input.runtime.respondProviderAuthPrompt({
        flowId,
        promptId,
        value: command.value,
      });
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
      return input.runtime.cancelProviderLogin({ flowId });
    },
    async logoutProvider(command: LogoutProviderInput) {
      assertActive();
      const providerId = requireNonEmptyString(command.providerId, "providerId", "logoutProvider");
      return input.runtime.logoutProvider({ providerId });
    },
    async searchWorkspaceReferences(command: SearchWorkspaceReferencesInput) {
      assertActive();
      if (!workspace) {
        failCommand("searchWorkspaceReferences", "Select a workspace before searching files.", HARNESS_ERROR_CODES.workspaceNotSelected);
      }
      const query = typeof command.query === "string" ? command.query.slice(0, MAX_WORKSPACE_REFERENCE_QUERY) : "";
      const limit =
        typeof command.limit === "number" && Number.isFinite(command.limit)
          ? Math.max(1, Math.min(Math.floor(command.limit), MAX_WORKSPACE_REFERENCE_RESULTS))
          : undefined;
      return input.runtime.searchWorkspaceReferences({
        query,
        ...(command.kinds ? { kinds: command.kinds } : {}),
        ...(limit !== undefined ? { limit } : {}),
      });
    },
    async updateSkillSourceSettings(command: UpdateSkillSourceSettingsInput) {
      assertActive();
      const skills = await input.runtime.updateSkillSourceSettings(command);
      await persist(setEnabledSkillSources(metadata, skills.sources.filter((source) => source.enabled && source.sourceId !== "pho-code").map((source) => source.sourceId)));
      return settingsSnapshot();
    },
    async refreshSkills() {
      assertActive();
      return input.runtime.refreshSkills();
    },
    async updateGitHubMcpSettings(command: UpdateGitHubMcpSettingsInput) {
      assertActive();
      if (command.enabled === true && command.acknowledgedDisclosure !== true) {
        failCommand("updateGitHubMcpSettings", "Confirm the GitHub read-only disclosure before enabling GitHub MCP.");
      }
      const githubMcp = await input.runtime.updateGitHubMcpSettings({ enabled: command.enabled === true });
      await persistGitHubMetadata(githubMcp);
      return settingsSnapshot();
    },
    async updateSandboxSettings(command: UpdateSandboxSettingsInput) {
      assertActive();
      const parsed = parseSandboxSettingsPatch(command);
      if (!parsed.ok) {
        failCommand("updateSandboxSettings", parsed.message);
      }
      await input.runtime.updateSandboxSettings(parsed.patch);
      return settingsSnapshot();
    },
    async importGitHubPat(command: ImportGitHubPatInput) {
      assertActive();
      const token = requireNonEmptyString(command.token, "token", "importGitHubPat");
      if (token.length > MAX_GITHUB_PAT_CHARS) {
        failCommand("importGitHubPat", "That GitHub token is too long.");
      }
      const githubMcp = await input.runtime.importGitHubPat({ token });
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
      return githubMcp;
    },
    async getChangeReviewSet(command: GetChangeReviewSetInput) {
      assertActive();
      return input.runtime.getChangeReviewSet(requireChangeScope(command, "getChangeReviewSet"));
    },
    async getChangeDiff(command: GetChangeDiffInput) {
      assertActive();
      const scope = requireChangeScope(command, "getChangeDiff");
      const cursor = optionalCursor(command.cursor, "getChangeDiff", parseChangeDiffCursor);
      const contextLines = requireChangeContextLines(command.contextLines, "getChangeDiff");
      return input.runtime.getChangeDiff({
        ...scope,
        relativePath: requireChangeRelativePath(command.relativePath, "getChangeDiff"),
        ...(cursor !== undefined ? { cursor } : {}),
        ...(contextLines !== undefined ? { contextLines } : {}),
      });
    },
    async getChangeFileView(command: GetChangeFileViewInput) {
      assertActive();
      const scope = requireChangeScope(command, "getChangeFileView");
      if (!isChangeFileVersion(command.version)) {
        failCommand("getChangeFileView", "File version must be before, agent, or current.");
      }
      const cursor = optionalCursor(command.cursor, "getChangeFileView", parseChangeFileViewCursor);
      return input.runtime.getChangeFileView({
        ...scope,
        relativePath: requireChangeRelativePath(command.relativePath, "getChangeFileView"),
        version: command.version,
        ...(cursor !== undefined ? { cursor } : {}),
      });
    },
    async approveChanges(command: ApproveChangesInput) {
      assertActive();
      const scope = requireChangeScope(command, "approveChanges");
      return input.runtime.approveChanges({
        ...scope,
        expectedRevision: requireChangeRevision(command.expectedRevision, "approveChanges"),
        ...(command.relativePaths !== undefined
          ? { relativePaths: requireChangeRelativePaths(command.relativePaths, "approveChanges") }
          : {}),
      });
    },
    async prepareUndoChanges(command: PrepareUndoChangesInput) {
      assertActive();
      const scope = requireChangeScope(command, "prepareUndoChanges");
      return input.runtime.prepareUndoChanges({
        ...scope,
        relativePath: requireChangeRelativePath(command.relativePath, "prepareUndoChanges"),
        expectedRevision: requireChangeRevision(command.expectedRevision, "prepareUndoChanges"),
      });
    },
    async applyUndoChanges(command: ApplyUndoChangesInput) {
      assertActive();
      const scope = requireChangeScope(command, "applyUndoChanges");
      return input.runtime.applyUndoChanges({
        ...scope,
        previewToken: requireChangePreviewToken(command.previewToken, "applyUndoChanges"),
      });
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
          const removed = event.payload as SessionKey;
          if (
            session && sessionKeyEquals(selectedSessionKey(session)!, removed)
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
        sessionRemovals.clear();
        projectRemovals.clear();
        archivedRemovals.clear();
        shutdownAttempt = input.runtime.dispose();
      }
      return shutdownAttempt;
    },
  };
  return withRuntimeReadiness(service, input.runtime);

  function settingsSnapshot(): HarnessSettingsSnapshot {
    const githubMcp = input.runtime.getGitHubMcpSettings();
    const runtimeHost = applicationRuntimeHost(input.runtime);
    return {
      appearance: appearanceFromMetadata(metadata),
      permission: decoratePermissionSettings(input.runtime.getPermissionSettings()),
      skills: input.runtime.getSkillSettings(),
      githubMcp:
        runtimeHost && runtimeHost.getStatus().status !== "ready"
          ? {
              ...githubMcp,
              enabled: metadata.githubMcpEnabled,
              status: metadata.githubMcpEnabled ? "not_started" : "disabled",
              account: {
                ...githubMcp.account,
                ...(metadata.githubMcpAccountLogin ? { login: metadata.githubMcpAccountLogin } : {}),
              },
            }
          : githubMcp,
      sandbox: input.runtime.getSandboxSettings(),
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
      workEntryIcons: current.workEntryIcons,
      glassEnabled: current.glassEnabled,
      glassStrength: current.glassStrength,
      uiFontSize: current.uiFontSize,
      chatFontSize: current.chatFontSize,
      uiFontFamily: current.uiFontFamily,
      codeFontFamily: current.codeFontFamily,
      fontSmoothing: current.fontSmoothing,
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
      await selectWorkspaceSnapshot(
        await input.runtime.inspectWorkspace({
          path,
          approveProjectResources: isPermissionWorkspaceTrusted(metadata, workspaceId),
        }),
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
    const key = {
      ...(snapshot.session.backendId ? { backendId: snapshot.session.backendId } : {}),
      workspaceId: snapshot.workspace.id,
      sessionId: snapshot.session.id,
    };
    if (selected && !sessionKeyEquals(selected, key)) {
      return;
    }
    replaceSelectedSnapshot(snapshot);
  }

  function ordinarySessions(sessions: readonly SessionSummary[]): SessionSummary[] {
    return sessions.filter(
      (entry) => !isArchivedSession(metadata, {
        ...(entry.backendId ? { backendId: entry.backendId } : {}),
        workspaceId: entry.workspaceId,
        sessionId: entry.id,
      }),
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
    const runtimeSessions = await input.runtime.listWorkspaceSessions(path);
    const runtimeKeys = new Set(runtimeSessions.map((entry) => sessionKeyId({
      ...(entry.backendId ? { backendId: entry.backendId } : {}),
      workspaceId: entry.workspaceId,
      sessionId: entry.id,
    })));
    const persistedBackendSessions: SessionSummary[] = metadata.sessionLifecycle
      .filter((entry) =>
        entry.workspaceId === workspaceId &&
        entry.backendId !== undefined &&
        entry.backendId !== "pi" &&
        !runtimeKeys.has(sessionKeyId(entry)),
      )
      .map((entry) => ({
        id: entry.sessionId,
        backendId: entry.backendId,
        workspaceId: entry.workspaceId,
        title: `${entry.backendId} session`,
        updatedAt: entry.lastOutcomeAt ?? entry.lastViewedAt ?? "1970-01-01T00:00:00.000Z",
      }));
    const listed = [...runtimeSessions, ...persistedBackendSessions];
    const liveById = new Map(
      input.runtime.listSessionActivity().map((entry) => [sessionKeyId(entry), entry] as const),
    );
    const selected = selectedSessionKey(session);
    const known: SessionKey[] = [
      ...metadata.sessionLifecycle.filter((entry) => entry.workspaceId !== workspaceId),
      ...listed.map((entry) => ({
        ...(entry.backendId ? { backendId: entry.backendId } : {}),
        workspaceId: entry.workspaceId,
        sessionId: entry.id,
      })),
    ];
    const pruned = pruneOrphanSessionLifecycle(metadata, known);
    if (pruned !== metadata) {
      void persist(pruned);
    }
    const entries = listed.map((entry) => {
      const key = {
        ...(entry.backendId ? { backendId: entry.backendId } : {}),
        workspaceId: entry.workspaceId,
        sessionId: entry.id,
      };
      return projectCatalogEntry(metadata, entry, liveById.get(sessionKeyId(key)), isSelectedSession(selected, key));
    });
    return filterCatalogScope(entries, scope);
  }

  async function loadCatalogEntry(key: SessionKey): Promise<SessionCatalogEntry> {
    const entries = await loadSessionCatalog(key.workspaceId, "all");
    const entry = entries.find((candidate) => sessionKeyEquals(candidate, key));
    if (!entry) {
      failCommand("sessionCatalog", "The selected session was not found.", HARNESS_ERROR_CODES.sessionNotFound);
    }
    return entry;
  }

  function requireSessionKey(value: Partial<SessionKey>, operation: string): SessionKey {
    if (!isSessionKey(value)) {
      failCommand(operation, `${operation} requires workspaceId and sessionId.`);
    }
    return value;
  }

  function sessionCommandScope(
    command: { backendId?: string; sessionId: string; workspaceId?: string },
    operation: string,
  ): { backendId?: string; sessionId: string; workspaceId?: string } {
    const sessionId = requireNonEmptyString(command.sessionId, "sessionId", operation);
    const workspaceId =
      typeof command.workspaceId === "string" && command.workspaceId.trim() !== ""
        ? command.workspaceId.trim()
        : undefined;
    const backendId = typeof command.backendId === "string" && command.backendId.trim() !== ""
      ? command.backendId.trim()
      : undefined;
    return {
      ...(backendId ? { backendId } : {}),
      sessionId,
      ...(workspaceId ? { workspaceId } : {}),
    };
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
    failCommand(operation, `${field} is required.`);
  }
  return value.trim();
}

function runtimeStatus(runtime: HarnessRuntime, ready: boolean): PiRuntimeStatusSnapshot {
  return applicationRuntimeHost(runtime)?.getStatus() ?? (ready ? { status: "ready" } : { status: "starting" });
}

const STARTUP_SAFE_APPLICATION_METHODS = new Set<keyof ApplicationService>([
  "getBootstrapState",
  "reorderRecentWorkspaces",
  "getSettings",
  "updateAppearanceSettings",
  "subscribe",
  "shutdown",
]);

function applicationRuntimeHost(runtime: HarnessRuntime): ApplicationRuntimeHost | undefined {
  const host = runtime as Partial<ApplicationRuntimeHost>;
  return typeof host.getStatus === "function" ? (runtime as ApplicationRuntimeHost) : undefined;
}

function withRuntimeReadiness(service: ApplicationService, runtime: HarnessRuntime): ApplicationService {
  const host = applicationRuntimeHost(runtime);
  if (!host) {
    return service;
  }
  const guarded = new Map<PropertyKey, (...args: unknown[]) => unknown>();
  return new Proxy(service, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (
        typeof property !== "string" ||
        typeof value !== "function" ||
        STARTUP_SAFE_APPLICATION_METHODS.has(property as keyof ApplicationService)
      ) {
        return value;
      }
      let method = guarded.get(property);
      if (!method) {
        method = (...args: unknown[]) => {
          try {
            target.getBootstrapState();
          } catch (error) {
            return Promise.reject(error);
          }
          if (host.getStatus().status !== "ready") {
            return Promise.reject(
              createHarnessError({
                code: HARNESS_ERROR_CODES.runtimeUnavailable,
                message: "The Pi runtime is not connected.",
                operation: property,
              }),
            );
          }
          return Reflect.apply(value, target, args);
        };
        guarded.set(property, method);
      }
      return method;
    },
  });
}

function optionalCursor(
  value: unknown,
  operation: string,
  parse: (cursor: string, operation: string) => unknown,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  // The parser throws a HarnessError for anything malformed.
  parse(typeof value === "string" ? value : "invalid", operation);
  return value as string;
}

function parseWorkspaceReferences(
  value: unknown,
  operation: string,
): WorkspaceReferenceToken[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    failCommand(operation, "Workspace references must be an array.", HARNESS_ERROR_CODES.invalidWorkspaceReference);
  }
  if (value.length > MAX_WORKSPACE_REFERENCES_PER_PROMPT) {
    failCommand(
      operation,
      `A prompt can include at most ${MAX_WORKSPACE_REFERENCES_PER_PROMPT} workspace references.`,
      HARNESS_ERROR_CODES.invalidWorkspaceReference,
    );
  }
  return value.map((entry) => {
    if (!isWorkspaceReferenceToken(entry)) {
      failCommand(operation, "Each workspace reference must include a relative path.", HARNESS_ERROR_CODES.invalidWorkspaceReference);
    }
    return { path: entry.path.trim(), kind: entry.kind };
  });
}

function parseImageIds(value: unknown, operation: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    failCommand(operation, "Image ids must be an array.", HARNESS_ERROR_CODES.invalidImage);
  }
  if (value.length > MAX_PREPARED_IMAGES) {
    failCommand(operation, `A prompt can include at most ${MAX_PREPARED_IMAGES} images.`, HARNESS_ERROR_CODES.invalidImage);
  }
  return value.map((entry) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      failCommand(operation, "Each image id must be a non-empty string.", HARNESS_ERROR_CODES.invalidImage);
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
    failCommand(operation, "A prompt, workspace reference, or image is required.");
  }
  if (text.length > MAX_PROMPT_LENGTH) {
    failCommand(operation, "The prompt is too long.");
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
