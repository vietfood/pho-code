import type { IpcMainInvokeEvent } from "electron";
import { untrustedSenderError } from "@pho-code/application";
import { isTrustedSenderFrame, type TrustedRendererLocation } from "./trusted-renderer";

export { contentSecurityPolicy, isSafeExternalUrl } from "./security-policy";

export function assertTrustedSender(event: IpcMainInvokeEvent, trusted: TrustedRendererLocation): void {
  const frame = event.senderFrame;
  if (
    !isTrustedSenderFrame({
      frameUrl: frame?.url,
      isMainFrame: Boolean(frame && frame === event.sender.mainFrame),
      trusted,
    })
  ) {
    throw untrustedSenderError("ipc");
  }
}
