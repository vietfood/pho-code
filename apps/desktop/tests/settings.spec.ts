import { expect, test } from "@playwright/test";
import {
  expandSettledWorkLog,
  launchDesktop,
  makeUserDataDir,
  makeWorkspaceDir,
  openSettingsSection,
  removeTestDirectory,
} from "./helpers/electron-app";

test("settings persist palette mode glass and apply a managed permission profile", async () => {
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
      await openSettingsSection(page, "appearance");
      await expect(page.getByTestId("settings-view")).toBeVisible();
      await page.getByTestId("appearance-palette-gruvbox").click();
      await expect(page.getByTestId("appearance-palette-gruvbox")).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("appearance-mode-dark").click();
      await expect(page.getByTestId("appearance-mode-dark")).toHaveAttribute("aria-pressed", "true");
      // Controlled checkbox: click + assert; Playwright check() races the async settings write.
      await page.getByTestId("appearance-glass-enabled").click();
      await expect(page.getByTestId("appearance-glass-enabled")).toBeChecked();
      await page.getByTestId("appearance-glass-strength").fill("70");
      await expect(page.getByTestId("appearance-glass-strength-value")).toContainText("70%");
      await page.getByTestId("appearance-ui-font-size-increase").click();
      await page.getByTestId("appearance-ui-font-size-increase").click();
      await page.getByTestId("appearance-chat-font-size-increase").click();
      await expect(page.getByTestId("appearance-ui-font-size")).toContainText("18px");
      await expect(page.getByTestId("appearance-chat-font-size")).toContainText("15px");
      const attrs = await page.evaluate(() => ({
        palette: document.documentElement.dataset.palette,
        appearance: document.documentElement.dataset.appearance,
        glass: document.documentElement.dataset.glass,
        root: getComputedStyle(document.documentElement).fontSize,
        chat: getComputedStyle(document.documentElement).getPropertyValue("--font-size-chat").trim(),
        glassOpacity: getComputedStyle(document.documentElement).getPropertyValue("--glass-opacity").trim(),
        sidebarGlassOpacity: getComputedStyle(document.documentElement)
          .getPropertyValue("--sidebar-glass-opacity")
          .trim(),
        composerGlassOpacity: getComputedStyle(document.documentElement)
          .getPropertyValue("--composer-glass-opacity")
          .trim(),
        sidebar: getComputedStyle(document.querySelector('[data-testid="new-session"]')!).fontSize,
      }));
      expect(attrs.palette).toBe("gruvbox");
      expect(attrs.appearance).toBe("dark");
      expect(attrs.glass).toBe("on");
      expect(Number.parseInt(attrs.composerGlassOpacity, 10)).toBeLessThan(100);
      expect(Number.parseInt(attrs.sidebarGlassOpacity, 10)).toBeLessThan(Number.parseInt(attrs.glassOpacity, 10));
      expect(attrs.root).toBe("18px");
      expect(attrs.chat).toBe("15px");
      expect(Number.parseFloat(attrs.sidebar)).toBeGreaterThan(12);

      await page.getByTestId("appearance-palette-one-dark").click();
      await expect(page.getByTestId("appearance-mode-light")).toBeDisabled();
      await expect(page.getByTestId("appearance-mode-system")).toBeDisabled();
      await expect(page.getByTestId("appearance-mode-dark")).toHaveAttribute("aria-pressed", "true");

      await openSettingsSection(page, "permissions");
      await expect(page.getByTestId("app-agent-dir-notice")).toBeVisible();
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
      await openSettingsSection(page, "appearance");
      await expect(page.getByTestId("appearance-palette-one-dark")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("appearance-mode-dark")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("appearance-glass-enabled")).toBeChecked();
      await expect(page.getByTestId("appearance-glass-strength-value")).toContainText("70%");
      await expect(page.getByTestId("appearance-ui-font-size")).toContainText("18px");
      await expect(page.getByTestId("appearance-chat-font-size")).toContainText("15px");
      await page.getByTestId("settings-close").click();
      const sidebarFont = await page.evaluate(
        () => getComputedStyle(document.querySelector('[data-testid="new-session"]')!).fontSize,
      );
      expect(Number.parseFloat(sidebarFont)).toBeGreaterThan(12);
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("composer").fill("USE_TOOL");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("extension-dialog")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("extension-dialog")).toContainText("Permission Required");
      await page.getByRole("radio", { name: "Yes", exact: true }).check();
      await page.getByTestId("extension-dialog-confirm").click();
      await expandSettledWorkLog(page);
      await expect(page.getByTestId("tool-card")).toContainText("Harness mark completed");
    } finally {
      await second.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(workspaceDir);
  }
});
