import { expect, test, type Page } from "@playwright/test";
import {
  expandSettledWorkLog,
  launchDesktop,
  makeAgentDir,
  makeUserDataDir,
  makeWorkspaceDir,
  removeTestDirectory,
  stopRunsAndClose,
} from "./helpers/electron-app";

async function openTask(page: Page): Promise<void> {
  const panel = page.getByTestId("task-panel");
  if (!(await panel.isVisible().catch(() => false))) {
    await page.getByTestId("right-sidebar-surface-task").click();
  }
  await expect(panel).toBeVisible();
}

async function sendToolPrompt(page: Page, prompt: string, priorToggleCount: number): Promise<void> {
  await page.getByTestId("composer").fill(prompt);
  await page.getByRole("button", { name: "Send" }).click();
  await expandSettledWorkLog(page, priorToggleCount);
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 20_000 });
}

test("Task brief, evidence, verification, completion, and owner gap acceptance survive relaunch", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const workspaceDir = await makeWorkspaceDir();
  const env = {
    PHO_CODE_AGENT_DIR: agentDir,
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
  };

  try {
    const first = await launchDesktop(userDataDir, { env });
    try {
      const page = await first.firstWindow();
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await openTask(page);

      const panel = page.getByTestId("task-panel");
      await panel.getByLabel("Objective").fill("Finish the V5 Task desktop journey");
      await panel.getByLabel("Criterion 1 id").fill("mechanics");
      await panel.getByLabel("Criterion 1 text").fill("Task state and verification restore after relaunch");
      await panel.getByRole("button", { name: "Save Task Brief" }).click();
      await expect(panel.getByTestId("task-brief-summary")).toContainText("Finish the V5 Task desktop journey");
      await expect(page.getByTestId("right-sidebar-task-present")).toBeVisible();

      await sendToolPrompt(page, "USE_TOOL", 0);
      await expect(panel.getByTestId("task-evidence")).toContainText("Current Task Brief");
      await expect(panel.getByTestId("task-verification")).toContainText("Deterministic harness verification passed");

      await sendToolPrompt(page, "USE_COMPLETE_TASK", 1);
      await expect(panel.getByTestId("task-completion")).toContainText("incomplete");
      await expect(panel.getByTestId("task-completion")).toContainText("unverified");
      await panel.getByRole("button", { name: "Accept disclosed gaps" }).click();
      await expect(panel.getByTestId("task-completion")).toContainText("accepted with gaps");
      await expect(panel).toContainText("completed");
    } finally {
      await stopRunsAndClose(await first.firstWindow(), first);
    }

    const second = await launchDesktop(userDataDir, { env });
    try {
      const page = await second.firstWindow();
      await expect(page.getByTestId("session-item")).toBeVisible();
      await page.getByTestId("session-item").click();
      await openTask(page);
      const panel = page.getByTestId("task-panel");
      await expect(panel.getByTestId("task-brief-summary")).toContainText("Finish the V5 Task desktop journey");
      await expect(panel.getByTestId("task-evidence")).toContainText("Current Task Brief");
      await expect(panel.getByTestId("task-verification")).toContainText("Deterministic harness verification passed");
      await expect(panel.getByTestId("task-completion")).toContainText("accepted with gaps");
    } finally {
      await stopRunsAndClose(await second.firstWindow(), second);
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});
