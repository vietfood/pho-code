import { expect, test } from "@playwright/test";
import {
  launchDesktop,
  makeAgentDir,
  makeUserDataDir,
  makeWorkspaceDir,
  openSessionActions,
  openSettingsSection,
  removeTestDirectory,
  selectedSessionItem,
  unselectedSessionItem,
} from "./helpers/electron-app";

test("keeps a background deterministic run after switching chats", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const workspaceDir = await makeWorkspaceDir();
  const env = {
    PHO_CODE_AGENT_DIR: agentDir,
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
  };

  try {
    const harness = await launchDesktop(userDataDir, { env });
    try {
      const page = await harness.firstWindow();
      await expect(page.getByTestId("bootstrap-state")).toContainText("About · 0.0.0");
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await expect(page.getByTestId("session-item")).toHaveCount(1);

      await page.getByTestId("composer").fill("ABORT_ME");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("session-activity")).toHaveAttribute("data-activity", "working", { timeout: 20_000 });

      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("session-item")).toHaveCount(2);
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("composer").fill("hello from B");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("transcript")).toContainText("Hello from the test model.", { timeout: 20_000 });

      const background = unselectedSessionItem(page);
      await expect(background.locator("xpath=ancestor::li[1]").getByTestId("session-activity")).toHaveAttribute(
        "data-activity",
        /working|completed/,
      );

      await background.click();
      await expect(page.getByTestId("transcript")).toContainText("BEGIN_ABORT_STREAM", { timeout: 20_000 });
      await expect(page.getByTestId("transcript")).toContainText("END_ABORT_STREAM", { timeout: 20_000 });
    } finally {
      await harness.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});

test("archives, restores, refuses running Trash, and moves a settled chat to Trash", async () => {
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
      await expect(page.getByTestId("bootstrap-state")).toContainText("About · 0.0.0");
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("composer").fill("hello from A");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("transcript")).toContainText("Hello from the test model.", { timeout: 20_000 });

      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("session-item")).toHaveCount(2);
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("composer").fill("ABORT_ME");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("session-activity").first()).toBeVisible({ timeout: 20_000 });

      await openSessionActions(selectedSessionItem(page));
      await page.getByTestId("remove-session").click();
      await expect(page.getByTestId("remove-session-dialog")).toHaveCount(0);
      await expect(page.getByRole("alert")).toContainText(/Stop it first|still running/i);

      await expect(page.getByTestId("transcript")).toContainText("END_ABORT_STREAM", { timeout: 20_000 });
      await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

      await openSessionActions(unselectedSessionItem(page));
      await page.getByTestId("archive-session").click();
      await expect(page.getByTestId("session-item")).toHaveCount(1);

      await openSettingsSection(page, "archived");
      await expect(page.getByTestId("archived-chat-item")).toContainText("hello from A");
      await page.getByTestId("restore-session").click();
      await page.getByTestId("settings-close").click();
      await expect(page.getByTestId("session-item")).toHaveCount(2);

      await openSessionActions(unselectedSessionItem(page));
      await page.getByTestId("remove-session").click();
      await expect(page.getByTestId("remove-session-dialog")).toBeVisible();
      await expect(page.getByTestId("remove-session-dialog")).toContainText("operating-system Trash");
      await page.getByTestId("remove-session-confirm").click();
      await expect(page.getByTestId("remove-session-dialog")).toHaveCount(0);
      await expect(page.getByTestId("session-item")).toHaveCount(1);
    } finally {
      await first.close();
    }

    const second = await launchDesktop(userDataDir, { env });
    try {
      const page = await second.firstWindow();
      await expect(page.getByTestId("session-item")).toHaveCount(1);
      await openSettingsSection(page, "archived");
      await expect(page.getByTestId("archived-chats")).toContainText("No archived chats.");
    } finally {
      await second.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});

test("deletes all archived chats in a project group through the preload bridge", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const workspaceDir = await makeWorkspaceDir();
  const env = {
    PHO_CODE_AGENT_DIR: agentDir,
    PHO_CODE_TEST_WORKSPACE: workspaceDir,
    PHO_CODE_TEST_MODEL: "1",
  };

  try {
    const harness = await launchDesktop(userDataDir, { env });
    try {
      const page = await harness.firstWindow();
      expect(
        await page.evaluate(() => typeof window.phoCode?.prepareRemoveArchivedSessions),
      ).toBe("function");

      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();
      await page.getByTestId("composer").fill("hello from A");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("transcript")).toContainText("Hello from the test model.", { timeout: 20_000 });

      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("session-item")).toHaveCount(2);

      await openSessionActions(unselectedSessionItem(page));
      await page.getByTestId("archive-session").click();
      await expect(page.getByTestId("session-item")).toHaveCount(1);

      await openSettingsSection(page, "archived");
      await expect(page.getByTestId("archived-chat-item")).toContainText("hello from A");
      await page.getByTestId("remove-all-archived-sessions").click();
      await expect(page.getByTestId("remove-archived-sessions-dialog")).toBeVisible();
      await expect(page.getByTestId("remove-archived-sessions-dialog")).toContainText("operating-system Trash");
      await page.getByTestId("remove-archived-sessions-confirm").click();
      await expect(page.getByTestId("remove-archived-sessions-dialog")).toHaveCount(0);
      await expect(page.getByTestId("archived-chats")).toContainText("No archived chats.");
      await page.getByTestId("settings-close").click();
      await expect(page.getByTestId("session-item")).toHaveCount(1);
    } finally {
      await harness.close();
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});
