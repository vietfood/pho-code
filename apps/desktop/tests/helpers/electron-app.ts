import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { recoverablyRemoveOwnedTempFixture, TEST_FIXTURE_PREFIX } from "./owned-temp-path";

const desktopDir = dirname(fileURLToPath(new URL("../../package.json", import.meta.url)));
const require = createRequire(import.meta.url);
const electronExecutablePath = require("electron") as string;

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

export async function removeTestDirectory(directory: string): Promise<void> {
  await recoverablyRemoveOwnedTempFixture(directory);
}

export async function expandSettledWorkLog(page: Page, priorToggleCount = 0): Promise<void> {
  const toggle = page.getByTestId("work-log-toggle").nth(priorToggleCount);
  await expect(toggle).toContainText(/Worked(?: for)?/u, { timeout: 20_000 });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

function desktopLaunchEnv(userDataDir: string, extraEnv: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
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
