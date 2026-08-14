export { createApplicationService, untrustedSenderError } from "./bootstrap";
export type { AppearanceHost, ApplicationHostVersions, ApplicationService } from "./bootstrap";
export {
  archiveSessionMetadata,
  createMemoryMetadataStore,
  emptyMetadata,
  getSessionLifecycle,
  markSessionViewed,
  parseMetadata,
  pruneOrphanSessionLifecycle,
  forgetSessionLifecycle,
  recordSessionOutcome,
  rememberWorkspace,
  reorderRecentWorkspaces,
  restoreSessionMetadata,
  forgetWorkspace,
  setAppearance,
  setAppearanceTheme,
  setEnabledSkillSources,
  setGitHubMcpAccountLogin,
  setGitHubMcpEnabled,
} from "./metadata";
export type { AppMetadata, AppMetadataStore, SessionLifecycleRecord } from "./metadata";
