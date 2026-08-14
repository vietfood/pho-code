import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  launchDesktop,
  makeUserDataDir,
  makeWorkspaceDir,
  openSettingsSection,
  removeTestDirectory,
} from "./helpers/electron-app";

const TEST_OAUTH_PROVIDER_ID = "pho-test-oauth";
const TEST_OAUTH_AUTH_URL = "https://example.com/pho-code-oauth-test";
const TEST_OAUTH_SUCCESS_CODE = "test-ok";
const TEST_OAUTH_ACCESS_CANARY = "canary-access-token-pho-test";
const TEST_OAUTH_REFRESH_CANARY = "canary-refresh-token-pho-test";

test("completes the deterministic OAuth journey without exposing secrets or URLs", async () => {
  const userDataDir = await makeUserDataDir();
  const workspaceDir = await makeWorkspaceDir();

  try {
    const harness = await launchDesktop(userDataDir, {
      env: {
        PHO_CODE_TEST_WORKSPACE: workspaceDir,
        PHO_CODE_TEST_AUTH: "1",
      },
    });
    try {
      const page = await harness.firstWindow();
      await expect(page.getByTestId("bootstrap-state")).toContainText("About · 0.0.0");
      await openSettingsSection(page, "accounts");
      await expect(page.getByTestId("credential-settings")).toBeVisible();
      await page.getByTestId("provider-account-filter").fill("openai-codex");
      await page.getByTestId("provider-account-openai-codex").getByText("About this login").click();
      await expect(page.getByTestId("provider-disclosure-openai-codex")).toContainText("authentication type");

      await page.getByTestId("provider-account-filter").fill("Test OAuth");
      await expect(page.getByTestId(`provider-account-${TEST_OAUTH_PROVIDER_ID}`)).toBeVisible();
      await page.getByTestId(`provider-oauth-start-${TEST_OAUTH_PROVIDER_ID}`).click();
      await expect(page.getByTestId("provider-auth-flow")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("provider-auth-select-browser")).toBeVisible();
      await page.getByTestId("provider-auth-select-browser").check();
      await page.getByTestId("provider-auth-submit").click();
      await expect(page.getByTestId("provider-auth-input")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("provider-auth-open-link")).toBeVisible();
      await page.getByTestId("provider-auth-open-link").click();
      await page.getByTestId("provider-auth-input").fill(TEST_OAUTH_SUCCESS_CODE);
      await page.getByTestId("provider-auth-submit").click();
      await expect(page.getByTestId("configured-providers")).toContainText("Test OAuth Provider");
      await expect(page.getByTestId("configured-providers")).toContainText("Connected");
      await expect(page.getByTestId("provider-auth-flow")).toHaveCount(0);

      const pageText = await page.content();
      expect(pageText).not.toContain(TEST_OAUTH_AUTH_URL);
      expect(pageText).not.toContain(TEST_OAUTH_ACCESS_CANARY);
      expect(pageText).not.toContain(TEST_OAUTH_REFRESH_CANARY);

      await page.getByTestId("settings-close").click();
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("model-selector").click();
      await expect(page.getByTestId("model-picker-option")).toContainText("Test OAuth model");

      const opened = await harness.electronApp.evaluate(() => {
        return (globalThis as { __phoCodeOpenedAuthUrls?: string[] }).__phoCodeOpenedAuthUrls ?? [];
      });
      expect(opened.length).toBeGreaterThan(0);
      expect(opened.every((url) => url === TEST_OAUTH_AUTH_URL)).toBe(true);

      await openSettingsSection(page, "accounts");
      await page.getByTestId(`provider-logout-${TEST_OAUTH_PROVIDER_ID}`).click();
      await page.getByTestId(`provider-logout-confirm-${TEST_OAUTH_PROVIDER_ID}`).click();
      await expect(page.getByTestId("no-configured-providers")).toBeVisible();
    } finally {
      await harness.close();
    }

    const auth = JSON.parse(await readFile(join(userDataDir, "pi-agent", "auth.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(auth[TEST_OAUTH_PROVIDER_ID]).toBeUndefined();
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(workspaceDir);
  }
});
