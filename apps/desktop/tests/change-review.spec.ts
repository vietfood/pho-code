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
      await expect(page.getByTestId("bootstrap-state")).toHaveAccessibleName("About · 0.0.0");
      await expect(page.getByTestId("new-session")).toBeEnabled();
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("right-surface-icons")).toBeVisible();
      await expect(page.getByTestId("right-sidebar")).toHaveCount(0);
      await page.getByTestId("composer").fill("USE_EDIT");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("transcript")).toContainText("Tool completed.", { timeout: 20_000 });
      await expandSettledWorkLog(page);
      await expect(page.getByTestId("tool-open-review")).toContainText("1 file");
      await page.getByTestId("tool-open-review").click();
      const pane = page.getByTestId("change-review-window");
      await expect(pane).toBeVisible();
      await expect(page.getByTestId("right-sidebar")).toBeVisible();
      await expect(page.getByTestId("right-sidebar-surface-diff")).toBeVisible();
      await expect(page.getByTestId("change-review-diff")).toContainText("before");
      await expect(page.getByTestId("change-review-diff")).toContainText("after from agent");
      await expect(page.getByTestId("change-review-search")).toBeVisible();
      await expect(page.getByTestId("change-review-whitespace")).toBeVisible();
      await expect(page.getByTestId("change-review-context")).toBeVisible();
      await expect(page.getByTestId("change-retention-disclosure")).toBeHidden();
      await page.getByTestId("change-retention-disclosure-trigger").click();
      await expect(page.getByTestId("change-retention-disclosure")).toContainText("250 MiB ledger budget");
      await page.getByTestId("change-retention-disclosure-trigger").click();
      await expect(page.getByTestId("change-retention-disclosure")).toBeHidden();
      await expect(page.getByTestId("right-sidebar-tile-minimize-diff")).toBeVisible();
      await expect(page.getByTestId("right-sidebar-tile-close-diff")).toBeVisible();
      await expect(page.getByTestId("right-sidebar-tile-diff").getByTestId("change-review-window-title")).toBeVisible();
      await page.getByTestId("change-review-search").fill("after");
      await expect(page.getByTestId("change-review-search-hit")).toContainText("after");
      await page.getByTestId("change-review-whitespace").click();
      await expect(page.getByTestId("change-review-whitespace")).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("change-review-context").selectOption("8");
      await page.getByTestId("right-sidebar-surface-diff").click();
      await expect(page.getByTestId("right-sidebar")).toHaveCount(0);
      await expect(page.getByTestId("change-review-window")).toHaveCount(0);
      await page.getByTestId("right-sidebar-surface-diff").click();
      await expect(page.getByTestId("right-sidebar-tile-diff")).toBeVisible();
      await expect(page.getByTestId("change-review-window")).toBeVisible();
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
      await expect(page.getByTestId("change-review-window")).toBeVisible();
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

test("tiles two right-sidebar surfaces and parks the third in the tray", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const workspaceDir = await makeWorkspaceDir();
  const env = {
    PHO_CODE_AGENT_DIR: agentDir,
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
  };

  try {
    const app = await launchDesktop(userDataDir, { env });
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("bootstrap-state")).toHaveAccessibleName("About · 0.0.0");
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible({ timeout: 15_000 });

      await page.getByTestId("right-sidebar-surface-context").click();
      await expect(page.getByTestId("right-sidebar")).toBeVisible();
      await expect(page.getByTestId("right-sidebar-tile-context")).toBeVisible();
      await expect(page.getByTestId("context-prompt-dialog")).toBeVisible();

      await page.getByTestId("right-sidebar-surface-diff").click();
      await expect(page.getByTestId("right-sidebar-tile-diff")).toBeVisible();
      await expect(page.getByTestId("right-sidebar-tile-context")).toBeVisible();
      await expect(page.getByTestId("right-sidebar-tile-divider")).toBeVisible();
      await expect(page.getByTestId("right-sidebar")).toHaveAttribute("data-orientation", "stack");
      await expect(page.getByTestId("change-review-empty")).toBeVisible();

      await page.getByTestId("right-sidebar-surface-plan").click();
      await expect(page.getByTestId("right-sidebar-tray")).toBeVisible();
      await expect(page.getByTestId("right-sidebar-tray-plan")).toBeVisible();
      await expect(page.getByTestId("right-sidebar-tile-plan")).toHaveCount(0);
      await expect(page.getByTestId("right-sidebar-hidden-plan")).toBeAttached();

      await page.getByTestId("right-sidebar-tray-plan").click();
      await expect(page.getByTestId("right-sidebar-tile-plan")).toBeVisible();
      await expect(page.getByTestId("plan-document-panel")).toBeVisible();
      await expect(page.getByTestId("right-sidebar-tile-context")).toHaveCount(0);
      await expect(page.getByTestId("right-sidebar-tray-context")).toBeVisible();

      await page.getByTestId("right-sidebar-tile-minimize-plan").click();
      await expect(page.getByTestId("right-sidebar-tile-plan")).toHaveCount(0);
      await expect(page.getByTestId("right-sidebar-tile-context")).toBeVisible();

      await page.getByTestId("right-sidebar-tile-close-context").click();
      await expect(page.getByTestId("right-sidebar-tile-plan")).toBeVisible();
      await page.getByTestId("right-sidebar-tile-close-plan").click();
      await page.getByTestId("right-sidebar-tile-close-diff").click();
      await expect(page.getByTestId("right-sidebar")).toHaveCount(0);
      await expect(page.getByTestId("right-surface-icons")).toBeVisible();
    } finally {
      await app.close();
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
      await expect(page.getByTestId("bootstrap-state")).toHaveAccessibleName("About · 0.0.0");
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible({ timeout: 15_000 });
      await page.getByTestId("composer").fill("USE_EDIT");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("transcript")).toContainText("Tool completed.", { timeout: 20_000 });
      await expandSettledWorkLog(page);
      await page.getByTestId("tool-open-review").click();
      await expect(page.getByTestId("change-review-window")).toBeVisible();
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

      await page.getByTestId("right-sidebar-surface-diff").click();
      await expect(page.getByTestId("change-review-window")).toHaveCount(0);
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("composer").fill("USE_EDIT");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("transcript")).toContainText("Tool completed.", { timeout: 20_000 });
      expect(await readFile(trackedPath, "utf8")).toBe("after from agent\n");
      await expandSettledWorkLog(page);
      await page.getByTestId("tool-open-review").click();
      await expect(page.getByTestId("change-review-window")).toBeVisible();
      await expect(page.getByTestId("change-review-status")).toContainText("Pending");
      await writeFile(trackedPath, "owner edit\n");
      await page.getByTestId("change-review-undo").click();
      await expect(page.getByTestId("change-review-error")).toContainText(/no longer matches|conflict|unavailable/i);
      expect(await readFile(trackedPath, "utf8")).toBe("owner edit\n");
      await expect(page.getByTestId("change-review-status")).toContainText("Conflict");
      await expect(page.getByTestId("change-review-undo")).toHaveCount(0);
      await page.getByTestId("change-review-approve").click();
      await expect(page.getByTestId("change-review-status")).toContainText("Approved");
      expect(await readFile(trackedPath, "utf8")).toBe("owner edit\n");
    } finally {
      await second.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});
