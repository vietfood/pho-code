import {
  createHarnessError,
  HARNESS_ERROR_CODES,
  emptySettingsSnapshot,
  type AbortRunInput,
  type AgentBackendDescriptor,
  type CancelProviderLoginInput,
  type CancelSessionCompactionInput,
  type CompactSessionInput,
  type CompactionDetail,
  type CredentialProviderSummary,
  type GetCompactionDetailInput,
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
  type UpdateSessionContextPromptInput,
  type SearchWorkspaceReferencesInput,
  type SearchWorkspaceReferencesResult,
  type SkillSettingsSnapshot,
  type SendPromptInput,
  type SessionActivitySummary,
  type SessionKey,
  type SessionSnapshot,
  type SessionSummary,
  type SetSessionModelInput,
  type SetThinkingLevelInput,
  type SetFastModeInput,
  type SetSessionModeInput,
  type UpdateSessionPlanDocumentInput,
  type ExecuteSessionPlanInput,
  type StartProviderLoginInput,
  type SteerRunInput,
  type Unsubscribe,
  type UpdatePermissionSettingsInput,
  type UpdateSkillSourceSettingsInput,
  type GitHubMcpSettingsSnapshot,
  type ImportGitHubPatInput,
  type UpdateGitHubMcpSettingsInput,
  type SandboxSettingsSnapshot,
  type UpdateSandboxSettingsInput,
  type WorkspaceSnapshot,
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
  type ApprovalDecisionHistoryPage,
  type ApprovalModeSettingsSnapshot,
  type AuthorizeApprovalRetryInput,
  type ListApprovalDecisionHistoryInput,
  type MigrateLegacyPermissionSettingsInput,
  type ResolveApprovalRequestInput,
  type RevokeApprovalGrantInput,
  type SetSessionApprovalModeInput,
  type UpdateApprovalModeSettingsInput,
  type AcceptTaskCompletionGapsInput,
  type RecordOwnerVerificationInput,
  type ReopenTaskInput,
  type ResetTaskBriefInput,
  type UpdateTaskBriefInput,
} from "@pho-code/protocol";

export interface RuntimeCapabilities {
  piRuntime: boolean;
}

export interface InspectWorkspaceInput {
  path: string;
  approveProjectResources: boolean;
}

export interface RemovableSessionInspection {
  title: string;
  fingerprint: string;
}

export interface RemovedSessionResult {
  title: string;
  method: string;
}

