import { expect, test } from "@playwright/test";
import {
  launchDesktop,
  makeAgentDir,
  makeUserDataDir,
  makeWorkspaceDir,
  removeTestDirectory,
  stopRunsAndClose,
} from "./helpers/electron-app";

test("Stop during a streaming run returns Send before the stream ends and keeps New session usable", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const workspaceDir = await makeWorkspaceDir();
  const env = {
    PHO_CODE_AGENT_DIR: agentDir,
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
  };

  try {
    const harness = await launchDesktop(userDataDir, { env });
    try {
      const page = await harness.firstWindow();
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("composer").fill("ABORT_ME");
      await page.getByRole("button", { name: "Send" }).click();

      const stop = page.getByTestId("stop-button");
      await expect(stop).toBeVisible({ timeout: 20_000 });
      await stop.click();

      // Stop must not raise the global busy flag: sidebar New session stays enabled.
      await expect(page.getByTestId("new-session")).toBeEnabled();
      // Send returns while the long stream would still be running.
      await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("transcript")).not.toContainText("END_ABORT_STREAM");

      await page.getByTestId("composer").fill("hello after stop");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("transcript")).toContainText("Hello from the test model.", { timeout: 20_000 });
    } finally {
      await harness.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});

test("Stop all cancels a background run and close stays bounded", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const workspaceDir = await makeWorkspaceDir();
  const env = {
    PHO_CODE_AGENT_DIR: agentDir,
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
    PHO_CODE_TEST_FEATURES: "1",
  };

  try {
    const harness = await launchDesktop(userDataDir, { env });
    let closed = false;
    try {
      const page = await harness.firstWindow();
      // Session A stays live behind its permission dock until cancelled.
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await expect(page.getByTestId("stop-all")).toHaveCount(0);
      await page.getByTestId("composer").fill("USE_SAFE_SHELL");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("extension-dialog")).toBeVisible({ timeout: 20_000 });

      // Session B streams in the foreground; both runs are live.
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("session-item")).toHaveCount(2);
      await page.getByTestId("composer").fill("ABORT_ME");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("stop-button")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("stop-all")).toContainText("Stop all (2)");

      // Stop cancels the selected chat; the background chat keeps running.
      await page.getByTestId("stop-button").click();
      await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("stop-all")).toHaveText("Stop all");

      // Teardown cancels the background run; close must not wait on a stuck abort.
      await stopRunsAndClose(page, harness);
      closed = true;
    } finally {
      if (!closed) {
        await harness.close();
      }
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});

test("Stop dismisses a pending permission card and returns Send", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const workspaceDir = await makeWorkspaceDir();
  const env = {
    PHO_CODE_AGENT_DIR: agentDir,
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
    PHO_CODE_TEST_FEATURES: "1",
  };

  try {
    const harness = await launchDesktop(userDataDir, { env });
    try {
      const page = await harness.firstWindow();
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("composer").fill("USE_SAFE_SHELL");
      await page.getByRole("button", { name: "Send" }).click();

      const dialog = page.getByTestId("extension-dialog");
      await expect(dialog).toBeVisible({ timeout: 20_000 });
      await expect(dialog).toContainText("Allow once");

      await page.getByTestId("stop-button").click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 10_000 });

      await page.getByTestId("composer").fill("hello after stop");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("transcript")).toContainText("Hello from the test model.", { timeout: 20_000 });
    } finally {
      await harness.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});
