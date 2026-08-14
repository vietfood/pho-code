import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { PROTOCOL_COMMANDS } from "@pho-code/protocol";
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
    const [preload, ipc, main] = await Promise.all([
      readDesktop("electron/preload.ts"),
      readDesktop("electron/ipc.ts"),
      readDesktop("electron/main.ts"),
    ]);

    for (const command of Object.values(PROTOCOL_COMMANDS)) {
      expect(preload).toContain(`${command}:`);
      expect(ipc).toContain(`${command}:`);
      expect(main).toContain(`IPC_CHANNELS.${command}`);
    }
  });
});
