import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  launchDesktop,
  makeAgentDir,
  makeUserDataDir,
  makeWorkspaceDir,
  removeTestDirectory,
} from "./helpers/electron-app";

async function seedRecentWorkspace(userDataDir: string, workspaceDir: string): Promise<void> {
  await writeFile(
    join(userDataDir, "app-metadata.json"),
    `${JSON.stringify({
      version: 6,
      recentWorkspaces: [
        {
          id: workspaceDir,
          path: workspaceDir,
          displayName: basename(workspaceDir),
          lastOpenedAt: "2026-08-20T00:00:00.000Z",
        },
      ],
      palette: "default",
      mode: "system",
      glassEnabled: false,
      glassStrength: 55,
      uiFontSize: 16,
      chatFontSize: 14,
      trustedPermissionWorkspaceIds: [],
      sessionLifecycle: [],
      enabledSkillSources: [],
      githubMcpEnabled: false,
    })}\n`,
  );
}

test("renders metadata chrome before Pi, rejects work promptly, then admits normal chat", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const workspaceDir = await makeWorkspaceDir();
  const gate = join(userDataDir, "release-runtime");
  await seedRecentWorkspace(userDataDir, workspaceDir);
  const harness = await launchDesktop(userDataDir, {
    env: {
      PHO_CODE_AGENT_DIR: agentDir,
      PHO_CODE_TEST_MODEL: "1",
      PHO_CODE_TEST_RUNTIME_GATE: gate,
      PHO_CODE_TEST_WORKSPACE: workspaceDir,
    },
  });

  try {
    const page = await harness.firstWindow();
    await expect(page.getByTestId("workspace-heading")).toBeVisible();
    await expect(page.getByTestId("welcome-recent-project")).toContainText(basename(workspaceDir));
    await expect(page.getByTestId("pi-runtime-status")).toHaveText("Starting Pi…");
    await expect(page.getByTestId("new-session")).toBeDisabled();

    const unavailable = await page.evaluate(async () => {
      try {
        await window.phoCode?.sendPrompt({ workspaceId: "/held", sessionId: "held", text: "hello" });
        return null;
      } catch (cause) {
        return cause;
      }
    });
    expect(unavailable).toMatchObject({ code: "runtime_unavailable" });

    await writeFile(gate, "release\n");
    await expect
      .poll(async () =>
        page.evaluate(async () => (await window.phoCode?.getBootstrapState())?.piRuntime.status),
      )
      .toBe("ready");
    await expect(page.getByTestId("pi-runtime-status")).toHaveCount(0);
    await expect(page.getByTestId("new-session")).toBeEnabled();

    await page.getByTestId("new-session").click();
    await expect(page.getByTestId("composer")).toBeVisible();
    await page.getByTestId("composer").fill("hello");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByTestId("transcript")).toContainText("Hello from the test model.", { timeout: 20_000 });
  } finally {
    await harness.close();
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
    await removeTestDirectory(workspaceDir);
  }
});

test("runtime boot failure leaves the welcome chrome alive with a bounded error", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const harness = await launchDesktop(userDataDir, {
    env: {
      PHO_CODE_AGENT_DIR: agentDir,
      PHO_CODE_TEST_RUNTIME_FAILURE: "1",
    },
  });

  try {
    const page = await harness.firstWindow();
    await expect(page.getByTestId("workspace-heading")).toBeVisible();
    await expect(page.getByTestId("pi-runtime-status")).toContainText("Pi runtime failed to start");
    const state = await page.evaluate(async () => window.phoCode?.getBootstrapState());
    expect(state?.capabilities.piRuntime).toBe(false);
    expect(state?.piRuntime.status).toBe("failed");
  } finally {
    await harness.close();
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
  }
});

test("quit while runtime boot is held does not hang or attach a late runtime", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const gate = join(userDataDir, "release-runtime");
  const shutdownProbe = join(userDataDir, "shutdown-probe.json");
  const harness = await launchDesktop(userDataDir, {
    env: {
      PHO_CODE_AGENT_DIR: agentDir,
      PHO_CODE_SHUTDOWN_PROBE: shutdownProbe,
      PHO_CODE_TEST_RUNTIME_GATE: gate,
    },
  });

  try {
    const page = await harness.firstWindow();
    await expect(page.getByTestId("workspace-heading")).toBeVisible();
    await expect(page.getByTestId("pi-runtime-status")).toHaveText("Starting Pi…");
    const closed = harness.electronApp.waitForEvent("close");
    await harness.electronApp.evaluate(async ({ app }) => app.quit());
    await closed;
  } finally {
    try {
      await harness.close();
    } catch {
      // Explicit quit may already have closed Electron.
    }
  }

  const probe = JSON.parse(await readFile(shutdownProbe, "utf8")) as {
    disposeCount: number;
    shutdown: string;
  };
  expect(probe).toEqual({ disposeCount: 0, shutdown: "completed" });
  await removeTestDirectory(userDataDir);
  await removeTestDirectory(agentDir);
});
