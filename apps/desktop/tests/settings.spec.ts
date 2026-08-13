import { expect, test } from "@playwright/test";
import {
  launchDesktop,
  makeUserDataDir,
  makeWorkspaceDir,
  removeTestDirectory,
} from "./helpers/electron-app";

test("settings persist theme and apply a managed permission profile", async () => {
  const userDataDir = await makeUserDataDir();
  const workspaceDir = await makeWorkspaceDir();
  const env = {
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
    PHO_CODE_TEST_FEATURES: "1",
  };

  try {
    const first = await launchDesktop(userDataDir, { env });
    try {
      const page = await first.firstWindow();
      await page.getByTestId("open-settings").click();
      await expect(page.getByTestId("settings-view")).toBeVisible();
      await expect(page.getByTestId("app-agent-dir-notice")).toBeVisible();
      await page.getByTestId("appearance-theme-dark").click();
      await page.getByTestId("permission-profile-guarded").check();
      await page.getByTestId("settings-save").click();
      await expect(page.getByTestId("settings-save")).toBeDisabled();
      const theme = await first.electronApp.evaluate(({ nativeTheme }) => nativeTheme.themeSource);
      expect(theme).toBe("dark");
      await page.getByTestId("settings-close").click();
    } finally {
      await first.close();
    }

    const second = await launchDesktop(userDataDir, { env });
    try {
      const page = await second.firstWindow();
      const theme = await second.electronApp.evaluate(({ nativeTheme }) => nativeTheme.themeSource);
      expect(theme).toBe("dark");
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("composer").fill("USE_TOOL");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("extension-dialog")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("extension-dialog")).toContainText("Permission Required");
      await page.getByRole("radio", { name: "Yes", exact: true }).check();
      await page.getByTestId("extension-dialog-confirm").click();
      await expect(page.getByTestId("tool-card")).toContainText("Harness mark completed", { timeout: 20_000 });
    } finally {
      await second.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(workspaceDir);
  }
});
