export const PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

export const PROTOCOL_COMMANDS = {
  getBootstrapState: "getBootstrapState",
  pickWorkspace: "pickWorkspace",
  openRecentWorkspace: "openRecentWorkspace",
  reorderRecentWorkspaces: "reorderRecentWorkspaces",
  listWorkspaceSessions: "listWorkspaceSessions",
  createSession: "createSession",
  openSession: "openSession",
  sendPrompt: "sendPrompt",
  steerRun: "steerRun",
  queueFollowUp: "queueFollowUp",
  pickImages: "pickImages",
  pasteImages: "pasteImages",
  removePreparedImage: "removePreparedImage",
  abortRun: "abortRun",
  setSessionModel: "setSessionModel",
  setThinkingLevel: "setThinkingLevel",
  rewriteAssistantOutput: "rewriteAssistantOutput",
  resolveHostDialog: "resolveHostDialog",
  getSettings: "getSettings",
  updateAppearanceSettings: "updateAppearanceSettings",
  updatePermissionSettings: "updatePermissionSettings",
  trustProjectPermissionRules: "trustProjectPermissionRules",
  listCredentialProviders: "listCredentialProviders",
  importProviderApiKey: "importProviderApiKey",
  listProviderAccounts: "listProviderAccounts",
  startProviderLogin: "startProviderLogin",
  respondProviderAuthPrompt: "respondProviderAuthPrompt",
  openProviderAuthLink: "openProviderAuthLink",
  cancelProviderLogin: "cancelProviderLogin",
  logoutProvider: "logoutProvider",
  searchWorkspaceReferences: "searchWorkspaceReferences",
} as const;

export type ProtocolCommandName = (typeof PROTOCOL_COMMANDS)[keyof typeof PROTOCOL_COMMANDS];

export const INTENDED_PI_SDK = {
  packageName: "@earendil-works/pi-coding-agent",
  version: "0.84.1",
  enginesNode: ">=22.19.0",
} as const;

export const PINNED_ELECTRON = {
  version: "43.4.0",
  minimumEmbeddedNode: "22.19.0",
} as const;

export function isSupportedProtocolVersion(version: unknown): version is ProtocolVersion {
  return version === PROTOCOL_VERSION;
}
