import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { ripgrepPackagedRelativePath, SANDBOX_RUNTIME_PACKAGE } from "../../../packages/runtime/src/sandbox-artifact.ts";
import {
  allowOnceThenExpandWorkLog,
  expectNoDialogThenExpandWorkLog,
  expandSettledWorkLog,
  launchPackagedDesktop,
  makeUserDataDir,
  makeWorkspaceDir,
  openSessionActions,
  openSettingsSection,
  pathWithoutPi,
  removeTestDirectory,
  resolvePackagedAppPath,
  unselectedSessionItem,
  waitForPathAllowingOnce,
  writeResourceFixture,
  writeSandboxSettingsFile,
} from "./helpers/electron-app";

test("packaged macOS app runs bundled FFF retrieval and Trash without Pi CLI", async () => {
  const appPath = resolvePackagedAppPath();
  const featureRoot = join(appPath, "Contents", "Resources", "features", "@gotgenes", "pi-permission-system");
  expect(existsSync(join(featureRoot, "package.json"))).toBe(true);
  expect(existsSync(join(featureRoot, "src", "index.ts"))).toBe(true);
  expect(existsSync(join(featureRoot, "LICENSE"))).toBe(true);
  expect(existsSync(join(appPath, "Contents", "Resources", "THIRD_PARTY_NOTICES.txt"))).toBe(true);

  const userDataDir = await makeUserDataDir();
  const workspaceDir = await makeWorkspaceDir();
  await writeResourceFixture(workspaceDir);
  const fixturePath = join(workspaceDir, "disposable-fixture.txt");
  await writeFile(fixturePath, "owned\n");

  try {
    const harness = await launchPackagedDesktop(userDataDir, {
      env: {
        PHO_CODE_TEST_WORKSPACE: workspaceDir,
        PHO_CODE_TEST_MODEL: "1",
        PHO_CODE_TEST_FEATURES: "1",
        PATH: pathWithoutPi(),
      },
    });
    try {
      const page = await harness.firstWindow();
      await openSettingsSection(page, "permissions");
      await expect(page.getByTestId("settings-view")).toBeVisible();
      await page.getByTestId("permission-profile-developer").click();
      await page.getByTestId("permission-yolo-confirm").click();
      await page.getByTestId("settings-save").click();
      await expect(page.getByTestId("settings-save")).toBeDisabled();
      await page.getByTestId("settings-close").click();

      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("bootstrap-state").click();
      await expect(page.getByTestId("feature-diagnostics")).toContainText("permission-system 24.0.0 · loaded");
      await expect(page.getByTestId("feature-diagnostics")).toContainText("local-retrieval 2.0.0 · loaded");
      await expect(page.getByTestId("feature-diagnostics")).toContainText("recoverable-trash");
      await expect(page.getByTestId("feature-diagnostics")).not.toContainText("harness-note");
      await page.getByTestId("about-close").click();

      const packaged = await harness.electronApp.evaluate(async ({ app }) => ({
        packaged: app.isPackaged,
        name: app.getName(),
        resourcesPath: process.resourcesPath,
      }));
      expect(packaged.packaged).toBe(true);
      expect(packaged.name).toBe("Pho Code");
      expect(packaged.resourcesPath).toContain(`${appPath}/Contents/Resources`);
      expect(packaged.resourcesPath.includes("Workspace/Test/piui/packages")).toBe(false);

      await page.getByTestId("composer").fill("USE_TOOL");
      await page.getByRole("button", { name: "Send" }).click();
      await expandSettledWorkLog(page, 0);
      await expect(page.getByTestId("tool-card")).toContainText("Harness Mark");
      await expect(page.getByTestId("extension-dialog")).toHaveCount(0);

      await page.getByTestId("composer").fill("USE_FIND");
      await page.getByRole("button", { name: "Send" }).click();
      await expandSettledWorkLog(page, 1);
      await expect(page.getByTestId("tool-card").last()).toContainText("Find");
      await page.getByTestId("tool-card").last().click();
      await expect(page.getByTestId("tool-detail").last()).toContainText("disposable-fixture.txt");

      await page.getByTestId("composer").fill("USE_GREP");
      await page.getByRole("button", { name: "Send" }).click();
      await expandSettledWorkLog(page, 2);
      await expect(page.getByTestId("tool-card").last()).toContainText("Search");
      await page.getByTestId("tool-card").last().click();
      await expect(page.getByTestId("tool-detail").last()).toContainText("owned");

      await page.getByTestId("composer").fill("USE_TRASH");
      await page.getByRole("button", { name: "Send" }).click();
      await expandSettledWorkLog(page, 3);
      await expect(page.getByTestId("tool-card").last()).toContainText(/Trash|recoverable/i);
      expect(existsSync(fixturePath)).toBe(false);

      const notices = await readFile(join(appPath, "Contents", "Resources", "THIRD_PARTY_NOTICES.txt"), "utf8");
      expect(notices).toContain("@gotgenes/pi-permission-system 24.0.0");
      expect(notices).toContain("@earendil-works/pi-coding-agent 0.84.1");
    } finally {
      await harness.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(workspaceDir);
  }
});

test("packaged macOS app completes fake OAuth without Pi CLI or renderer URLs", async () => {
  const userDataDir = await makeUserDataDir();
  const workspaceDir = await makeWorkspaceDir();
  const testProviderId = "pho-test-oauth";
  const authUrl = "https://example.com/pho-code-oauth-test";
  const accessCanary = "canary-access-token-pho-test";

  try {
    const harness = await launchPackagedDesktop(userDataDir, {
      env: {
        PHO_CODE_TEST_WORKSPACE: workspaceDir,
        PHO_CODE_TEST_AUTH: "1",
        PATH: pathWithoutPi(),
      },
    });
    try {
      const page = await harness.firstWindow();
      await expect(page.getByTestId("bootstrap-state")).toHaveAccessibleName("About · 0.0.0");
      await openSettingsSection(page, "accounts");
      await expect(page.getByTestId("credential-settings")).toBeVisible();
      await page.getByTestId("provider-account-filter").fill("Test OAuth");
      await page.getByTestId(`provider-oauth-start-${testProviderId}`).click();
      await expect(page.getByTestId("provider-auth-flow")).toBeVisible();
      await page.getByTestId("provider-auth-select-browser").check();
      await page.getByTestId("provider-auth-submit").click();
      await expect(page.getByTestId("provider-auth-input")).toBeVisible({ timeout: 10_000 });
      await page.getByTestId("provider-auth-input").fill("test-ok");
      await page.getByTestId("provider-auth-submit").click();
      await expect(page.getByTestId("configured-providers")).toContainText("Connected");
      expect(await page.content()).not.toContain(authUrl);
      expect(await page.content()).not.toContain(accessCanary);

      await page.getByTestId("settings-close").click();
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("model-selector").click();
      await expect(page.getByRole("option", { name: /Test OAuth model/ })).toBeVisible();

      const opened = await harness.electronApp.evaluate(() => {
        return (globalThis as { __phoCodeOpenedAuthUrls?: string[] }).__phoCodeOpenedAuthUrls ?? [];
      });
      expect(opened.length).toBeGreaterThan(0);
      expect(opened.every((url) => url === authUrl)).toBe(true);

      await openSettingsSection(page, "accounts");
      await page.getByTestId(`provider-logout-${testProviderId}`).click();
      await page.getByTestId(`provider-logout-confirm-${testProviderId}`).click();
      await expect(page.getByTestId(`provider-account-${testProviderId}`)).not.toContainText("Connected");
    } finally {
      await harness.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(workspaceDir);
  }
});

test("packaged app keeps a background run, archive metadata, and Trash removal", async () => {
  const userDataDir = await makeUserDataDir();
  const workspaceDir = await makeWorkspaceDir();

  try {
    const first = await launchPackagedDesktop(userDataDir, {
      env: {
        PHO_CODE_TEST_WORKSPACE: workspaceDir,
        PHO_CODE_TEST_MODEL: "1",
        PATH: pathWithoutPi(),
      },
    });
    try {
      const page = await first.firstWindow();
      await expect(page.getByTestId("bootstrap-state")).toHaveAccessibleName("About · 0.0.0");
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("composer").fill("ABORT_ME");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("session-activity")).toHaveAttribute("data-activity", "working", { timeout: 20_000 });

      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("session-item")).toHaveCount(2);
      await page.getByTestId("composer").fill("hello from B");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("transcript")).toContainText("Hello from the test model.", { timeout: 20_000 });

      await unselectedSessionItem(page).click();
      await expect(page.getByTestId("transcript")).toContainText("BEGIN_ABORT_STREAM", { timeout: 20_000 });
      await expect(page.getByTestId("transcript")).toContainText("END_ABORT_STREAM", { timeout: 20_000 });

      await openSessionActions(unselectedSessionItem(page));
      await page.getByTestId("archive-session").click();
      await expect(page.getByTestId("session-item")).toHaveCount(1);
    } finally {
      await first.close();
    }

    const second = await launchPackagedDesktop(userDataDir, {
      env: {
        PHO_CODE_TEST_WORKSPACE: workspaceDir,
        PHO_CODE_TEST_MODEL: "1",
        PATH: pathWithoutPi(),
      },
    });
    try {
      const page = await second.firstWindow();
      await expect(page.getByTestId("session-item")).toHaveCount(1);
      await page.getByTestId("session-item").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await openSettingsSection(page, "archived");
      await expect(page.getByTestId("archived-chat-item")).toBeVisible();
      await page.getByTestId("restore-session").click();
      await page.getByTestId("settings-close").click();
      await expect(page.getByTestId("session-item")).toHaveCount(2);

      await openSessionActions(unselectedSessionItem(page));
      await page.getByTestId("remove-session").click();
      await expect(page.getByTestId("remove-session-dialog")).toBeVisible();
      await page.getByTestId("remove-session-confirm").click();
      await expect(page.getByTestId("session-item")).toHaveCount(1);
    } finally {
      await second.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(workspaceDir);
  }
});

