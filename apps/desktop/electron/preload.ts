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
  createSession: (input) => invoke(IPC_CHANNELS.createSession, input),
  openSession: (input) => invoke(IPC_CHANNELS.openSession, input),
  sendPrompt: (input) => invoke(IPC_CHANNELS.sendPrompt, input),
  steerRun: (input) => invoke(IPC_CHANNELS.steerRun, input),
  queueFollowUp: (input) => invoke(IPC_CHANNELS.queueFollowUp, input),
  pickImages: () => invoke(IPC_CHANNELS.pickImages),
  pasteImages: (input) => invoke(IPC_CHANNELS.pasteImages, input),
  removePreparedImage: (input) => invoke(IPC_CHANNELS.removePreparedImage, input),
  abortRun: (input) => invoke(IPC_CHANNELS.abortRun, input),
  setSessionModel: (input) => invoke(IPC_CHANNELS.setSessionModel, input),
  setThinkingLevel: (input) => invoke(IPC_CHANNELS.setThinkingLevel, input),
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
