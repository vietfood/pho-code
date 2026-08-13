import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { getPermissionsService } from "@gotgenes/pi-permission-system";
import { HARNESS_ERROR_CODES, RUNTIME_EVENT_TYPES, type RuntimeEvent } from "@pho-code/protocol";
import {
  createDefaultFeatureManifest,
  createNodeModuleResourceLocator,
  createPhoCodeRuntime,
  displayToolName,
} from "../src/index";
import { applyPermissionSettingsPatch } from "../src/permission-settings";
import { createArgvProcessLauncher, type ArgvProcessLaunchInput } from "../src/process-launch";
import { createOsTrashRemovalService } from "../src/recoverable-removal";
import { TEST_PROMPT } from "../src/test-model";
import { TRASH_FEATURE_ID } from "../src/trash-feature";
import { TRASH_TOOL_NAME } from "../src/trash-target";

async function makeIsolatedDirs() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-test-"));
  const agentDir = path.join(root, "agent");
  const workspaceDir = path.join(root, "workspace");
  await mkdir(agentDir);
  await mkdir(workspaceDir);
  return { root, agentDir, workspaceDir };
}

function initGitRepo(workspaceDir: string): void {
  const result = spawnSync("git", ["init"], { cwd: workspaceDir, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git init failed: ${result.stderr}`);
  }
}

async function waitForEvent(
  events: RuntimeEvent[],
  type: RuntimeEvent["type"],
  timeoutMs = 20_000,
): Promise<RuntimeEvent> {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const match = events.find((event) => event.type === type);
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${type}. Saw: ${events.map((event) => event.type).join(", ")}`);
}

function toolOutput(events: RuntimeEvent[], name: string): string {
  return events
    .filter((event) => event.type === RUNTIME_EVENT_TYPES.toolEvent)
    .map((event) => event.payload as { name?: string; outputPreview?: string })
    .filter((payload) => payload.name === name)
    .map((payload) => payload.outputPreview ?? "")
    .join("\n");
}

describe("Developer profile runtime", () => {
  test("allows safe shell work, denies rm, asks for wrappers, and moves an owned fixture to Trash", async () => {
    const { root, agentDir, workspaceDir } = await makeIsolatedDirs();
    initGitRepo(workspaceDir);
    const fixturePath = path.join(workspaceDir, "disposable-fixture.txt");
    await writeFile(fixturePath, "owned\n");
    applyPermissionSettingsPatch({ agentDir, patch: { profile: "developer" } });

    const launches: ArgvProcessLaunchInput[] = [];
    const realLauncher = createArgvProcessLauncher();
    const runtime = await createPhoCodeRuntime({
      agentDir,
      deterministicTestModel: true,
      featureManifest: createDefaultFeatureManifest(createNodeModuleResourceLocator(), {
        agentDir,
        removal: createOsTrashRemovalService({
          launcher: {
            async run(input) {
              launches.push(input);
              expect(input.executable).not.toContain("rm");
              expect(input.args.includes("rm")).toBe(false);
              return realLauncher.run(input);
            },
          },
        }),
      }),
    });
    const events: RuntimeEvent[] = [];

    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      expect(workspace.features.features.some((feature) => feature.id === TRASH_FEATURE_ID)).toBe(true);
      const created = await runtime.createSession(workspace.workspace.id);
      expect(runtime.getPermissionSettings().profile).toBe("developer");
      const service = getPermissionsService();
      expect(service?.checkPermission("bash", "git status").state).toBe("allow");
      expect(service?.checkPermission("bash", "rm -rf disposable-fixture.txt").state).toBe("deny");
      expect(service?.getToolPermission("move_to_trash")).toBe("allow");

      const stop = runtime.subscribe((event) => {
        events.push(event);
      });

      await runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useSafeShell });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled);
      expect(events.some((event) => event.type === RUNTIME_EVENT_TYPES.extensionDialogRequest)).toBe(false);

      events.length = 0;
      await runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useCompoundSafe });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled);
      expect(events.some((event) => event.type === RUNTIME_EVENT_TYPES.extensionDialogRequest)).toBe(false);

      events.length = 0;
      await runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useDangerousShell });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled);
      expect(events.some((event) => event.type === RUNTIME_EVENT_TYPES.extensionDialogRequest)).toBe(false);
      expect(toolOutput(events, "bash").toLowerCase()).toMatch(/not permitted|denied|unavailable/);
      expect(existsSync(fixturePath)).toBe(true);

      events.length = 0;
      await runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useCompoundDangerous });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled);
      expect(events.some((event) => event.type === RUNTIME_EVENT_TYPES.extensionDialogRequest)).toBe(false);
      expect(toolOutput(events, "bash").toLowerCase()).toMatch(/not permitted|denied|unavailable/);
      expect(existsSync(fixturePath)).toBe(true);

      events.length = 0;
      const wrapped = runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useWrapper });
      const dialog = await waitForEvent(events, RUNTIME_EVENT_TYPES.extensionDialogRequest);
      const dialogText = `${(dialog.payload as { title?: string }).title ?? ""}\n${(dialog.payload as { message?: string }).message ?? ""}`;
      expect(dialogText).toContain("bash");
      await runtime.resolveHostDialog({
        requestId: (dialog.payload as { requestId: string }).requestId,
        selected: "No",
      });
      await wrapped;
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled);

      events.length = 0;
      await runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useTrash });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled);
      expect(events.some((event) => event.type === RUNTIME_EVENT_TYPES.extensionDialogRequest)).toBe(false);
      expect(toolOutput(events, displayToolName(TRASH_TOOL_NAME))).toContain("recoverable");
      expect(existsSync(fixturePath)).toBe(false);
      expect(launches.some((call) => call.executable === "/usr/bin/trash" || call.executable.includes("trash"))).toBe(true);

      const reopened = await runtime.openSession(workspace.workspace.id, created.session.id);
      expect(reopened.features.features.some((feature) => feature.id === TRASH_FEATURE_ID)).toBe(true);
      expect(runtime.getPermissionSettings().profile).toBe("developer");
      stop();
    } finally {
      await runtime.dispose();
      spawnSync("/usr/bin/trash", [root], { encoding: "utf8" });
    }
  }, 90_000);

  test("refuses permission changes during an active run", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    applyPermissionSettingsPatch({ agentDir, patch: { profile: "developer" } });
    const runtime = await createPhoCodeRuntime({
      agentDir,
      deterministicTestModel: true,
      featureManifest: createDefaultFeatureManifest(createNodeModuleResourceLocator(), { agentDir }),
    });
    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const created = await runtime.createSession(workspace.workspace.id);
      const events: RuntimeEvent[] = [];
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      const prompt = runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useWrapper });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.extensionDialogRequest);
      await expect(runtime.updatePermissionSettings({ profile: "guarded" })).rejects.toMatchObject({
        code: HARNESS_ERROR_CODES.sessionBusy,
      });
      await runtime.resolveHostDialog({
        requestId: (events.find((event) => event.type === RUNTIME_EVENT_TYPES.extensionDialogRequest)?.payload as { requestId: string })
          .requestId,
        selected: "No",
      });
      await prompt;
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 45_000);
});