test("packaged macOS app undoes a created file through OS Trash without Pi CLI", async () => {
  const userDataDir = await makeUserDataDir();
  const workspaceDir = await makeWorkspaceDir();
  const createdPath = join(workspaceDir, "agent-note.txt");

  try {
    const harness = await launchPackagedDesktop(userDataDir, {
      env: {
        PHO_CODE_TEST_WORKSPACE: workspaceDir,
        PHO_CODE_TEST_MODEL: "1",
        PATH: pathWithoutPi(),
      },
    });
    try {
      const page = await harness.firstWindow();
      await expect(page.getByTestId("bootstrap-state")).toHaveAccessibleName("About · 0.0.0");
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("composer").fill("USE_WRITE");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("transcript")).toContainText("Tool completed.", { timeout: 20_000 });
      expect(existsSync(createdPath)).toBe(true);
      await expandSettledWorkLog(page);
      await page.getByTestId("tool-open-review").click();
      await expect(page.getByTestId("change-review-window")).toBeVisible();
      await page.getByTestId("change-review-undo").click();
      await expect(page.getByTestId("change-review-undo-preview")).toBeVisible();
      await expect(page.getByTestId("change-review-undo-confirm")).toContainText("Move to Trash");
      await page.getByTestId("change-review-undo-confirm").click();
      await expect(page.getByTestId("change-review-status")).toContainText("Undone");
      expect(existsSync(createdPath)).toBe(false);
      expect(existsSync(join(userDataDir, "change-ledger", "v1"))).toBe(true);
    } finally {
      await harness.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(workspaceDir);
  }
});

