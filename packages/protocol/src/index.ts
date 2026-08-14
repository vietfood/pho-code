export { PROTOCOL_COMMANDS, PROTOCOL_VERSION, INTENDED_PI_SDK, PINNED_ELECTRON, isSupportedProtocolVersion } from "./version";
export type { ProtocolCommandName, ProtocolVersion } from "./version";

export { createHarnessError, HARNESS_ERROR_CODES, isHarnessError } from "./errors";
export type { HarnessError } from "./errors";

export { commandFail, commandOk, isCommandResult, unwrapCommandResult } from "./command-result";
export type { CommandResult } from "./command-result";

export {
  appendThinkingDelta,
  applyLiveRunDelta,
  applyRuntimeEvent,
  applyRuntimeEventToCache,
  emptyConversationCache,
  emptyConversationState,
  eventSessionKey,
  isLiveRunDeltaType,
  isProcessScopedEventType,
  mergeLiveRun,
  RUNTIME_EVENT_TYPES,
  runtimeEventUpdatesSessionList,
  upsertToolWork,
} from "./events";
export type {
  ConversationCacheState,
  ConversationViewState,
  ExtensionDialogSettledPayload,
  RuntimeEvent,
  RuntimeEventEnvelope,
  RuntimeEventType,
  RunFailedPayload,
  SessionRemovedPayload,
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
  extractAtMentionPaths,
  findCompletedAtMentions,
  formatAtMentionToken,
} from "./at-mention";
export type { CompletedAtMention } from "./at-mention";

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
  isWebSearchProvider,
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
  emptyGitHubMcpSettingsSnapshot,
  GITHUB_MCP_AUTH_METHODS,
  GITHUB_MCP_DISCLOSURE,
  GITHUB_MCP_FEATURE_ID,
  GITHUB_MCP_SECRET_STORE_NOTICE,
  GITHUB_MCP_STATUSES,
  GITHUB_MCP_TOOL_PREFIX,
  githubMcpSecretStoreNotice,
  githubMcpStatusLabel,
  isGitHubMcpStatus,
  MAX_GITHUB_MCP_ERROR_CHARS,
  MAX_GITHUB_MCP_LOGIN_CHARS,
  MAX_GITHUB_PAT_CHARS,
} from "./github-mcp";
export type {
  GitHubMcpAccountSummary,
  GitHubMcpAuthMethod,
  GitHubMcpSettingsSnapshot,
  GitHubMcpStatus,
  ImportGitHubPatInput,
  ImportGitHubPatResult,
  UpdateGitHubMcpSettingsInput,
} from "./github-mcp";

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
  availableSlashSkills,
  emptySkillSettingsSnapshot,
  extractSkillTokens,
  EXTERNAL_SKILL_SOURCE_IDS,
  findCompletedSkillTokens,
  formatSkillToken,
  isExternalSkillSourceId,
  isSkillCompatibility,
  isSkillSourceId,
  MAX_SKILL_DESCRIPTION_CHARS,
  SKILL_BODY_CLOSE,
  SKILL_BODY_OPEN,
  SKILL_COMPATIBILITY_STATES,
  SKILL_SOURCE_IDS,
  SKILL_SOURCE_LABELS,
  SKILL_SOURCE_ROOT_LABELS,
  SKILL_TRUST_NOTICE,
  skillNeedsCompatibilityNotice,
  sourceCompatibilityWarnings,
  stripExpandedSkillBodies,
  wrapSkillBody,
} from "./skills";
export type {
  CompletedSkillToken,
  ExternalSkillSourceId,
  SkillCompatibility,
  SkillInventoryEntry,
  SkillSettingsSnapshot,
  SkillShadowRef,
  SkillSourceId,
  SkillSourceSummary,
  UpdateSkillSourceSettingsInput,
} from "./skills";

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
  PickImagesInput,
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
  activityRank,
  compareSessionActivity,
  isSessionActivityPhase,
  isSessionCatalogScope,
  isSessionKey,
  isSessionOutcome,
  parseSessionKeyId,
  requireMatchingSessionKey,
  SESSION_ACTIVITY_PHASES,
  SESSION_CATALOG_SCOPES,
  SESSION_OUTCOMES,
  sessionActivityPhase,
  sessionKeyEquals,
  sessionKeyId,
  visibleActivityPhase,
} from "./session-lifecycle";
export type {
  ArchiveSessionInput,
  GetSessionSnapshotInput,
  ListSessionCatalogInput,
  PrepareRemoveSessionInput,
  PrepareRemoveSessionResult,
  RemoveSessionInput,
  RemoveSessionResult,
  RestoreSessionInput,
  SessionActivityPhase,
  SessionActivitySummary,
  SessionCatalogEntry,
  SessionCatalogScope,
  SessionKey,
  SessionOutcome,
} from "./session-lifecycle";

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
