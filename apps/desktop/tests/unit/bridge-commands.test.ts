import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { PROTOCOL_COMMANDS } from "@pho-code/protocol";
import { IPC_CHANNELS } from "../../electron/ipc";
import { missingDesktopBridgeCommands } from "../../src/bridge";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function readDesktop(relativePath: string): Promise<string> {
  return readFile(path.join(desktopRoot, relativePath), "utf8");
}

describe("desktop bridge commands", () => {
  test("reports protocol commands missing from a stale preload object", () => {
    expect(missingDesktopBridgeCommands({})).toContain("prepareRemoveArchivedSessions");
    expect(missingDesktopBridgeCommands({ prepareRemoveArchivedSessions: () => undefined })).not.toContain(
      "prepareRemoveArchivedSessions",
    );
  });

  test("preload, IPC channels, and main handlers cover every protocol command", async () => {
    const [preload, main] = await Promise.all([
      readDesktop("electron/preload.ts"),
      readDesktop("electron/main.ts"),
    ]);

    expect(preload).toContain("Object.keys(IPC_CHANNELS)");
    expect(preload).toContain('name !== "event"');
    expect(main).toContain("IPC_CHANNELS[name]");

    const channelCommands = Object.keys(IPC_CHANNELS).filter((name) => name !== "event");
    expect(channelCommands.sort()).toEqual([...Object.values(PROTOCOL_COMMANDS)].sort());

    for (const command of Object.values(PROTOCOL_COMMANDS)) {
      expect(main.includes(`"${command}"`) || main.includes(`IPC_CHANNELS.${command}`)).toBe(true);
    }
  });
});
