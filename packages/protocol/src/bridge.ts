import type { BootstrapState } from "./bootstrap";
import type {
  AbortRunInput,
  CreateSessionInput,
  ListWorkspaceSessionsInput,
  OpenRecentWorkspaceInput,
  OpenSessionInput,
  PromptAdmission,
  SendPromptInput,
  SessionSnapshot,
  SetSessionModelInput,
  SetThinkingLevelInput,
} from "./conversation";
import type {
  CredentialProviderSummary,
  ImportProviderApiKeyInput,
  ImportProviderApiKeyResult,
} from "./credentials";
import type { RuntimeEventEnvelope, Unsubscribe } from "./events";
import type { ResolveHostDialogInput } from "./resources";
import type {
  HarnessSettingsSnapshot,
  UpdateAppearanceSettingsInput,
  UpdatePermissionSettingsInput,
} from "./settings";
import type { SessionSummary, WorkspaceSnapshot } from "./workspace";

export interface DesktopBridge {
  getBootstrapState(): Promise<BootstrapState>;
  pickWorkspace(): Promise<WorkspaceSnapshot | null>;
  openRecentWorkspace(input: OpenRecentWorkspaceInput): Promise<WorkspaceSnapshot>;
  listWorkspaceSessions(input: ListWorkspaceSessionsInput): Promise<SessionSummary[]>;
  createSession(input?: CreateSessionInput): Promise<SessionSnapshot>;
  openSession(input: OpenSessionInput): Promise<SessionSnapshot>;
  sendPrompt(input: SendPromptInput): Promise<PromptAdmission>;
  abortRun(input: AbortRunInput): Promise<void>;
  setSessionModel(input: SetSessionModelInput): Promise<SessionSnapshot>;
  setThinkingLevel(input: SetThinkingLevelInput): Promise<SessionSnapshot>;
  resolveHostDialog(input: ResolveHostDialogInput): Promise<void>;
  getSettings(): Promise<HarnessSettingsSnapshot>;
  updateAppearanceSettings(input: UpdateAppearanceSettingsInput): Promise<HarnessSettingsSnapshot>;
  updatePermissionSettings(input: UpdatePermissionSettingsInput): Promise<HarnessSettingsSnapshot>;
  listCredentialProviders(): Promise<CredentialProviderSummary[]>;
  importProviderApiKey(input: ImportProviderApiKeyInput): Promise<ImportProviderApiKeyResult>;
  subscribe(listener: (event: RuntimeEventEnvelope) => void): Unsubscribe;
}
