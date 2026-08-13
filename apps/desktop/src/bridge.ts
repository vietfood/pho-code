import type { DesktopBridge } from "@pho-code/protocol";

export function getDesktopBridge(): DesktopBridge {
  const bridge = window.phoCode;
  if (!bridge) {
    throw new Error("The desktop bridge is not available in this renderer.");
  }

  return bridge;
}
