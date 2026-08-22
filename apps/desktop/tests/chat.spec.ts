import { expect, test } from "@playwright/test";
import {
  expandSettledWorkLog,
  launchDesktop,
  makeAgentDir,
  makeUserDataDir,
  makeWorkspaceDir,
  removeTestDirectory,
} from "./helpers/electron-app";

test("streams a tool run in an isolated workspace and restores the transcript after reopen", async () => {
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
      await expect(page.getByTestId("bootstrap-state")).toHaveAccessibleName("About · 0.0.0");
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await expect(page.getByTestId("session-item")).toBeVisible();
      await page.getByTestId("composer").fill("USE_TOOL");
      await page.getByRole("button", { name: "Send" }).click();
      await expandSettledWorkLog(page);
      await expect(page.getByTestId("tool-card")).toContainText("Harness Mark");
      await expect(page.getByTestId("transcript")).toContainText("Tool completed.");
      await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
      await page.getByTestId("composer").fill("hello");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("transcript")).toContainText("Hello from the test model.", { timeout: 20_000 });
    } finally {
      await first.close();
    }

    const second = await launchDesktop(userDataDir, { env });
    try {
      const page = await second.firstWindow();
      await expect(page.getByTestId("session-item")).toBeVisible();
      await page.getByTestId("session-item").click();
      await expect(page.getByTestId("transcript")).toContainText("USE_TOOL");
      await expect(page.getByTestId("transcript")).toContainText("Tool completed.");
      await page.getByTestId("work-log-toggle").first().click();
      await expect(page.getByTestId("tool-card")).toContainText("Harness Mark");
    } finally {
      await second.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});

test("opens an empty-session context prompt for edit, then inspects it after send", async () => {
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
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("right-sidebar-surface-context").click();
      const dialog = page.getByTestId("context-prompt-dialog");
      await expect(dialog).toBeVisible();
      const preamble = page.getByTestId("context-prompt-preamble");
      await expect(preamble).toBeEditable();
      await preamble.fill("Custom session preamble for tests.");
      await page.getByTestId("context-prompt-save").click();
      await expect(page.getByTestId("context-prompt-customized")).toBeVisible();
      await expect(page.getByTestId("right-sidebar-surface-context")).toHaveAttribute("data-customized", "true");
      await page.getByTestId("context-prompt-close").click();
      await expect(dialog).toHaveCount(0);

      await page.getByTestId("composer").fill("hello");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("transcript")).toContainText("Hello from the test model.", { timeout: 20_000 });

      await page.getByTestId("right-sidebar-surface-context").click();
      await expect(dialog).toBeVisible();
      await expect(page.getByTestId("context-prompt-preamble")).toHaveValue("Custom session preamble for tests.");
      await expect(page.getByTestId("context-prompt-preamble")).not.toBeEditable();
      await expect(page.getByTestId("context-prompt-save")).toHaveCount(0);
      await expect(page.getByTestId("context-prompt-reset")).toHaveCount(0);
      await expect(page.getByTestId("context-prompt-customized")).toBeVisible();
    } finally {
      await app.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});

test("closes composer @ mentions on Escape and Enter without reopening space-less queries", async () => {
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
      const composer = page.getByTestId("composer");
      await expect(composer).toBeVisible();
      await composer.click();
      const mentions = page.getByTestId("composer-mentions");

      await composer.pressSequentially("@KL divergence.md");
      await expect(mentions).toBeVisible();
      await composer.press("Escape");
      await expect(mentions).toBeHidden();

      await composer.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      await composer.press("Backspace");
      await composer.pressSequentially("@features.ts");
      await expect(mentions).toBeVisible();
      await composer.press("Escape");
      await expect(mentions).toBeHidden();
      await composer.press("ArrowLeft");
      await expect(mentions).toBeHidden();

      await composer.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      await composer.press("Backspace");
      await composer.pressSequentially("@features.ts");
      await expect(mentions).toBeVisible();
      await composer.press("Enter");
      await expect(mentions).toBeHidden();
    } finally {
      await app.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});
