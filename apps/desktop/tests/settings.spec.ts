import { expect, test, type Page } from "@playwright/test";
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
      await expect(page.getByTestId("appearance-chat-font-size")).toContainText("16px");
      await chooseInstalledFont(page, "appearance-ui-font-family", "Lucida Grande");
      await chooseInstalledFont(page, "appearance-code-font-family", "Menlo");
      await expect(page.getByTestId("appearance-code-font-preview")).toBeVisible();
      await expect(page.getByTestId("appearance-font-smoothing")).toBeChecked();
      await page.getByTestId("appearance-font-smoothing").click();
      await expect(page.getByTestId("appearance-font-smoothing")).not.toBeChecked();
      const attrs = await page.evaluate(() => ({
        palette: document.documentElement.dataset.palette,
        appearance: document.documentElement.dataset.appearance,
        workIcons: document.documentElement.dataset.workIcons,
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
        sans: document.documentElement.style.getPropertyValue("--font-sans"),
        mono: document.documentElement.style.getPropertyValue("--font-mono"),
        smoothing: document.documentElement.style.getPropertyValue("-webkit-font-smoothing"),
      }));
      expect(attrs.palette).toBe("gruvbox");
      expect(attrs.appearance).toBe("dark");
      expect(attrs.workIcons).toBe("lucide");
      expect(attrs.glass).toBe("on");
      expect(Number.parseInt(attrs.composerGlassOpacity, 10)).toBeLessThan(100);
      expect(Number.parseInt(attrs.sidebarGlassOpacity, 10)).toBe(Number.parseInt(attrs.glassOpacity, 10));
      expect(attrs.root).toBe("18px");
      expect(attrs.chat).toBe("16px");
      expect(Number.parseFloat(attrs.sidebar)).toBeGreaterThan(12);
      expect(attrs.sans).toContain("Lucida Grande");
      expect(attrs.mono).toContain("Menlo");
      expect(attrs.smoothing).toBe("");

      await page.getByTestId("appearance-palette-one-dark").click();
      await expect(page.getByTestId("appearance-mode-light")).toBeDisabled();
      await expect(page.getByTestId("appearance-mode-system")).toBeDisabled();
      await expect(page.getByTestId("appearance-mode-dark")).toHaveAttribute("aria-pressed", "true");

      await openSettingsSection(page, "permissions");
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
      await expect(page.getByTestId("appearance-icons-lucide")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("appearance-mode-dark")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("appearance-glass-enabled")).toBeChecked();
      await expect(page.getByTestId("appearance-glass-strength-value")).toContainText("70%");
      await expect(page.getByTestId("appearance-ui-font-size")).toContainText("18px");
      await expect(page.getByTestId("appearance-chat-font-size")).toContainText("16px");
      await expectFontFamilyControl(page, "appearance-ui-font-family", "Lucida Grande");
      await expectFontFamilyControl(page, "appearance-code-font-family", "Menlo");
      await expect(page.getByTestId("appearance-font-smoothing")).not.toBeChecked();
      const persistedFonts = await page.evaluate(() => ({
        sans: document.documentElement.style.getPropertyValue("--font-sans"),
        mono: document.documentElement.style.getPropertyValue("--font-mono"),
        smoothing: document.documentElement.style.getPropertyValue("-webkit-font-smoothing"),
      }));
      expect(persistedFonts.sans).toContain("Lucida Grande");
      expect(persistedFonts.mono).toContain("Menlo");
      expect(persistedFonts.smoothing).toBe("");
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
      await expect(page.getByTestId("extension-dialog")).toBeVisible({ timeout: 20_000 });
      await page.getByRole("radio", { name: "Allow once", exact: true }).check();
      await page.getByTestId("extension-dialog-confirm").click();
      await expandSettledWorkLog(page);
      await expect(page.getByTestId("tool-card")).toContainText("Harness Mark");
    } finally {
      await second.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(workspaceDir);
  }
});

/**
 * A chat opened before an appearance change used to keep its own settings copy.
 * The next process-scoped event republished that copy and reverted the theme,
 * which showed up as the palette flipping while a new chat was being created.
 */
test("a process-scoped event keeps the current appearance on an already open chat", async () => {
  const userDataDir = await makeUserDataDir();
  const workspaceDir = await makeWorkspaceDir();
  const env = {
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
  };

  try {
    const harness = await launchDesktop(userDataDir, { env });
    try {
      const page = await harness.firstWindow();
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible({ timeout: 30_000 });

      await openSettingsSection(page, "appearance");
      await page.getByTestId("appearance-palette-gruvbox").click();
      await expect(page.getByTestId("appearance-palette-gruvbox")).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("appearance-mode-dark").click();
      await expect(page.getByTestId("appearance-mode-dark")).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("settings-close").click();

      // The permission extension emits this when a newly created chat binds with
      // YOLO on; the deterministic lane does not load it, so deliver it directly.
      await harness.electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send("pho-code:v1:event", {
          protocolVersion: 1,
          sequence: 999_999,
          occurredAt: new Date().toISOString(),
          type: "permissionStatus",
          payload: { yoloMode: true },
        });
      });
      await expect(page.getByTestId("yolo-indicator")).toBeVisible();

      const theme = await page.evaluate(() => ({
        palette: document.documentElement.dataset.palette,
        appearance: document.documentElement.dataset.appearance,
      }));
      expect(theme).toEqual({ palette: "gruvbox", appearance: "dark" });
    } finally {
      await harness.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(workspaceDir);
  }
});

async function chooseInstalledFont(page: Page, testId: string, family: string): Promise<void> {
  const control = page.getByTestId(testId);
  await expect(control).toBeEnabled({ timeout: 10_000 });
  const tag = await control.evaluate((element) => element.tagName);
  if (tag === "INPUT") {
    await control.fill(family);
    await control.blur();
    return;
  }
  await control.click();
  const filter = page.getByTestId(`${testId}-filter`);
  if (await filter.isVisible()) {
    await filter.fill(family);
  }
  await page.locator(`[data-testid="${testId}-option"][data-family="${family}"]`).click();
}

async function expectFontFamilyControl(page: Page, testId: string, family: string): Promise<void> {
  const control = page.getByTestId(testId);
  await expect(control).toBeEnabled({ timeout: 10_000 });
  const tag = await control.evaluate((element) => element.tagName);
  if (tag === "INPUT") {
    await expect(control).toHaveValue(family);
    return;
  }
  await expect(control).toContainText(family);
}
