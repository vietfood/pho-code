import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  launchPackagedDesktop,
  makeUserDataDir,
  makeWorkspaceDir,
  pathWithoutPi,
  expandSettledWorkLog,
  removeTestDirectory,
  resolvePackagedAppPath,
  writeResourceFixture,
} from "./helpers/electron-app";

test("packaged macOS app loads permission and Trash features without Pi CLI", async () => {
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
      await page.getByTestId("open-settings").click();
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
      await expect(page.getByTestId("feature-diagnostics")).toContainText("recoverable-trash");
      await expect(page.getByTestId("feature-diagnostics")).not.toContainText("harness-note");

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
      await expect(page.getByTestId("tool-card")).toContainText("Harness mark completed");
      await expect(page.getByTestId("extension-dialog")).toHaveCount(0);

      await page.getByTestId("composer").fill("USE_TRASH");
      await page.getByRole("button", { name: "Send" }).click();
      await expandSettledWorkLog(page, 1);
      await expect(page.getByTestId("tool-card").last()).toContainText(/Trash completed|recoverable/i);
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