test("packaged macOS app loads staged rg, starts sandbox healthy, wraps bash, and denies out-of-policy writes without Pi or Homebrew", async () => {
  test.setTimeout(120_000);
  const appPath = resolvePackagedAppPath();
  const rgRelative = ripgrepPackagedRelativePath();
  expect(rgRelative).toBeDefined();
  const rgPath = join(appPath, "Contents", "Resources", "features", rgRelative ?? "");
  expect(existsSync(rgPath)).toBe(true);
  const notices = await readFile(join(appPath, "Contents", "Resources", "THIRD_PARTY_NOTICES.txt"), "utf8");
  expect(notices).toContain(`${SANDBOX_RUNTIME_PACKAGE} 0.0.73`);
  expect(notices).toContain("ripgrep 15.2.0");
  expect(notices).not.toContain("pi-sandbox");

  const userDataDir = await makeUserDataDir();
  const workspaceDir = await makeWorkspaceDir();
  const extraRoot = await mkdtemp(join(homedir(), "pho-code-sandbox-packaged-extra-"));
  const deniedFile = join(extraRoot, "blocked-note.txt");
  await writeSandboxSettingsFile(userDataDir, true);

  try {
    const harness = await launchPackagedDesktop(userDataDir, {
      env: {
        PHO_CODE_TEST_WORKSPACE: workspaceDir,
        PHO_CODE_TEST_MODEL: "1",
        PHO_CODE_TEST_FEATURES: "1",
        PATH: pathWithoutPi(),
      },
    });
    try {
      const page = await harness.firstWindow();
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();

      await openSettingsSection(page, "sandbox");
      await expect(page.getByTestId("sandbox-settings")).toContainText("Seatbelt for agent bash");
      await expect(page.getByTestId("sandbox-settings")).toContainText("skip permission asks");
      await expect(page.getByTestId("sandbox-enabled")).toBeChecked();
      await expect(page.getByTestId("sandbox-status")).toContainText(/Healthy/i, { timeout: 30_000 });
      await page.getByTestId("settings-close").click();

      await page.getByTestId("composer").fill("USE_SANDBOX_TOUCH");
      await page.getByRole("button", { name: "Send" }).click();
      await expectNoDialogThenExpandWorkLog(page, 0);
      expect(existsSync(join(workspaceDir, "sandbox-allowed.txt"))).toBe(true);

      await page.getByTestId("composer").fill("USE_SANDBOX_CURL");
      await page.getByRole("button", { name: "Send" }).click();
      await expectNoDialogThenExpandWorkLog(page, 1);
      await page.getByTestId("tool-card").last().click();
      await expect(page.getByTestId("tool-detail").last()).toContainText("Sandbox blocked");
      await expect(page.getByTestId("tool-detail").last()).toContainText("Do not retry");
      await expect(page.getByTestId("tool-detail").last()).toContainText("Settings → Sandbox");

      await page.getByTestId("composer").fill(`USE_SANDBOX_WRITE_ABS:${deniedFile}`);
      await page.getByRole("button", { name: "Send" }).click();
      await expectNoDialogThenExpandWorkLog(page, 2);
      await page.getByTestId("tool-card").last().click();
      await expect(page.getByTestId("tool-detail").last()).toContainText(/denied|outside|protected|Sandbox policy/i);
      expect(existsSync(deniedFile)).toBe(false);
    } finally {
      await harness.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(workspaceDir);
    spawnSync("/usr/bin/trash", [extraRoot], { encoding: "utf8" });
  }
});

test("packaged macOS app loads Plan/Agent, ask-back, Plan write-off, Execute write, and Agent todos without juicesharp or pi-tui", async () => {
  test.setTimeout(180_000);
  const appPath = resolvePackagedAppPath();
  const resources = join(appPath, "Contents", "Resources");
  expect(existsSync(join(resources, "features", "@juicesharp"))).toBe(false);
  expect(existsSync(join(resources, "app.asar.unpacked", "node_modules", "@juicesharp"))).toBe(false);
  const notices = await readFile(join(resources, "THIRD_PARTY_NOTICES.txt"), "utf8");
  expect(notices).toContain("juicesharp ask-user questionnaire (adapted source)");
  expect(notices).not.toMatch(/^## @juicesharp/m);
  expect(notices).not.toContain("@earendil-works/pi-tui");

  const userDataDir = await makeUserDataDir();
  const workspaceDir = await makeWorkspaceDir();
  const createdPath = join(workspaceDir, "agent-note.txt");

  try {
    const harness = await launchPackagedDesktop(userDataDir, {
      env: {
        PHO_CODE_TEST_WORKSPACE: workspaceDir,
        PHO_CODE_TEST_MODEL: "1",
        PHO_CODE_TEST_FEATURES: "1",
        PATH: pathWithoutPi(),
      },
    });
    try {
      const page = await harness.firstWindow();
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("bootstrap-state").click();
      await expect(page.getByTestId("feature-diagnostics")).toContainText("plan-agent 0.1.0 · loaded");
      await page.getByTestId("about-close").click();

      await expect(page.getByTestId("composer-context-button")).toHaveAccessibleName("Agent mode and attachments");
      await page.getByTestId("composer-context-button").click();
      await expect(page.getByTestId("composer-context-mode-plan")).toHaveAttribute(
        "title",
        "Explore and write a plan. File writes are off. Shell is not sandboxed.",
      );
      await page.getByTestId("composer-context-button").click();

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
      await card.locator("label.ask-user-option", { hasText: "Patch" }).click();
      await page.getByTestId("ask-user-custom").fill("Keep the permission boundary.");
      await page.getByTestId("extension-dialog-confirm").click();
      await expect(page.getByTestId("ask-user-review")).toBeVisible();
      await page.getByTestId("extension-dialog-confirm").click();
      await expect(page.getByTestId("extension-dialog")).toHaveCount(0);
      await expect(page.getByTestId("transcript")).toContainText("Tool completed.", { timeout: 20_000 });

      await page.getByTestId("composer-context-button").click();
      await page.getByTestId("composer-context-mode-plan").click();
      await expect(page.getByTestId("composer-context-button")).toHaveAccessibleName("Plan mode and attachments");

      await page.getByTestId("composer").fill("USE_WRITE");
      await page.getByRole("button", { name: "Send" }).click();
      await expandSettledWorkLog(page, 1);
      await page.getByTestId("tool-card").last().click();
      await expect(page.getByTestId("tool-detail").last()).toContainText(/Plan mode keeps write|write not found/i);
      expect(existsSync(createdPath)).toBe(false);

      await page.getByTestId("composer").fill("USE_PLAN_DOC");
      await page.getByRole("button", { name: "Send" }).click();
      await allowOnceThenExpandWorkLog(page, 2);
      await expect(page.getByTestId("plan-document-panel")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("plan-document-preview")).toContainText("Packaged plan");
      await page.getByTestId("plan-execute").click();
      await waitForPathAllowingOnce(page, createdPath);
      const executeLog = Math.max(0, (await page.getByTestId("work-log-toggle").count()) - 1);
      await expandSettledWorkLog(page, executeLog);
      await page.getByTestId("tool-open-review").last().click();
      await expect(page.getByTestId("change-review-window")).toBeVisible();
      await expect(page.getByTestId("change-review-diff")).toContainText("hello from agent");

      const todoLog = await page.getByTestId("work-log-toggle").count();
      await page.getByTestId("composer").fill("USE_TODO");
      await page.getByRole("button", { name: "Send" }).click();
      await allowOnceThenExpandWorkLog(page, todoLog);
      await expect(page.getByTestId("tool-todo-list").last()).toContainText("Group remaining work");
      const planTodos = page.getByTestId("plan-todo-list");
      if (!(await planTodos.isVisible().catch(() => false))) {
        await page.getByTestId("right-sidebar-surface-plan").click();
      }
      await expect(planTodos).toContainText("Group remaining work");
    } finally {
      await harness.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(workspaceDir);
  }
});
