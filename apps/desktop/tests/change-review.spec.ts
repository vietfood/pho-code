import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  expandSettledWorkLog,
  launchDesktop,
  makeAgentDir,
  makeUserDataDir,
  makeWorkspaceDir,
  removeTestDirectory,
} from "./helpers/electron-app";

test("edits a file, opens the review sheet, Approves, and preserves approved state after relaunch", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const workspaceDir = await makeWorkspaceDir();
  await writeFile(join(workspaceDir, "tracked.txt"), "before\n");
  const env = {
    PHO_CODE_AGENT_DIR: agentDir,
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
  };

  try {
    const first = await launchDesktop(userDataDir, { env });
    try {
      const page = await first.firstWindow();
      await expect(page.getByTestId("bootstrap-state")).toContainText("About · 0.0.0");
      await expect(page.getByTestId("new-session")).toBeEnabled();
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("right-sidebar-pill")).toBeVisible();
      await page.getByTestId("composer").fill("USE_EDIT");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("transcript")).toContainText("Tool completed.", { timeout: 20_000 });
      await expandSettledWorkLog(page);
      await expect(page.getByTestId("tool-open-review")).toContainText("1 file");
      await page.getByTestId("tool-open-review").click();
      const sheet = page.getByTestId("change-review-sheet");
      await expect(sheet).toBeVisible();
      await expect(page.getByTestId("right-sidebar")).toHaveAttribute("data-collapsed", "false");
      await expect(page.getByTestId("right-sidebar-surface-diff")).toBeVisible();
      await expect(page.getByTestId("change-review-diff")).toContainText("before");
      await expect(page.getByTestId("change-review-diff")).toContainText("after from agent");
      await page.getByTestId("right-sidebar-collapse").click();
      await expect(page.getByTestId("right-sidebar")).toHaveAttribute("data-collapsed", "true");
      await expect(page.getByTestId("right-sidebar-pill")).toBeVisible();
      await expect(page.getByTestId("change-review-diff")).toHaveCount(0);
      await page.getByTestId("right-sidebar-surface-diff").click();
      await expect(page.getByTestId("right-sidebar")).toHaveAttribute("data-collapsed", "false");
      await expect(page.getByTestId("change-review-diff")).toBeVisible();
      await page.getByTestId("change-review-approve").click();
      await expect(page.getByTestId("change-review-status")).toContainText("Approved");
      await expect(page.getByTestId("change-review-approve")).toHaveCount(0);
    } finally {
      await first.close();
    }

    const second = await launchDesktop(userDataDir, { env });
    try {
      const page = await second.firstWindow();
      await expect(page.getByTestId("session-item")).toBeVisible();
      await page.getByTestId("session-item").click();
      await expandSettledWorkLog(page);
      await expect(page.getByTestId("tool-open-review")).toContainText("1 file");
      await page.getByTestId("tool-open-review").click();
      await expect(page.getByTestId("change-review-sheet")).toBeVisible();
      await expect(page.getByTestId("change-review-status")).toContainText("Approved");
      await expect(page.getByTestId("change-review-approve")).toHaveCount(0);
    } finally {
      await second.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});

test("restores an unchanged edit, refuses a conflicting owner overwrite, and preserves Undo after relaunch", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const workspaceDir = await makeWorkspaceDir();
  const trackedPath = join(workspaceDir, "tracked.txt");
  await writeFile(trackedPath, "before\n");
  const env = {
    PHO_CODE_AGENT_DIR: agentDir,
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
  };

  try {
    const first = await launchDesktop(userDataDir, { env });
    try {
      const page = await first.firstWindow();
      await expect(page.getByTestId("bootstrap-state")).toContainText("About · 0.0.0");
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible({ timeout: 15_000 });
      await page.getByTestId("composer").fill("USE_EDIT");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("transcript")).toContainText("Tool completed.", { timeout: 20_000 });
      await expandSettledWorkLog(page);
      await page.getByTestId("tool-open-review").click();
      await expect(page.getByTestId("change-review-sheet")).toBeVisible();
      await expect(page.getByTestId("change-review-undo")).toBeVisible();
      await expect(page.getByTestId("change-review-undo-all")).toHaveCount(0);
      await page.getByTestId("change-review-undo").click();
      await expect(page.getByTestId("change-review-undo-preview")).toBeVisible();
      await expect(page.getByTestId("change-review-undo-confirm")).toContainText("Restore");
      await page.getByTestId("change-review-undo-confirm").click();
      await expect(page.getByTestId("change-review-status")).toContainText("Undone");
      expect(await readFile(trackedPath, "utf8")).toBe("before\n");
    } finally {
      await first.close();
    }

    const second = await launchDesktop(userDataDir, { env });
    try {
      const page = await second.firstWindow();
      await expect(page.getByTestId("session-item")).toBeVisible();
      await page.getByTestId("session-item").click();
      await expandSettledWorkLog(page);
      await page.getByTestId("tool-open-review").click();
      await expect(page.getByTestId("change-review-status")).toContainText("Undone");
      await expect(page.getByTestId("change-review-undo")).toHaveCount(0);

      await page.getByTestId("right-sidebar-collapse").click();
      await expect(page.getByTestId("change-review-sheet")).toHaveCount(0);
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("composer").fill("USE_EDIT");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("transcript")).toContainText("Tool completed.", { timeout: 20_000 });
      expect(await readFile(trackedPath, "utf8")).toBe("after from agent\n");
      await expandSettledWorkLog(page);
      await page.getByTestId("tool-open-review").click();
      await expect(page.getByTestId("change-review-sheet")).toBeVisible();
      await expect(page.getByTestId("change-review-status")).toContainText("Pending");
      await writeFile(trackedPath, "owner edit\n");
      await page.getByTestId("change-review-undo").click();
      await expect(page.getByTestId("change-review-error")).toContainText(/no longer matches|conflict|unavailable/i);
      expect(await readFile(trackedPath, "utf8")).toBe("owner edit\n");
      await expect(page.getByTestId("change-review-status")).toContainText("Conflict");
    } finally {
      await second.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});