export interface HarnessRuntime {
  readonly disposeCount: number;
  getCapabilities(): RuntimeCapabilities;
  listAgentBackends(): readonly AgentBackendDescriptor[];
  getAgentDir(): string;
  inspectWorkspace(input: InspectWorkspaceInput): Promise<WorkspaceSnapshot>;
  listWorkspaceSessions(workspaceId: string): Promise<SessionSummary[]>;
  listSessionActivity(): SessionActivitySummary[];
  getSessionSnapshot(key: SessionKey): Promise<SessionSnapshot>;
  createSession(workspaceId: string, backendId?: string): Promise<SessionSnapshot>;
  openSession(workspaceId: string, sessionId: string, backendId?: string): Promise<SessionSnapshot>;
  inspectRemovableSession(key: SessionKey): Promise<RemovableSessionInspection>;
  removeValidatedSession(input: SessionKey & { fingerprint: string }): Promise<RemovedSessionResult>;
  sendPrompt(input: SendPromptInput): Promise<PromptAdmission>;
  steerRun(input: SteerRunInput): Promise<QueueAdmission>;
  queueFollowUp(input: QueueFollowUpInput): Promise<QueueAdmission>;
  prepareImage(input: PrepareImageInput): Promise<PreparedImageSummary>;
  removePreparedImage(input: RemovePreparedImageInput): Promise<void>;
  abortRun(input: AbortRunInput): Promise<void>;
  compactSession(input: CompactSessionInput): Promise<SessionSnapshot>;
  cancelSessionCompaction(input: CancelSessionCompactionInput): Promise<void>;
  getCompactionDetail(input: GetCompactionDetailInput): Promise<CompactionDetail>;
  setSessionModel(input: SetSessionModelInput): Promise<SessionSnapshot>;
  setThinkingLevel(input: SetThinkingLevelInput): Promise<SessionSnapshot>;
  setFastMode(input: SetFastModeInput): Promise<SessionSnapshot>;
  setSessionMode(input: SetSessionModeInput): Promise<SessionSnapshot>;
  setSessionApprovalMode(input: SetSessionApprovalModeInput): Promise<SessionSnapshot>;
  updateSessionPlanDocument(input: UpdateSessionPlanDocumentInput): Promise<SessionSnapshot>;
  executeSessionPlan(input: ExecuteSessionPlanInput): Promise<SessionSnapshot>;
  updateTaskBrief(input: UpdateTaskBriefInput): Promise<SessionSnapshot>;
  resetTaskBrief(input: ResetTaskBriefInput): Promise<SessionSnapshot>;
  reopenTask(input: ReopenTaskInput): Promise<SessionSnapshot>;
  recordOwnerVerification(input: RecordOwnerVerificationInput): Promise<SessionSnapshot>;
  acceptTaskCompletionGaps(input: AcceptTaskCompletionGapsInput): Promise<SessionSnapshot>;
  rewriteAssistantOutput(input: RewriteAssistantOutputInput): Promise<SessionSnapshot>;
  updateSessionContextPrompt(input: UpdateSessionContextPromptInput): Promise<SessionSnapshot>;
  resolveHostDialog(input: ResolveHostDialogInput): Promise<void>;
  getPermissionSettings(): PermissionSettings;
  getApprovalModeSettings(): ApprovalModeSettingsSnapshot;
  updateApprovalModeSettings(input: UpdateApprovalModeSettingsInput): Promise<ApprovalModeSettingsSnapshot>;
  resolveApprovalRequest(input: ResolveApprovalRequestInput): Promise<SessionSnapshot>;
  authorizeApprovalRetry(input: AuthorizeApprovalRetryInput): Promise<SessionSnapshot>;
  revokeApprovalGrant(input: RevokeApprovalGrantInput): Promise<SessionSnapshot>;
  migrateLegacyPermissionSettings(input: MigrateLegacyPermissionSettingsInput): Promise<ApprovalModeSettingsSnapshot>;
  listApprovalDecisionHistory(input?: ListApprovalDecisionHistoryInput): Promise<ApprovalDecisionHistoryPage>;
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
  getSkillSettings(): SkillSettingsSnapshot;
  setEnabledSkillSources(sourceIds: readonly string[]): SkillSettingsSnapshot;
  updateSkillSourceSettings(input: UpdateSkillSourceSettingsInput): Promise<SkillSettingsSnapshot>;
  refreshSkills(): Promise<SkillSettingsSnapshot>;
  getGitHubMcpSettings(): GitHubMcpSettingsSnapshot;
  updateGitHubMcpSettings(input: UpdateGitHubMcpSettingsInput): Promise<GitHubMcpSettingsSnapshot>;
  getSandboxSettings(): SandboxSettingsSnapshot;
  updateSandboxSettings(input: UpdateSandboxSettingsInput): Promise<SandboxSettingsSnapshot>;
  importGitHubPat(input: ImportGitHubPatInput): Promise<GitHubMcpSettingsSnapshot>;
  removeGitHubPat(): Promise<GitHubMcpSettingsSnapshot>;
  getChangeReviewSet(scope: ChangeScope): Promise<ChangeReviewSetSnapshot>;
  getChangeDiff(input: GetChangeDiffInput): Promise<ChangeDiffPage>;
  getChangeFileView(input: GetChangeFileViewInput): Promise<ChangeFileViewPage>;
  approveChanges(input: ApproveChangesInput): Promise<ChangeReviewSetSnapshot>;
  prepareUndoChanges(input: PrepareUndoChangesInput): Promise<UndoPreview>;
  applyUndoChanges(input: ApplyUndoChangesInput): Promise<ChangeReviewSetSnapshot>;
  subscribe(listener: (event: RuntimeEvent) => void): Unsubscribe;
  dispose(): Promise<void>;
}

