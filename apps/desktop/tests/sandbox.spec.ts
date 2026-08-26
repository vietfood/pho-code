import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  allowOnceIfPrompted,
  desktopResourcesDir,
  expectNoDialogThenExpandWorkLog,
  expandSettledWorkLog,
  launchDesktop,
  makeAgentDir,
  makeUserDataDir,
  makeWorkspaceDir,
  openSettingsSection,
  pathWithoutPi,
  removeTestDirectory,
  stageRipgrepFixture,
  writeSandboxSettingsFile,
} from "./helpers/electron-app";

test("healthy sandbox skips bash asks, denies curl at the OS, and disable restores permission asks", async () => {
  test.setTimeout(120_000);
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const workspaceDir = await makeWorkspaceDir();
  await writeSandboxSettingsFile(userDataDir, true);
  await stageRipgrepFixture(desktopResourcesDir());
  const git = spawnSync("git", ["init"], { cwd: workspaceDir, encoding: "utf8" });
  expect(git.status).toBe(0);
  const env = {
    PHO_CODE_AGENT_DIR: agentDir,
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
    PHO_CODE_TEST_FEATURES: "1",
    PATH: pathWithoutPi(),
  };

  try {
    const harness = await launchDesktop(userDataDir, { env });
    try {
      const page = await harness.firstWindow();
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("bootstrap-state").click();
      await expect(page.getByTestId("feature-diagnostics")).toContainText("permission-system");
      await expect(page.getByTestId("feature-diagnostics")).toContainText("agent-tool-sandbox");
      await page.getByTestId("about-close").click();

      await openSettingsSection(page, "sandbox");
      await page.getByTestId("sandbox-disclosure-trigger").click();
      await expect(page.getByTestId("sandbox-disclosure")).toContainText("Seatbelt for agent bash");
      await expect(page.getByTestId("sandbox-enabled")).toBeChecked();
      await expect(page.getByTestId("sandbox-status")).toContainText(/Healthy/i, { timeout: 30_000 });
      await page.getByTestId("settings-close").click();

      await page.getByTestId("composer").fill("USE_SANDBOX_PWD");
      await page.getByRole("button", { name: "Send" }).click();
      await expectNoDialogThenExpandWorkLog(page, 0);
      await expect(page.getByTestId("tool-card").last()).toContainText(/Run/i);
      await expect(page.getByTestId("tool-sandbox-shield").last()).toBeVisible();
      await expect(page.getByTestId("tool-card").last().getByTestId("tool-chip")).toHaveText("pwd");

      await page.getByTestId("composer").fill("USE_SANDBOX_TOUCH");
      await page.getByRole("button", { name: "Send" }).click();
      await expectNoDialogThenExpandWorkLog(page, 1);
      await expect(page.getByTestId("tool-card").last()).toContainText(/Run/i);
      await expect(page.getByTestId("tool-sandbox-shield").last()).toBeVisible();
      expect(existsSync(join(workspaceDir, "sandbox-allowed.txt"))).toBe(true);

      await page.getByTestId("composer").fill("USE_SANDBOX_CURL");
      await page.getByRole("button", { name: "Send" }).click();
      await expectNoDialogThenExpandWorkLog(page, 2);
      await expect(page.getByTestId("tool-card").last()).toContainText(/Run|not permitted|denied|unavailable/i);
      await expect(page.getByTestId("tool-sandbox-shield").last()).toBeVisible();
      await page.getByTestId("tool-card").last().click();
      await expect(page.getByTestId("tool-detail").last()).toContainText("Do not retry");
      await expect(page.getByTestId("tool-detail").last()).toContainText("Settings → Sandbox");
      await expect(page.getByTestId("tool-card").last()).not.toContainText(/<html/i);

      await openSettingsSection(page, "sandbox");
      await page.getByTestId("sandbox-enabled").click();
      await expect(page.getByTestId("sandbox-enabled")).not.toBeChecked({ timeout: 30_000 });
      await expect(page.getByTestId("sandbox-status")).toContainText(/Off/i);
      await page.getByTestId("settings-close").click();

      await page.getByTestId("composer").fill("USE_WRAPPER");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("extension-dialog")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("extension-dialog")).toContainText("Allow once");
      await allowOnceIfPrompted(page);
      await expandSettledWorkLog(page, 3);
      await expect(page.getByTestId("tool-card").last().getByTestId("tool-sandbox-shield")).toHaveCount(0);
      await expandSettledWorkLog(page, 0);
      await expect(page.getByTestId("tool-sandbox-shield").first()).toBeVisible();
    } finally {
      await harness.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});

test("healthy sandbox skips workspace write, denies a sibling path, and extra write path allows that file tool", async () => {
  test.setTimeout(120_000);
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const workspaceDir = await makeWorkspaceDir();
  const extraRoot = await mkdtemp(join(homedir(), "pho-code-sandbox-file-extra-"));
  const extraWrite = join(extraRoot, "allowed");
  const extraDenied = join(extraRoot, "denied");
  await mkdir(extraWrite);
  await mkdir(extraDenied);
  const extraFile = join(extraWrite, "extra-note.txt");
  const deniedFile = join(extraDenied, "blocked-note.txt");
  await writeSandboxSettingsFile(userDataDir, true);
  await stageRipgrepFixture(desktopResourcesDir());
  const env = {
    PHO_CODE_AGENT_DIR: agentDir,
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
    PHO_CODE_TEST_FEATURES: "1",
    PATH: pathWithoutPi(),
  };

  try {
    const harness = await launchDesktop(userDataDir, { env });
    try {
      const page = await harness.firstWindow();
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();

      await openSettingsSection(page, "sandbox");
      await expect(page.getByTestId("sandbox-enabled")).toBeChecked();
      await expect(page.getByTestId("sandbox-status")).toContainText(/Healthy/i, { timeout: 30_000 });
      await page.getByTestId("settings-close").click();

      await page.getByTestId("composer").fill("USE_WRITE");
      await page.getByRole("button", { name: "Send" }).click();
      await expectNoDialogThenExpandWorkLog(page, 0);
      expect(existsSync(join(workspaceDir, "agent-note.txt"))).toBe(true);
      await expect(page.getByTestId("tool-open-review")).toContainText("1 file");
      await expect(page.getByTestId("tool-sandbox-shield")).toHaveCount(0);

      await page.getByTestId("composer").fill(`USE_SANDBOX_WRITE_ABS:${deniedFile}`);
      await page.getByRole("button", { name: "Send" }).click();
      await expectNoDialogThenExpandWorkLog(page, 1);
      await page.getByTestId("tool-card").last().click();
      await expect(page.getByTestId("tool-detail").last()).toContainText(/denied|outside|protected|Sandbox policy/i);
      await expect(page.getByTestId("tool-detail").last()).toContainText("Do not retry");
      expect(existsSync(deniedFile)).toBe(false);

      await openSettingsSection(page, "sandbox");
      await page.getByTestId("sandbox-write-paths").fill(extraWrite);
      await page.getByTestId("sandbox-save-lists").click();
      await expect(page.getByTestId("sandbox-status")).toContainText(/Healthy/i, { timeout: 30_000 });
      await page.getByTestId("settings-close").click();

      await page.getByTestId("composer").fill(`USE_SANDBOX_WRITE_ABS:${extraFile}`);
      await page.getByRole("button", { name: "Send" }).click();
      const dialog = page.getByTestId("extension-dialog");
      const extraToggle = page.getByTestId("work-log-toggle").nth(2);
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        if (await dialog.isVisible().catch(() => false)) {
          await allowOnceIfPrompted(page);
          break;
        }
        const text = (await extraToggle.textContent().catch(() => "")) ?? "";
        if (/Behind the scenes|Had a quick think|Thought it through|Took a peek|Looked around a bit|Thought, then peeked|Did a little digging|Went exploring/u.test(text)) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await expandSettledWorkLog(page, 2);
      expect(existsSync(extraFile)).toBe(true);
    } finally {
      await harness.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
    spawnSync("/usr/bin/trash", [extraRoot], { encoding: "utf8" });
  }
});
