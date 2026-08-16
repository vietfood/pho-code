import type { BootstrapState } from "./bootstrap";
import type { PasteImagesInput, PickImagesInput, PickImagesResult, RemovePreparedImageInput } from "./attachments";
import type {
  AbortRunInput,
  CreateSessionInput,
  ListWorkspaceSessionsInput,
  OpenRecentWorkspaceInput,
  OpenSessionInput,
  ReorderRecentWorkspacesInput,
  PromptAdmission,
  QueueAdmission,
  QueueFollowUpInput,
  SendPromptInput,
  SessionSnapshot,
  RewriteAssistantOutputInput,
  SetSessionModelInput,
  SetThinkingLevelInput,
  SteerRunInput,
} from "./conversation";
import type {
  ExecuteSessionPlanInput,
  SetSessionModeInput,
  UpdateSessionPlanDocumentInput,
} from "./plan-agent";
import type {
  CancelProviderLoginInput,
  CredentialProviderSummary,
  ImportProviderApiKeyInput,
  ImportProviderApiKeyResult,
  LogoutProviderInput,
  OpenProviderAuthLinkInput,
  ProviderAccountsResult,
  ProviderAuthFlowSnapshot,
  RespondProviderAuthPromptInput,
  StartProviderLoginInput,
} from "./credentials";
import type { RuntimeEventEnvelope, Unsubscribe } from "./events";
import type { UpdateSessionContextPromptInput } from "./context-prompt";
import type { ResolveHostDialogInput } from "./resources";
import type { SearchWorkspaceReferencesInput, SearchWorkspaceReferencesResult } from "./retrieval";
import type {
  GitHubMcpSettingsSnapshot,
  ImportGitHubPatInput,
  ImportGitHubPatResult,
  UpdateGitHubMcpSettingsInput,
} from "./github-mcp";
import type { SkillSettingsSnapshot, UpdateSkillSourceSettingsInput } from "./skills";
import type {
  HarnessSettingsSnapshot,
  UpdateAppearanceSettingsInput,
  UpdatePermissionSettingsInput,
} from "./settings";
import type {
  ArchiveSessionInput,
  GetSessionSnapshotInput,
  ListSessionCatalogInput,
  PrepareRemoveArchivedSessionsInput,
  PrepareRemoveArchivedSessionsResult,
  PrepareRemoveSessionInput,
  PrepareRemoveSessionResult,
  PrepareRemoveProjectInput,
  PrepareRemoveProjectResult,
  RemoveArchivedSessionsInput,
  RemoveArchivedSessionsResult,
  RemoveSessionInput,
  RemoveSessionResult,
  RemoveProjectInput,
  RemoveProjectResult,
  RestoreSessionInput,
  SessionCatalogEntry,
} from "./session-lifecycle";
import type { RecentWorkspaceRecord, SessionSummary, WorkspaceSnapshot } from "./workspace";
import type {
  ApproveChangesInput,
  ApplyUndoChangesInput,
  ChangeDiffPage,
  ChangeFileViewPage,
  ChangeReviewSetSnapshot,
  GetChangeDiffInput,
  GetChangeFileViewInput,
  GetChangeReviewSetInput,
  PrepareUndoChangesInput,
  UndoPreview,
} from "./change-review";

export interface DesktopBridge {
  getBootstrapState(): Promise<BootstrapState>;
  pickWorkspace(): Promise<WorkspaceSnapshot | null>;
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
  pickImages(input?: PickImagesInput): Promise<PickImagesResult>;
  pasteImages(input?: PasteImagesInput): Promise<PickImagesResult>;
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
  getSettings(): Promise<HarnessSettingsSnapshot>;
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
  getChangeReviewSet(input: GetChangeReviewSetInput): Promise<ChangeReviewSetSnapshot>;
  getChangeDiff(input: GetChangeDiffInput): Promise<ChangeDiffPage>;
  getChangeFileView(input: GetChangeFileViewInput): Promise<ChangeFileViewPage>;
  approveChanges(input: ApproveChangesInput): Promise<ChangeReviewSetSnapshot>;
  prepareUndoChanges(input: PrepareUndoChangesInput): Promise<UndoPreview>;
  applyUndoChanges(input: ApplyUndoChangesInput): Promise<ChangeReviewSetSnapshot>;
  subscribe(listener: (event: RuntimeEventEnvelope) => void): Unsubscribe;
}
