import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { launchDesktop, makeAgentDir, makeUserDataDir, removeTestDirectory } from "./helpers/electron-app";

const desktopDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

test("boots the typed bootstrap bridge behind renderer isolation", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const shutdownProbe = join(userDataDir, "shutdown-probe.json");
  const harness = await launchDesktop(userDataDir, {
    env: {
      PHO_CODE_SHUTDOWN_PROBE: shutdownProbe,
      PHO_CODE_AGENT_DIR: agentDir,
    },
  });

  try {
    const page = await harness.firstWindow();
    await expect(page.getByTestId("bootstrap-state")).toHaveAccessibleName("About · 0.0.0");
    await expect(page.getByTestId("add-project")).toBeVisible();
    await expect(page.getByTestId("toggle-sidebar")).toBeVisible();
    await page.getByRole("button", { name: "Hide sidebar" }).click();
    await expect(page.getByTestId("app-sidebar")).toHaveAttribute("data-collapsed", "true");
    await expect(page.getByTestId("app-sidebar-pill")).toBeVisible();
    await expect(page.getByTestId("app-sidebar-pill").getByTestId("add-project")).toBeVisible();
    await expect(page.getByTestId("app-sidebar-pill").getByTestId("new-session")).toBeVisible();
    await expect(page.getByTestId("app-sidebar-pill").getByTestId("open-settings")).toBeVisible();
    await expect(page.getByRole("button", { name: "Show sidebar" })).toBeVisible();
    await page.getByRole("button", { name: "Show sidebar" }).click();
    await expect(page.getByTestId("app-sidebar")).toHaveAttribute("data-collapsed", "false");
    await expect(page.getByTestId("add-project")).toBeVisible();

    const security = await harness.electronApp.evaluate(async ({ app, BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) {
        throw new Error("Expected an application window.");
      }

      const prefs = window.webContents.getLastWebPreferences();
      return {
        name: app.getName(),
        node: process.versions.node,
        electron: process.versions.electron,
        contextIsolation: prefs?.contextIsolation ?? false,
        nodeIntegration: prefs?.nodeIntegration ?? true,
        sandbox: prefs?.sandbox ?? false,
      };
    });

    expect(security.name).toBe("Pho Code");
    expect(security.contextIsolation).toBe(true);
    expect(security.nodeIntegration).toBe(false);
    expect(security.sandbox).toBe(true);

    const desktopPackage = JSON.parse(await readFile(join(desktopDir, "package.json"), "utf8")) as {
      devDependencies: { electron: string };
    };
    expect(security.electron).toBe(desktopPackage.devDependencies.electron);

    const state = await page.evaluate(async () => {
      const bridge = window.phoCode;
      if (!bridge) {
        throw new Error("Desktop bridge is missing.");
      }
      return bridge.getBootstrapState();
    });

    expect(state.versions.electron).toBe(security.electron);
    expect(state.versions.embeddedNode).toBe(security.node);
    expect(state.embeddedNodeCompatible).toBe(true);
    expect(state.intendedPiSdk.enginesNode).toBe(">=22.19.0");

    const isolation = await page.evaluate(() => {
      const record = window as unknown as Record<string, unknown>;
      const bridge = window.phoCode as unknown as Record<string, unknown> | undefined;
      return {
        require: typeof record.require,
        process: typeof record.process,
        electron: typeof record.electron,
        ipcRenderer: typeof record.ipcRenderer,
        bridgeKeys: Object.keys(bridge ?? {}).sort(),
        getBootstrapState: typeof bridge?.getBootstrapState,
        invoke: typeof bridge?.invoke,
      };
    });

    expect(isolation.require).toBe("undefined");
    expect(isolation.process).toBe("undefined");
    expect(isolation.electron).toBe("undefined");
    expect(isolation.ipcRenderer).toBe("undefined");
    expect(isolation.invoke).toBe("undefined");
    expect(isolation.getBootstrapState).toBe("function");
    expect(isolation.bridgeKeys).toEqual([
      "abortRun",
      "applyUndoChanges",
      "approveChanges",
      "archiveSession",
      "cancelProviderLogin",
      "createSession",
      "executeSessionPlan",
      "getBootstrapState",
      "getChangeDiff",
      "getChangeFileView",
      "getChangeReviewSet",
      "getSessionSnapshot",
      "getSettings",
      "importGitHubPat",
      "importProviderApiKey",
      "listCredentialProviders",
      "listProviderAccounts",
      "listSessionCatalog",
      "listWorkspaceSessions",
      "logoutProvider",
      "openProviderAuthLink",
      "openRecentWorkspace",
      "openSession",
      "pasteImages",
      "pickImages",
      "pickWorkspace",
      "prepareRemoveArchivedSessions",
      "prepareRemoveProject",
      "prepareRemoveSession",
      "prepareUndoChanges",
      "queueFollowUp",
      "refreshSkills",
      "removeArchivedSessions",
      "removeGitHubPat",
      "removePreparedImage",
      "removeProject",
      "removeSession",
      "reorderRecentWorkspaces",
      "resolveHostDialog",
      "respondProviderAuthPrompt",
      "restoreSession",
      "rewriteAssistantOutput",
      "searchWorkspaceReferences",
      "sendPrompt",
      "setSessionMode",
      "setSessionModel",
      "setThinkingLevel",
      "startProviderLogin",
      "steerRun",
      "subscribe",
      "trustProjectPermissionRules",
      "updateAppearanceSettings",
      "updateGitHubMcpSettings",
      "updatePermissionSettings",
      "updateSandboxSettings",
      "updateSessionContextPrompt",
      "updateSessionPlanDocument",
      "updateSkillSourceSettings",
    ]);
  } finally {
    await harness.close();
    const probe = JSON.parse(await readFile(shutdownProbe, "utf8")) as {
      disposeCount: number;
      shutdown: string;
    };
    expect(probe.disposeCount).toBe(1);
    expect(probe.shutdown).toBe("completed");
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
  }
});
