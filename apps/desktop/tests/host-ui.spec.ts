import { expect, test } from "@playwright/test";
import {
  expandSettledWorkLog,
  launchDesktop,
  makeAgentDir,
  makeUserDataDir,
  makeWorkspaceDir,
  removeTestDirectory,
} from "./helpers/electron-app";

test("shows a new session immediately and completes a select host dialog", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const workspaceDir = await makeWorkspaceDir();
  const env = {
    PHO_CODE_AGENT_DIR: agentDir,
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
    PHO_CODE_TEST_HOST_UI: "1",
  };

  try {
    const harness = await launchDesktop(userDataDir, { env });
    try {
      const page = await harness.firstWindow();
      await expect(page.getByTestId("bootstrap-state")).toHaveAccessibleName("About · 0.0.0");
      await expect(page.getByTestId("new-session")).toBeEnabled();
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("empty-session")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("right-sidebar")).toHaveAttribute("data-collapsed", "true");
      await expect(page.getByTestId("composer-rail")).toBeVisible();
      await expect(page.getByTestId("composer")).toBeVisible();
      await expect(page.getByTestId("session-item")).toBeVisible();
      await expect(page.getByTestId("resources-nav")).toHaveCount(0);
      await page.getByTestId("composer").fill("USE_TOOL");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("extension-dialog")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("extension-dialog")).toContainText("Allow harness_mark?");
      await page.getByRole("radio", { name: "Allow once", exact: true }).check();
      await page.getByTestId("extension-dialog-confirm").click();
      await expect(page.getByTestId("extension-dialog")).toHaveCount(0);
      await expect(page.getByTestId("empty-session")).toHaveCount(0);
      await expandSettledWorkLog(page);
      await expect(page.getByTestId("tool-card")).toContainText("Harness mark completed");
      await expect(page.getByTestId("transcript")).toContainText("Tool completed.");
    } finally {
      await harness.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});
