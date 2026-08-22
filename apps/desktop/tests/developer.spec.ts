import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  expandSettledWorkLog,
  launchDesktop,
  makeUserDataDir,
  makeWorkspaceDir,
  openSettingsSection,
  removeTestDirectory,
} from "./helpers/electron-app";

test("great-power mode allows safe inspection, blocks rm, and moves a fixture to Trash", async () => {
  const userDataDir = await makeUserDataDir();
  const workspaceDir = await makeWorkspaceDir();
  const git = spawnSync("git", ["init"], { cwd: workspaceDir, encoding: "utf8" });
  expect(git.status).toBe(0);
  const fixturePath = join(workspaceDir, "disposable-fixture.txt");
  await writeFile(fixturePath, "owned\n");
  const env = {
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
    PHO_CODE_TEST_FEATURES: "1",
  };

  try {
    const first = await launchDesktop(userDataDir, { env });
    try {
      const page = await first.firstWindow();
      await openSettingsSection(page, "permissions");
      await expect(page.getByTestId("settings-view")).toBeVisible();
      await page.getByTestId("permission-profile-developer").click();
      await page.getByTestId("permission-yolo-confirm").click();
      await page.getByTestId("settings-save").click();
      await expect(page.getByTestId("settings-save")).toBeDisabled();
      await page.getByTestId("settings-close").click();
    } finally {
      await first.close();
    }

    const second = await launchDesktop(userDataDir, { env });
    try {
      const page = await second.firstWindow();
      await openSettingsSection(page, "permissions");
      await expect(page.getByTestId("permission-profile-developer")).toBeChecked();
      await page.getByTestId("settings-close").click();

      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("bootstrap-state").click();
      await expect(page.getByTestId("feature-diagnostics")).toContainText("recoverable-trash");
      await page.getByTestId("about-close").click();

      await page.getByTestId("composer").fill("USE_SAFE_SHELL");
      await page.getByRole("button", { name: "Send" }).click();
      await expandSettledWorkLog(page, 0);
      await expect(page.getByTestId("tool-card")).toContainText("Run");
      await expect(page.getByTestId("extension-dialog")).toHaveCount(0);

      await page.getByTestId("composer").fill("USE_DANGEROUS_SHELL");
      await page.getByRole("button", { name: "Send" }).click();
      await expandSettledWorkLog(page, 1);
      await expect(page.getByTestId("tool-card").last()).toContainText(/not permitted|denied|unavailable|Run/i);
      await expect(page.getByTestId("extension-dialog")).toHaveCount(0);
      expect(existsSync(fixturePath)).toBe(true);

      await page.getByTestId("composer").fill("USE_TRASH");
      await page.getByRole("button", { name: "Send" }).click();
      await expandSettledWorkLog(page, 2);
      await expect(page.getByTestId("tool-card").last()).toContainText(/Trash|recoverable/i);
      await expect(page.getByTestId("tool-card").last()).not.toContainText("move_to_trash");
      expect(existsSync(fixturePath)).toBe(false);
    } finally {
      await second.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(workspaceDir);
  }
});
