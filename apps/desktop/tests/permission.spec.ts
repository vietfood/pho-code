import { expect, test } from "@playwright/test";
import {
  launchDesktop,
  makeAgentDir,
  makeUserDataDir,
  makeWorkspaceDir,
  removeTestDirectory,
  writeResourceFixture,
} from "./helpers/electron-app";

test("baked permission feature prompts through select host UI", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const workspaceDir = await makeWorkspaceDir();
  await writeResourceFixture(workspaceDir);
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
      await page.getByTestId("bootstrap-state").click();
      await expect(page.getByTestId("feature-diagnostics")).toContainText("permission-system");
      await expect(page.getByTestId("feature-diagnostics")).not.toContainText("harness-note");
      await page.getByTestId("composer").fill("USE_TOOL");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("extension-dialog")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("extension-dialog")).toContainText("Permission Required");
      await expect(page.getByTestId("extension-dialog")).toContainText("harness_mark");
      await page.getByRole("radio", { name: "Yes", exact: true }).check();
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("extension-dialog")).toHaveCount(0);
      await expect(page.getByTestId("tool-card")).toContainText("Harness mark completed", { timeout: 20_000 });
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
