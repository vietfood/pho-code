import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";
import { RUNTIME_EVENT_TYPES, type RuntimeEvent } from "@pho-code/protocol";
import {
  createDefaultFeatureManifest,
  createNodeModuleResourceLocator,
  createPhoCodeRuntime,
  SANDBOX_FEATURE_ID,
  TEST_PROMPT,
} from "../src/index";
import { applyPermissionSettingsPatch } from "../src/permission-settings";

async function makeIsolatedDirs() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-sandbox-permission-"));
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

async function waitForSettledWithoutDialog(
  events: RuntimeEvent[],
  prompt: Promise<unknown>,
  timeoutMs = 20_000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    if (events.some((event) => event.type === RUNTIME_EVENT_TYPES.extensionDialogRequest)) {
      throw new Error("Permission dialog appeared while sandbox skip-ask should have applied.");
    }
    if (events.some((event) => event.type === RUNTIME_EVENT_TYPES.runSettled)) {
      await prompt;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for runSettled. Saw: ${events.map((event) => event.type).join(", ")}`);
}

function toolOutput(events: RuntimeEvent[]): string {
  return events
    .filter((event) => event.type === RUNTIME_EVENT_TYPES.toolEvent)
    .map((event) => event.payload as { outputPreview?: string })
    .map((payload) => payload.outputPreview ?? "")
    .join("\n");
}

describe("sandbox permission skip runtime", () => {
  test("healthy sandbox skips bash asks, keeps denies, and restore asks on disable", async () => {
    const { root, agentDir, workspaceDir } = await makeIsolatedDirs();
    initGitRepo(workspaceDir);
    const fixturePath = path.join(workspaceDir, "disposable-fixture.txt");
    await writeFile(fixturePath, "owned\n");
    applyPermissionSettingsPatch({ agentDir, patch: { profile: "balanced" } });

    const runtime = await createPhoCodeRuntime({
      agentDir,
      applicationDataDir: agentDir,
      deterministicTestModel: true,
      featureManifest: createDefaultFeatureManifest(createNodeModuleResourceLocator(), { agentDir }),
    });
    const events: RuntimeEvent[] = [];
    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      expect(workspace.features.features.some((feature) => feature.id === SANDBOX_FEATURE_ID)).toBe(true);
      const created = await runtime.createSession(workspace.workspace.id);
      const enabled = await runtime.updateSandboxSettings({ enabled: true, networkMode: "deny" });
      expect(enabled.status).toBe("healthy");
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });

      events.length = 0;
      const pwd = runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useSandboxPwd });
      await waitForSettledWithoutDialog(events, pwd);
      expect(toolOutput(events)).toContain(workspaceDir);

      events.length = 0;
      await runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useDangerousShell });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled);
      expect(events.some((event) => event.type === RUNTIME_EVENT_TYPES.extensionDialogRequest)).toBe(false);
      expect(toolOutput(events).toLowerCase()).toMatch(/permanent removal|move_to_trash|denied|not permitted/);
      expect(existsSync(fixturePath)).toBe(true);

      events.length = 0;
      const curl = runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useSandboxCurl });
      await waitForSettledWithoutDialog(events, curl);
      expect(toolOutput(events).toLowerCase()).toMatch(/not permitted|denied|unavailable|operation not permitted|failed/);

      events.length = 0;
      const writeAdmission = await runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useWrite });
      await waitForSettledWithoutDialog(events, Promise.resolve(writeAdmission));
      expect(existsSync(path.join(workspaceDir, "agent-note.txt"))).toBe(true);
      const writeReview = await runtime.getChangeReviewSet({
        workspaceId: created.workspace.id,
        sessionId: created.session.id,
        runId: writeAdmission.runId,
      });
      expect(writeReview.files).toHaveLength(1);
      expect(writeReview.files[0]?.kind).toBe("created");
      expect(writeReview.files[0]?.status).toBe("pending");

      for (const profile of ["guarded", "developer"] as const) {
        await runtime.updatePermissionSettings({ profile });
        events.length = 0;
        const nextPwd = runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useSandboxPwd });
        await waitForSettledWithoutDialog(events, nextPwd);
        expect(toolOutput(events)).toContain(workspaceDir);
      }

      await runtime.updatePermissionSettings({ profile: "balanced" });

      const disabled = await runtime.updateSandboxSettings({ enabled: false });
      expect(disabled.status).toBe("off");
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
      stop();
    } finally {
      await runtime.dispose();
      spawnSync("/usr/bin/trash", [root], { encoding: "utf8" });
    }
  }, 120_000);
});
