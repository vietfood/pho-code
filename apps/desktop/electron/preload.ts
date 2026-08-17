import { contextBridge, ipcRenderer } from "electron";
import { unwrapCommandResult, type DesktopBridge, type RuntimeEventEnvelope } from "@pho-code/protocol";
import { IPC_CHANNELS } from "./ipc";

function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload).then((result: unknown) => unwrapCommandResult<T>(result));
}

const bridge: DesktopBridge = {
  getBootstrapState: () => invoke(IPC_CHANNELS.getBootstrapState),
  pickWorkspace: () => invoke(IPC_CHANNELS.pickWorkspace),
  openRecentWorkspace: (input) => invoke(IPC_CHANNELS.openRecentWorkspace, input),
  reorderRecentWorkspaces: (input) => invoke(IPC_CHANNELS.reorderRecentWorkspaces, input),
  listWorkspaceSessions: (input) => invoke(IPC_CHANNELS.listWorkspaceSessions, input),
  listSessionCatalog: (input) => invoke(IPC_CHANNELS.listSessionCatalog, input),
  getSessionSnapshot: (input) => invoke(IPC_CHANNELS.getSessionSnapshot, input),
  createSession: (input) => invoke(IPC_CHANNELS.createSession, input),
  openSession: (input) => invoke(IPC_CHANNELS.openSession, input),
  archiveSession: (input) => invoke(IPC_CHANNELS.archiveSession, input),
  restoreSession: (input) => invoke(IPC_CHANNELS.restoreSession, input),
  prepareRemoveSession: (input) => invoke(IPC_CHANNELS.prepareRemoveSession, input),
  removeSession: (input) => invoke(IPC_CHANNELS.removeSession, input),
  prepareRemoveProject: (input) => invoke(IPC_CHANNELS.prepareRemoveProject, input),
  removeProject: (input) => invoke(IPC_CHANNELS.removeProject, input),
  prepareRemoveArchivedSessions: (input) => invoke(IPC_CHANNELS.prepareRemoveArchivedSessions, input),
  removeArchivedSessions: (input) => invoke(IPC_CHANNELS.removeArchivedSessions, input),
  sendPrompt: (input) => invoke(IPC_CHANNELS.sendPrompt, input),
  steerRun: (input) => invoke(IPC_CHANNELS.steerRun, input),
  queueFollowUp: (input) => invoke(IPC_CHANNELS.queueFollowUp, input),
  pickImages: (input) => invoke(IPC_CHANNELS.pickImages, input),
  pasteImages: (input) => invoke(IPC_CHANNELS.pasteImages, input),
  removePreparedImage: (input) => invoke(IPC_CHANNELS.removePreparedImage, input),
  abortRun: (input) => invoke(IPC_CHANNELS.abortRun, input),
  setSessionModel: (input) => invoke(IPC_CHANNELS.setSessionModel, input),
  setThinkingLevel: (input) => invoke(IPC_CHANNELS.setThinkingLevel, input),
  setSessionMode: (input) => invoke(IPC_CHANNELS.setSessionMode, input),
  updateSessionPlanDocument: (input) => invoke(IPC_CHANNELS.updateSessionPlanDocument, input),
  executeSessionPlan: (input) => invoke(IPC_CHANNELS.executeSessionPlan, input),
  rewriteAssistantOutput: (input) => invoke(IPC_CHANNELS.rewriteAssistantOutput, input),
  updateSessionContextPrompt: (input) => invoke(IPC_CHANNELS.updateSessionContextPrompt, input),
  resolveHostDialog: (input) => invoke(IPC_CHANNELS.resolveHostDialog, input),
  getSettings: () => invoke(IPC_CHANNELS.getSettings),
  updateAppearanceSettings: (input) => invoke(IPC_CHANNELS.updateAppearanceSettings, input),
  updatePermissionSettings: (input) => invoke(IPC_CHANNELS.updatePermissionSettings, input),
  trustProjectPermissionRules: () => invoke(IPC_CHANNELS.trustProjectPermissionRules),
  listCredentialProviders: () => invoke(IPC_CHANNELS.listCredentialProviders),
  importProviderApiKey: (input) => invoke(IPC_CHANNELS.importProviderApiKey, input),
  listProviderAccounts: () => invoke(IPC_CHANNELS.listProviderAccounts),
  startProviderLogin: (input) => invoke(IPC_CHANNELS.startProviderLogin, input),
  respondProviderAuthPrompt: (input) => invoke(IPC_CHANNELS.respondProviderAuthPrompt, input),
  openProviderAuthLink: (input) => invoke(IPC_CHANNELS.openProviderAuthLink, input),
  cancelProviderLogin: (input) => invoke(IPC_CHANNELS.cancelProviderLogin, input),
  logoutProvider: (input) => invoke(IPC_CHANNELS.logoutProvider, input),
  searchWorkspaceReferences: (input) => invoke(IPC_CHANNELS.searchWorkspaceReferences, input),
  updateSkillSourceSettings: (input) => invoke(IPC_CHANNELS.updateSkillSourceSettings, input),
  refreshSkills: () => invoke(IPC_CHANNELS.refreshSkills),
  updateGitHubMcpSettings: (input) => invoke(IPC_CHANNELS.updateGitHubMcpSettings, input),
  updateSandboxSettings: (input) => invoke(IPC_CHANNELS.updateSandboxSettings, input),
  importGitHubPat: (input) => invoke(IPC_CHANNELS.importGitHubPat, input),
  removeGitHubPat: () => invoke(IPC_CHANNELS.removeGitHubPat),
  getChangeReviewSet: (input) => invoke(IPC_CHANNELS.getChangeReviewSet, input),
  getChangeDiff: (input) => invoke(IPC_CHANNELS.getChangeDiff, input),
  getChangeFileView: (input) => invoke(IPC_CHANNELS.getChangeFileView, input),
  approveChanges: (input) => invoke(IPC_CHANNELS.approveChanges, input),
  prepareUndoChanges: (input) => invoke(IPC_CHANNELS.prepareUndoChanges, input),
  applyUndoChanges: (input) => invoke(IPC_CHANNELS.applyUndoChanges, input),
  subscribe(listener) {
    const handler = (_event: Electron.IpcRendererEvent, envelope: RuntimeEventEnvelope) => {
      listener(envelope);
    };
    ipcRenderer.on(IPC_CHANNELS.event, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.event, handler);
    };
  },
};

contextBridge.exposeInMainWorld("phoCode", bridge);
