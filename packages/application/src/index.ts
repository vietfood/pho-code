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
  setAppearance,
  setAppearanceTheme,
} from "./metadata";
export type { AppMetadata, AppMetadataStore, SessionLifecycleRecord } from "./metadata";
