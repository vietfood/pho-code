import { expect, test } from "@playwright/test";
import {
  launchDesktop,
  makeUserDataDir,
  makeWorkspaceDir,
  openSettingsSection,
  removeTestDirectory,
  writeProjectPermissionOverride,
} from "./helpers/electron-app";

test("project permission trust dialog remembers the workspace across relaunch", async () => {
  const userDataDir = await makeUserDataDir();
  const workspaceDir = await makeWorkspaceDir();
  await writeProjectPermissionOverride(workspaceDir);
  const env = {
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
    PHO_CODE_TEST_FEATURES: "1",
  };

  try {
    const first = await launchDesktop(userDataDir, { env });
    try {
      const page = await first.firstWindow();
      await expect(page.getByTestId("project-trust-dialog")).toBeVisible();
      await expect(page.getByTestId("extension-notification")).toHaveCount(0);
      await expect(page.getByTestId("project-trust-path")).toContainText(workspaceDir);
      await page.getByTestId("project-trust-confirm").click();
      await expect(page.getByTestId("project-trust-dialog")).toHaveCount(0);
      await expect(page.getByTestId("project-trust-banner")).toHaveCount(0);
      await openSettingsSection(page, "permissions");
      await expect(page.getByTestId("project-permission-trusted")).toBeVisible();
      await page.getByTestId("settings-close").click();
    } finally {
      await first.close();
    }

    const second = await launchDesktop(userDataDir, { env });
    try {
      const page = await second.firstWindow();
      await expect(page.getByTestId("workspace-heading")).toBeVisible();
      await expect(page.getByTestId("project-trust-dialog")).toHaveCount(0);
      await openSettingsSection(page, "permissions");
      await expect(page.getByTestId("project-permission-trusted")).toBeVisible();
    } finally {
      await second.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(workspaceDir);
  }
});

test("project permission trust can be deferred and completed from the banner", async () => {
  const userDataDir = await makeUserDataDir();
  const workspaceDir = await makeWorkspaceDir();
  await writeProjectPermissionOverride(workspaceDir);
  const env = {
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
    PHO_CODE_TEST_FEATURES: "1",
  };

  try {
    const harness = await launchDesktop(userDataDir, { env });
    try {
      const page = await harness.firstWindow();
      await expect(page.getByTestId("project-trust-dialog")).toBeVisible();
      await expect(page.getByTestId("extension-notification")).toHaveCount(0);
      await page.getByTestId("project-trust-cancel").click();
      await expect(page.getByTestId("project-trust-dialog")).toHaveCount(0);
      await expect(page.getByTestId("project-trust-banner")).toBeVisible();
      await page.getByTestId("project-trust-banner-trust").click();
      await expect(page.getByTestId("project-trust-dialog")).toBeVisible();
      await expect(page.getByTestId("extension-notification")).toHaveCount(0);
      await page.getByTestId("project-trust-confirm").click();
      await expect(page.getByTestId("project-trust-dialog")).toHaveCount(0);
      await expect(page.getByTestId("project-trust-banner")).toHaveCount(0);
    } finally {
      await harness.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(workspaceDir);
  }
});
