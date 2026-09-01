import { expect, test, type Page } from "@playwright/test";
import {
  launchDesktop,
  makeAgentDir,
  makeUserDataDir,
  makeWorkspaceDir,
  removeTestDirectory,
  stopRunsAndClose,
  unselectedSessionItem,
} from "./helpers/electron-app";

const SETTLED_REPLY = "Hello from the test model.";

async function sendPrompt(page: Page, text: string): Promise<void> {
  await page.getByTestId("composer").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  // Web-first assertions poll every animation frame, so even a fast
  // deterministic run is caught by the start (Stop) and settle (Send) pair.
  await expect(page.getByTestId("stop-button")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 20_000 });
}

// The deterministic test settings keep only a tiny tail, so a handful of
// exchanges gives Pi a real cut point for manual compaction.
async function sendExchanges(page: Page, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await sendPrompt(page, `hello ${index}`);
  }
  await expect(page.getByTestId("transcript")).toContainText("hello 0");
}

test("manual compaction from the usage popover keeps the full transcript and survives relaunch", async () => {
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
      await sendExchanges(page, 6);

      await page.getByTestId("composer-usage-trigger").click();
      const compact = page.getByTestId("compact-context");
      await expect(compact).toBeVisible();
      await expect(compact).toBeEnabled();
      await compact.click();

      const boundary = page.getByTestId("compaction-boundary");
      await expect(boundary).toBeVisible({ timeout: 20_000 });
      await expect(boundary).toContainText("Context compacted");
      await expect(boundary).toContainText("Manual");

      // The full pre-boundary transcript stays visible.
      await expect(page.getByTestId("transcript")).toContainText("hello 0");
      await expect(page.getByTestId("transcript")).toContainText(SETTLED_REPLY);

      // The summary loads on demand through the bounded detail command.
      await page.getByTestId("compaction-summary-toggle").click();
      await expect(page.getByTestId("compaction-summary")).toContainText(SETTLED_REPLY, {
        timeout: 20_000,
      });
      await page.getByTestId("compaction-summary-toggle").click();
      await expect(page.getByTestId("compaction-summary")).toHaveCount(0);

      // A background chat neither gains nor steals the boundary.
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("session-item")).toHaveCount(2);
      await sendPrompt(page, "hello from the second chat");
      await expect(page.getByTestId("compaction-boundary")).toHaveCount(0);
      await unselectedSessionItem(page).click();
      await expect(boundary).toBeVisible();
    } finally {
      await stopRunsAndClose(await first.firstWindow(), first);
    }

    const second = await launchDesktop(userDataDir, { env });
    try {
      const page = await second.firstWindow();
      await expect(page.getByTestId("session-item")).toHaveCount(2);
      // The compacted chat is the older of the two sessions.
      await page.getByTestId("session-item").last().click();
      // The persisted marker reconstructs without stale progress.
      const boundary = page.getByTestId("compaction-boundary");
      await expect(boundary).toBeVisible({ timeout: 20_000 });
      await expect(boundary).toContainText("Context compacted");
      await expect(page.getByTestId("transcript")).toContainText("hello 0");
      await page.getByTestId("compaction-summary-toggle").click();
      await expect(page.getByTestId("compaction-summary")).toContainText(SETTLED_REPLY, {
        timeout: 20_000,
      });
    } finally {
      await stopRunsAndClose(await second.firstWindow(), second);
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});

test("compact is disabled while running and an empty chat reports an honest failure", async () => {
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
      await page.getByTestId("new-session").click();
      await expect(page.getByTestId("composer")).toBeVisible();

      // Nothing to compact yet: Pi refuses and the owner sees the failure.
      await page.getByTestId("composer-usage-trigger").click();
      await page.getByTestId("compact-context").click();
      await expect(page.getByRole("alert")).toContainText(/Nothing to compact/i, { timeout: 20_000 });
      await page.getByRole("button", { name: "Dismiss error" }).click();
      await page.getByTestId("composer-usage-trigger").click();
      await expect(page.getByTestId("composer-usage-detail")).toHaveCount(0);

      // While a run streams, the action explains why it is unavailable.
      await page.getByTestId("composer").fill("ABORT_ME");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByTestId("stop-button")).toBeVisible({ timeout: 20_000 });
      await page.getByTestId("composer-usage-trigger").click();
      await expect(page.getByTestId("compact-context")).toBeDisabled();
      await expect(page.getByTestId("compact-unavailable")).toContainText(
        "Wait for the current run to finish",
      );
      await page.getByTestId("composer-usage-trigger").click();
      await expect(page.getByTestId("composer-usage-detail")).toHaveCount(0);
      await page.getByTestId("stop-button").click();
      await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 20_000 });

      // After the run settles and enough history exists, compaction succeeds.
      await sendExchanges(page, 6);
      await page.getByTestId("composer-usage-trigger").click();
      await page.getByTestId("compact-context").click();
      await expect(page.getByTestId("compaction-boundary")).toBeVisible({ timeout: 20_000 });
    } finally {
      await stopRunsAndClose(await harness.firstWindow(), harness);
    }
  } finally {
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});
