import { PROTOCOL_COMMANDS, type DesktopBridge, type ProtocolCommandName } from "@pho-code/protocol";

export function missingDesktopBridgeCommands(bridge: object): ProtocolCommandName[] {
  const record = bridge as Record<string, unknown>;
  return Object.values(PROTOCOL_COMMANDS).filter((command) => typeof record[command] !== "function");
}

export function getDesktopBridge(): DesktopBridge {
  const bridge = window.phoCode;
  if (!bridge) {
    throw new Error("The desktop bridge is not available in this renderer.");
  }

  const missing = missingDesktopBridgeCommands(bridge);
  if (missing.length > 0) {
    throw new Error(
      `The desktop bridge is missing ${missing.join(", ")}. Fully restart Pho Code; preload commands do not hot-reload.`,
    );
  }

  return bridge;
}
