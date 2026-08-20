import { contextBridge, ipcRenderer } from "electron";
import {
  unwrapCommandResult,
  type DesktopBridge,
  type PiRuntimeStatusSnapshot,
  type RuntimeEventEnvelope,
} from "@pho-code/protocol";
import { IPC_CHANNELS } from "./ipc";

function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload).then((result: unknown) => unwrapCommandResult<T>(result));
}

type IpcChannelName = keyof typeof IPC_CHANNELS;
type BridgeCommand = Exclude<IpcChannelName, "event" | "piRuntimeStatus">;
type DesktopCommand = Exclude<keyof DesktopBridge, "subscribe" | "subscribePiRuntimeStatus">;
const ipcChannelsMatchDesktopBridge: Exclude<DesktopCommand, BridgeCommand> | Exclude<BridgeCommand, DesktopCommand> extends never
  ? true
  : never = true;
void ipcChannelsMatchDesktopBridge;

// Every command shares the same shape: optional single payload, unwrapped
// result. Generate the wrappers so the table cannot drift from the contract.
const commands = Object.fromEntries(
  (Object.keys(IPC_CHANNELS) as IpcChannelName[])
    .filter((name): name is BridgeCommand => name !== "event" && name !== "piRuntimeStatus")
    .map((name) => [name, (input?: unknown) => invoke(IPC_CHANNELS[name], input)]),
) as unknown as Pick<DesktopBridge, BridgeCommand>;

const bridge: DesktopBridge = {
  ...commands,
  subscribe(listener) {
    const handler = (_event: Electron.IpcRendererEvent, envelope: RuntimeEventEnvelope) => {
      listener(envelope);
    };
    ipcRenderer.on(IPC_CHANNELS.event, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.event, handler);
    };
  },
  subscribePiRuntimeStatus(listener) {
    const handler = (_event: Electron.IpcRendererEvent, status: PiRuntimeStatusSnapshot) => {
      listener(status);
    };
    ipcRenderer.on(IPC_CHANNELS.piRuntimeStatus, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.piRuntimeStatus, handler);
    };
  },
};

contextBridge.exposeInMainWorld("phoCode", bridge);
