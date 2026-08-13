import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchDesktop, makeAgentDir, makeUserDataDir, removeTestDirectory } from "./helpers/electron-app";

test("explicit quit disposes the runtime once", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const shutdownProbe = join(userDataDir, "shutdown-probe.json");
  const harness = await launchDesktop(userDataDir, {
    env: {
      PHO_CODE_SHUTDOWN_PROBE: shutdownProbe,
      PHO_CODE_AGENT_DIR: agentDir,
    },
  });

  try {
    await harness.firstWindow();
    await harness.electronApp.evaluate(async ({ app }) => {
      app.quit();
      app.quit();
    });
    await harness.electronApp.waitForEvent("close");
  } finally {
    try {
      await harness.close();
    } catch {
      // The app may already have exited after the explicit quit.
    }
  }

  const probe = JSON.parse(await readFile(shutdownProbe, "utf8")) as { disposeCount: number };
  expect(probe.disposeCount).toBe(1);
  await removeTestDirectory(userDataDir);
  await removeTestDirectory(agentDir);
});
