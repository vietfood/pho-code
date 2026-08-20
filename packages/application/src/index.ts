export { createApplicationService, untrustedSenderError } from "./bootstrap";
export type { AppearanceHost, ApplicationHostVersions, ApplicationService } from "./bootstrap";
export { createApplicationRuntimeHost } from "./runtime-host";
export type { ApplicationRuntimeHost } from "./runtime-host";
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
  setEnabledSkillSources,
  setGitHubMcpAccountLogin,
  setGitHubMcpEnabled,
} from "./metadata";
export type { AppMetadata, AppMetadataStore, SessionLifecycleRecord } from "./metadata";
