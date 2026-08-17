import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, _electron as electron, type ElectronApplication, type Locator, type Page } from "@playwright/test";
import { recoverablyRemoveOwnedTempFixture, TEST_FIXTURE_PREFIX } from "./owned-temp-path";

const desktopDir = dirname(fileURLToPath(new URL("../../package.json", import.meta.url)));
const require = createRequire(import.meta.url);
const electronExecutablePath = require("electron") as string;

export function desktopResourcesDir(): string {
  return join(desktopDir, "resources");
}

export interface DesktopHarness {
  electronApp: ElectronApplication;
  firstWindow(): Promise<Page>;
  close(): Promise<void>;
}

export interface LaunchDesktopOptions {
  env?: Readonly<Record<string, string>>;
}

export async function makeUserDataDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), TEST_FIXTURE_PREFIX));
}

export async function makeAgentDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), TEST_FIXTURE_PREFIX));
}

export async function makeWorkspaceDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), TEST_FIXTURE_PREFIX));
}

export async function writeResourceFixture(workspaceDir: string): Promise<void> {
  await mkdir(join(workspaceDir, ".pi", "extensions"), { recursive: true });
  await mkdir(join(workspaceDir, ".agents", "skills", "harness-note"), { recursive: true });
  await writeFile(
    join(workspaceDir, ".pi", "extensions", "harness-dialog.ts"),
    `export default function harnessDialog(pi) {
  pi.registerCommand("harness-confirm", {
    description: "Open the representative harness confirm dialog",
    handler: async (_args, ctx) => {
      const confirmed = await ctx.ui.confirm("Confirm harness action?", "Approve this representative dialog.");
      ctx.ui.notify(confirmed ? "Confirm accepted" : "Confirm rejected", "info");
    },
  });
}
`,
  );
  await writeFile(
    join(workspaceDir, ".pi", "extensions", "harness-broken.ts"),
    "throw new Error('intentional harness diagnostic');\n",
  );
  await writeFile(
    join(workspaceDir, ".agents", "skills", "harness-note", "SKILL.md"),
    `---
name: harness-note
description: A representative skill for the harness resource slice.
---

Leave a short note when this skill is relevant.
`,
  );
}

export async function writeProjectPermissionOverride(workspaceDir: string): Promise<void> {
  await mkdir(join(workspaceDir, ".pi", "extensions", "pi-permission-system"), { recursive: true });
  await writeFile(
    join(workspaceDir, ".pi", "extensions", "pi-permission-system", "config.json"),
    `${JSON.stringify({ permissionReviewLog: true }, null, 2)}\n`,
  );
}

export async function removeTestDirectory(directory: string): Promise<void> {
  await recoverablyRemoveOwnedTempFixture(directory);
}

export async function allowOnceIfPrompted(page: Page): Promise<void> {
  const dialog = page.getByTestId("extension-dialog");
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await page.getByRole("radio", { name: "Allow once", exact: true }).check();
  const confirm = page.getByTestId("extension-dialog-confirm");
  if ((await confirm.count()) > 0) {
    await confirm.click();
  } else {
    await page.keyboard.press("Enter");
  }
  await expect(dialog).toHaveCount(0);
}

/** Milestone 2: sandboxed bash must not open a permission dock. Fail if one appears. */
export async function expectNoDialogThenExpandWorkLog(page: Page, priorToggleCount = 0): Promise<void> {
  const dialog = page.getByTestId("extension-dialog");
  const toggle = page.getByTestId("work-log-toggle").nth(priorToggleCount);
  const settled =
    /Behind the scenes|Had a quick think|Thought it through|Took a peek|Looked around a bit|Thought, then peeked|Did a little digging|Went exploring/u;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await dialog.isVisible().catch(() => false)) {
      throw new Error("Permission dialog appeared while sandbox skip-ask should have applied.");
    }
    const text = (await toggle.textContent().catch(() => "")) ?? "";
    if (settled.test(text)) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await expandSettledWorkLog(page, priorToggleCount);
}

export async function writeSandboxSettingsFile(userDataDir: string, enabled: boolean): Promise<void> {
  await writeFile(
    join(userDataDir, "sandbox-settings.json"),
    `${JSON.stringify(
      {
        enabled,
        networkMode: "deny",
        allowedDomains: [],
        includePackageRegistryDefaults: false,
        additionalReadPaths: [],
        additionalWritePaths: [],
      },
      null,
      2,
    )}\n`,
  );
}

