export { PROTOCOL_COMMANDS, PROTOCOL_VERSION, INTENDED_PI_SDK, PINNED_ELECTRON, isSupportedProtocolVersion } from "./version";
export type { ProtocolCommandName, ProtocolVersion } from "./version";

export { createHarnessError, HARNESS_ERROR_CODES, isHarnessError } from "./errors";
export type { HarnessError } from "./errors";

export { commandFail, commandOk, isCommandResult, unwrapCommandResult } from "./command-result";
export type { CommandResult } from "./command-result";

export {
  appendThinkingDelta,
  applyRuntimeEvent,
  emptyConversationState,
  RUNTIME_EVENT_TYPES,
  upsertToolWork,
} from "./events";
export type {
  ConversationViewState,
  ExtensionDialogSettledPayload,
  RuntimeEvent,
  RuntimeEventEnvelope,
  RuntimeEventType,
  RunFailedPayload,
  TextDeltaPayload,
  ThinkingDeltaPayload,
  ToolEventPayload,
  Unsubscribe,
} from "./events";

export type { BootstrapCapabilities, BootstrapMilestone, BootstrapState, BootstrapVersions } from "./bootstrap";

export type {
  CredentialProviderSummary,
  ImportProviderApiKeyInput,
  ImportProviderApiKeyResult,
} from "./credentials";

export type { DesktopBridge } from "./bridge";

export {
  emptySettingsSnapshot,
  isManagedPermissionProfileId,
  isThemePreference,
  PERMISSION_PROFILE_IDS,
  THEME_PREFERENCES,
} from "./settings";
export type {
  AppearanceSettings,
  HarnessSettingsSnapshot,
  ManagedPermissionProfileId,
  PermissionProfileId,
  PermissionSettings,
  PermissionStatusPayload,
  ThemePreference,
  UpdateAppearanceSettingsInput,
  UpdatePermissionSettingsInput,
} from "./settings";

export { idleRunState } from "./conversation";
export type {
  AbortRunInput,
  ContextUsageSummary,
  CreateSessionInput,
  ListWorkspaceSessionsInput,
  OpenRecentWorkspaceInput,
  OpenSessionInput,
  PromptAdmission,
  RunState,
  RunStatus,
  RunWorkEntry,
  SendPromptInput,
  SessionSnapshot,
  SessionUsageSummary,
  SetSessionModelInput,
  SetThinkingLevelInput,
  ToolActivity,
  ToolStatus,
  TranscriptBlock,
  TranscriptMessage,
  TranscriptRole,
  TranscriptTextBlock,
  TranscriptThinkingBlock,
  TranscriptToolBlock,
} from "./conversation";

export {
  emptyFeatureSnapshot,
  FEATURE_TRUST_NOTICE,
} from "./resources";
export type {
  ExtensionNotification,
  FeatureSnapshot,
  FeatureStatus,
  HarnessFeatureSummary,
  HostDialogKind,
  HostDialogRequest,
  ResolveHostDialogInput,
  ResourceDiagnostic,
  ResourceDiagnosticType,
} from "./resources";

export { isThinkingLevel, THINKING_LEVELS } from "./workspace";
export type {
  ModelCostRatesSummary,
  ModelSummary,
  RecentWorkspaceRecord,
  SessionSummary,
  ThinkingLevel,
  WorkspaceSnapshot,
  WorkspaceSummary,
} from "./workspace";

export {
  assertJsonSafe,
  compareNodeVersions,
  isJsonSafeValue,
  jsonRoundTrip,
  nodeVersionMeetsMinimum,
  parseNodeVersion,
} from "./json";
