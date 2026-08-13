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
  listWorkspaceSessions: (input) => invoke(IPC_CHANNELS.listWorkspaceSessions, input),
  createSession: (input) => invoke(IPC_CHANNELS.createSession, input),
  openSession: (input) => invoke(IPC_CHANNELS.openSession, input),
  sendPrompt: (input) => invoke(IPC_CHANNELS.sendPrompt, input),
  abortRun: (input) => invoke(IPC_CHANNELS.abortRun, input),
  setSessionModel: (input) => invoke(IPC_CHANNELS.setSessionModel, input),
  setThinkingLevel: (input) => invoke(IPC_CHANNELS.setThinkingLevel, input),
  resolveHostDialog: (input) => invoke(IPC_CHANNELS.resolveHostDialog, input),
  getSettings: () => invoke(IPC_CHANNELS.getSettings),
  updateAppearanceSettings: (input) => invoke(IPC_CHANNELS.updateAppearanceSettings, input),
  updatePermissionSettings: (input) => invoke(IPC_CHANNELS.updatePermissionSettings, input),
  listCredentialProviders: () => invoke(IPC_CHANNELS.listCredentialProviders),
  importProviderApiKey: (input) => invoke(IPC_CHANNELS.importProviderApiKey, input),
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