export async function stageRipgrepFixture(resourcesDir: string): Promise<string> {
  const platform = process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  const dest = join(resourcesDir, "features", "ripgrep", "15.2.0", platform, "rg");
  await mkdir(dirname(dest), { recursive: true });
  const which = spawnSync("which", ["rg"], { encoding: "utf8" });
  const source = which.stdout.trim();
  if (!source) {
    throw new Error("rg is required on PATH to stage a desktop sandbox fixture.");
  }
  await copyFile(source, dest);
  await chmod(dest, 0o755);
  return dest;
}

export async function expandSettledWorkLog(page: Page, priorToggleCount = 0): Promise<void> {
  const toggle = page.getByTestId("work-log-toggle").nth(priorToggleCount);
  await expect(toggle).toContainText(
    /Behind the scenes|Had a quick think|Thought it through|Took a peek|Looked around a bit|Thought, then peeked|Did a little digging|Went exploring/u,
    { timeout: 20_000 },
  );
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

export async function openSettingsSection(
  page: Page,
  section: "appearance" | "accounts" | "github" | "skills" | "archived" | "permissions" | "sandbox",
): Promise<void> {
  const view = page.getByTestId("settings-view");
  if ((await view.count()) === 0 || !(await view.isVisible())) {
    await page.getByTestId("open-settings").click();
    await expect(view).toBeVisible();
  }
  await page.getByTestId(`settings-tab-${section}`).click();
  await expect(page.getByTestId(`settings-panel-${section}`)).toBeVisible();
}

export function selectedSessionItem(page: Page): Locator {
  return page.locator('[data-testid="session-item"][aria-current="true"]');
}

export function unselectedSessionItem(page: Page): Locator {
  return page.locator('[data-testid="session-item"]:not([aria-current="true"])');
}

export async function openSessionActions(sessionItem: Locator): Promise<void> {
  const row = sessionItem.first().locator("xpath=ancestor::li[1]");
  await row.click({ button: "right" });
  await expect(sessionItem.page().getByTestId("session-context-menu")).toBeVisible();
}

function desktopLaunchEnv(userDataDir: string, extraEnv: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.PHO_CODE_AGENT_DIR;
  env.PHO_CODE_USER_DATA_DIR = userDataDir;
  env.PHO_CODE_TEST_MODE = "background";
  Object.assign(env, extraEnv);
  return env;
}

export async function launchDesktop(
  userDataDir: string,
  options: LaunchDesktopOptions = {},
): Promise<DesktopHarness> {
  const electronApp = await electron.launch({
    executablePath: electronExecutablePath,
    args: [desktopDir],
    cwd: desktopDir,
    env: desktopLaunchEnv(userDataDir, options.env),
  });

  return {
    electronApp,
    firstWindow: () => electronApp.firstWindow(),
    close: () => electronApp.close(),
  };
}

export function resolvePackagedAppPath(): string {
  const candidates = [
    join(desktopDir, "release", "mac-arm64", "Pho Code.app"),
    join(desktopDir, "release", "mac", "Pho Code.app"),
    join(desktopDir, "release", "mac-x64", "Pho Code.app"),
  ];
  const found = candidates.find((candidate) => existsSync(join(candidate, "Contents", "MacOS", "Pho Code")));
  if (!found) {
    throw new Error(
      "Packaged Pho Code.app was not found. Run `bun run package:mac` before `bun run test:packaged`.",
    );
  }
  return found;
}

export function pathWithoutPi(): string {
  return ["/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":");
}

export async function launchPackagedDesktop(
  userDataDir: string,
  options: LaunchDesktopOptions = {},
): Promise<DesktopHarness> {
  const appPath = resolvePackagedAppPath();
  const executablePath = join(appPath, "Contents", "MacOS", "Pho Code");
  const env = desktopLaunchEnv(userDataDir, options.env);
  env.PATH = pathWithoutPi();
  delete env.PHO_CODE_RESOURCES_DIR;
  const electronApp = await electron.launch({
    executablePath,
    args: [],
    cwd: tmpdir(),
    env,
  });

  return {
    electronApp,
    firstWindow: () => electronApp.firstWindow(),
    close: () => electronApp.close(),
  };
}
