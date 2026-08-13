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
  isLiveRunDeltaType,
  RUNTIME_EVENT_TYPES,
  runtimeEventUpdatesSessionList,
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
  CancelProviderLoginInput,
  CredentialProviderSummary,
  ImportProviderApiKeyInput,
  ImportProviderApiKeyResult,
  LogoutProviderInput,
  OpenProviderAuthLinkInput,
  ProviderAccountSummary,
  ProviderAccountsResult,
  ProviderAuthDeviceCode,
  ProviderAuthFlowPhase,
  ProviderAuthFlowSnapshot,
  ProviderAuthLink,
  ProviderAuthMethod,
  ProviderAuthPrompt,
  ProviderAuthPromptKind,
  ProviderAuthSelectOption,
  ProviderDisclosureKey,
  RespondProviderAuthPromptInput,
  StartProviderLoginInput,
} from "./credentials";
export {
  idleProviderAccountsResult,
  isProviderAuthFlowPhase,
  isProviderAuthMethod,
  MAX_PROVIDER_AUTH_MESSAGE,
  MAX_PROVIDER_AUTH_OPTIONS,
  MAX_PROVIDER_AUTH_PROGRESS,
  MAX_PROVIDER_AUTH_VALUE,
  PROVIDER_AUTH_FLOW_PHASES,
  PROVIDER_AUTH_METHODS,
  PROVIDER_AUTH_PROMPT_KINDS,
  PROVIDER_DISCLOSURE_KEYS,
  providerDisclosureCopy,
} from "./credentials";

export { hostnameFromHttpUrl, isSafeHttpUrl } from "./http-url";

export type { DesktopBridge } from "./bridge";

export {
  DEFAULT_WORKSPACE_REFERENCE_LIMIT,
  isWorkspaceReferenceKind,
  isWorkspaceReferenceToken,
  LOCAL_RETRIEVAL_STATUSES,
  MAX_WORKSPACE_REFERENCE_QUERY,
  MAX_WORKSPACE_REFERENCE_RESULTS,
  MAX_WORKSPACE_REFERENCES_PER_PROMPT,
  WORKSPACE_REFERENCE_KINDS,
} from "./retrieval";
export type {
  LocalRetrievalStatus,
  PathSuggestion,
  SearchWorkspaceReferencesInput,
  SearchWorkspaceReferencesResult,
  WorkspaceReferenceKind,
  WorkspaceReferenceToken,
} from "./retrieval";

export {
  isWebSourceProvider,
  isWebSourceRecord,
  MAX_WEB_CONCURRENT_REQUESTS,
  MAX_WEB_EXTRACTED_CHARS,
  MAX_WEB_REDIRECTS,
  MAX_WEB_RESPONSE_BYTES,
  MAX_WEB_SEARCH_QUERY,
  MAX_WEB_SEARCH_RESULTS,
  WEB_REQUEST_TIMEOUT_MS,
  WEB_SEARCH_PROVIDERS,
  WEB_SOURCE_PROVIDERS,
} from "./web";
export type { WebSearchProvider, WebSourceProvider, WebSourceRecord } from "./web";

export {
  APPEARANCE_MODES,
  APPEARANCE_PALETTES,
  clampChatFontSize,
  clampGlassStrength,
  clampUiFontSize,
  coerceAppearance,
  DEFAULT_CHAT_FONT_SIZE,
  DEFAULT_GLASS_ENABLED,
  DEFAULT_GLASS_STRENGTH,
  DEFAULT_UI_FONT_SIZE,
  emptyAppearanceSettings,
  emptySettingsSnapshot,
  glassCssTokens,
  isAppearanceMode,
  isAppearancePalette,
  isChatFontSize,
  isGlassStrength,
  isManagedPermissionProfileId,
  isUiFontSize,
  MAX_CHAT_FONT_SIZE,
  MAX_GLASS_STRENGTH,
  MAX_UI_FONT_SIZE,
  MIN_CHAT_FONT_SIZE,
  MIN_GLASS_STRENGTH,
  MIN_UI_FONT_SIZE,
  nativeThemeSourceForAppearance,
  paletteSupportsMode,
  PERMISSION_PROFILE_IDS,
  resolveAppearanceMode,
  supportedAppearanceModes,
  windowBackgroundForAppearance,
} from "./settings";
export type {
  AppearanceMode,
  AppearancePalette,
  AppearanceSettings,
  HarnessSettingsSnapshot,
  ManagedPermissionProfileId,
  PermissionProfileId,
  PermissionSettings,
  PermissionStatusPayload,
  ResolvedAppearance,
  UpdateAppearanceSettingsInput,
  UpdatePermissionSettingsInput,
} from "./settings";

export {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_PREVIEW_DIMENSION,
  MAX_PREPARED_IMAGE_DIMENSION,
  MAX_PREPARED_IMAGES,
  MAX_QUEUE_MESSAGE_PREVIEW,
  MAX_SOURCE_IMAGE_BYTES,
  isImageMimeType,
} from "./attachments";
export type {
  ImageMimeType,
  PasteImagesInput,
  PastedImageBytes,
  PickImagesResult,
  PrepareImageInput,
  PreparedImageSummary,
  RemovePreparedImageInput,
} from "./attachments";

export { emptyQueueState, idleRunState, isQueueMode, MAX_ASSISTANT_REWRITE_CHARS, QUEUE_MODES } from "./conversation";
export type {
  AbortRunInput,
  ContextUsageSummary,
  CreateSessionInput,
  ListWorkspaceSessionsInput,
  OpenRecentWorkspaceInput,
  OpenSessionInput,
  PromptAdmission,
  QueueAdmission,
  QueueFollowUpInput,
  QueueMessagePreview,
  QueueMode,
  ReorderRecentWorkspacesInput,
  RewriteAssistantOutputInput,
  RunState,
  RunStatus,
  RunWorkEntry,
  SendPromptInput,
  SessionQueueState,
  SessionSnapshot,
  SessionUsageSummary,
  SetSessionModelInput,
  SetThinkingLevelInput,
  SteerRunInput,
  ToolActivity,
  ToolStatus,
  TranscriptBlock,
  TranscriptImageBlock,
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
