import { expect, test } from "@playwright/test";
import {
  expandSettledWorkLog,
  launchDesktop,
  makeAgentDir,
  makeUserDataDir,
  makeWorkspaceDir,
  removeTestDirectory,
} from "./helpers/electron-app";

test("ask-back card answers two questions without mixing permission chrome", async () => {
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
      await page.getByTestId("composer").fill("USE_ASK_USER");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("extension-dialog")).toBeVisible({ timeout: 20_000 });
      if (await page.getByRole("radio", { name: "Allow once", exact: true }).isVisible()) {
        await page.getByRole("radio", { name: "Allow once", exact: true }).check();
        await page.getByTestId("extension-dialog-confirm").click();
        await expect(page.locator('[data-kind="questionnaire"]')).toBeVisible({ timeout: 20_000 });
      }
      const card = page.locator('[data-kind="questionnaire"]');
      await expect(card).toBeVisible();
      await expect(card).not.toContainText("Pending approval");
      await expect(card).toContainText("Which approach should we use?");
      await card.locator("label.ask-user-option", { hasText: "Patch" }).click();
      await expect(card).toContainText("What should the commit message emphasize?");
      await page.getByTestId("ask-user-custom").fill("Keep the permission boundary.");
      await page.getByTestId("extension-dialog-confirm").click();
      await expect(page.getByTestId("ask-user-review")).toBeVisible();
      await page.getByTestId("extension-dialog-confirm").click();
      await expect(page.getByTestId("extension-dialog")).toHaveCount(0);
      await expandSettledWorkLog(page);
      const askUserRow = page.getByTestId("tool-card").filter({ has: page.locator('[data-work-icon="ask"]') });
      await askUserRow.click();
      await expect(page.getByTestId("tool-detail")).toContainText("Patch");
      await expect(page.getByTestId("tool-detail")).toContainText("Keep the permission boundary.");

      await page.getByTestId("composer").fill("USE_SAFE_SHELL");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("extension-dialog")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("extension-dialog")).toContainText("Allow once");
      await expect(page.locator('[data-kind="questionnaire"]')).toHaveCount(0);
      await page.getByRole("radio", { name: "Allow once", exact: true }).check();
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("extension-dialog")).toHaveCount(0);
    } finally {
      await harness.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});