export function createDisposableStubHarnessRuntime(options?: {
  onDispose?: () => Promise<void> | void;
  blockDispose?: Promise<void>;
}): HarnessRuntime & {
  readonly disposed: boolean;
  readonly disposeCount: number;
} {
  const state = { disposed: false, disposeCount: 0 };
  const reject = (operation: string) => () => Promise.reject(unavailable(operation));
  return {
    get disposed() {
      return state.disposed;
    },
    get disposeCount() {
      return state.disposeCount;
    },
    getCapabilities: () => ({ piRuntime: false }),
    listAgentBackends: () => [],
    getAgentDir() {
      throw unavailable("getAgentDir");
    },
    inspectWorkspace: reject("inspectWorkspace"),
    listWorkspaceSessions: reject("listWorkspaceSessions"),
    listSessionActivity: () => [],
    getSessionSnapshot: reject("getSessionSnapshot"),
    createSession: reject("createSession"),
    openSession: reject("openSession"),
    inspectRemovableSession: reject("inspectRemovableSession"),
    removeValidatedSession: reject("removeValidatedSession"),
    sendPrompt: reject("sendPrompt"),
    steerRun: reject("steerRun"),
    queueFollowUp: reject("queueFollowUp"),
    prepareImage: reject("prepareImage"),
    removePreparedImage: reject("removePreparedImage"),
    abortRun: reject("abortRun"),
    compactSession: reject("compactSession"),
    cancelSessionCompaction: reject("cancelSessionCompaction"),
    getCompactionDetail: reject("getCompactionDetail"),
    setSessionModel: reject("setSessionModel"),
    setThinkingLevel: reject("setThinkingLevel"),
    setFastMode: reject("setFastMode"),
    setSessionMode: reject("setSessionMode"),
    setSessionApprovalMode: reject("setSessionApprovalMode"),
    updateSessionPlanDocument: reject("updateSessionPlanDocument"),
    executeSessionPlan: reject("executeSessionPlan"),
    updateTaskBrief: reject("updateTaskBrief"),
    resetTaskBrief: reject("resetTaskBrief"),
    reopenTask: reject("reopenTask"),
    recordOwnerVerification: reject("recordOwnerVerification"),
    acceptTaskCompletionGaps: reject("acceptTaskCompletionGaps"),
    rewriteAssistantOutput: reject("rewriteAssistantOutput"),
    updateSessionContextPrompt: reject("updateSessionContextPrompt"),
    resolveHostDialog: reject("resolveHostDialog"),
    getPermissionSettings: () => emptySettingsSnapshot().permission,
    getApprovalModeSettings: () => unavailableApprovalSettings(),
    updateApprovalModeSettings: reject("updateApprovalModeSettings"),
    resolveApprovalRequest: reject("resolveApprovalRequest"),
    authorizeApprovalRetry: reject("authorizeApprovalRetry"),
    revokeApprovalGrant: reject("revokeApprovalGrant"),
    migrateLegacyPermissionSettings: reject("migrateLegacyPermissionSettings"),
    listApprovalDecisionHistory: reject("listApprovalDecisionHistory"),
    updatePermissionSettings: reject("updatePermissionSettings"),
    trustProjectPermissionRules: reject("trustProjectPermissionRules"),
    listCredentialProviders: reject("listCredentialProviders"),
    importProviderApiKey: reject("importProviderApiKey"),
    listProviderAccounts: reject("listProviderAccounts"),
    startProviderLogin: reject("startProviderLogin"),
    respondProviderAuthPrompt: reject("respondProviderAuthPrompt"),
    openProviderAuthLink: reject("openProviderAuthLink"),
    cancelProviderLogin: reject("cancelProviderLogin"),
    logoutProvider: reject("logoutProvider"),
    searchWorkspaceReferences: reject("searchWorkspaceReferences"),
    getSkillSettings: () => emptySettingsSnapshot().skills,
    setEnabledSkillSources: () => emptySettingsSnapshot().skills,
    updateSkillSourceSettings: () => Promise.resolve(emptySettingsSnapshot().skills),
    refreshSkills: () => Promise.resolve(emptySettingsSnapshot().skills),
    getGitHubMcpSettings: () => emptySettingsSnapshot().githubMcp,
    updateGitHubMcpSettings: () => Promise.resolve(emptySettingsSnapshot().githubMcp),
    getSandboxSettings: () => emptySettingsSnapshot().sandbox,
    updateSandboxSettings: () => Promise.resolve(emptySettingsSnapshot().sandbox),
    importGitHubPat: () => Promise.resolve(emptySettingsSnapshot().githubMcp),
    removeGitHubPat: () => Promise.resolve(emptySettingsSnapshot().githubMcp),
    getChangeReviewSet: reject("getChangeReviewSet"),
    getChangeDiff: reject("getChangeDiff"),
    getChangeFileView: reject("getChangeFileView"),
    approveChanges: reject("approveChanges"),
    prepareUndoChanges: reject("prepareUndoChanges"),
    applyUndoChanges: reject("applyUndoChanges"),
    subscribe: () => () => undefined,
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

function unavailableApprovalSettings(): ApprovalModeSettingsSnapshot {
  return {
    defaultMode: "ask",
    autoEnabled: false,
    fullAccessEnabled: false,
    reviewer: { selection: "automatic", available: false, reason: "The runtime is unavailable." },
    decisionHistoryEnabled: true,
    migration: { state: "not-needed" },
    legacy: { profile: "custom", yoloMode: false, custom: true, sharedAgentDir: false },
    boundary: { sandboxAvailable: false, status: "off" },
  };
}

function unavailable(operation: string) {
  return createHarnessError({
    code: HARNESS_ERROR_CODES.runtimeUnavailable,
    message: "The Pi runtime is not connected.",
    operation,
  });
}
