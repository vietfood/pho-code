import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";
import { RUNTIME_EVENT_TYPES, type RuntimeEvent } from "@pho-code/protocol";
import {
  createDefaultFeatureManifest,
  createNodeModuleResourceLocator,
  createPhoCodeRuntime,
  hashUtf8,
  SANDBOX_FEATURE_ID,
  SANDBOX_FILE_TOOL_OUTSIDE_REASON,
  SANDBOX_FILE_TOOL_PROTECTED_REASON,
  TEST_PROMPT,
} from "../src/index";
import { applyPermissionSettingsPatch } from "../src/permission-settings";

async function makeIsolatedDirs() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-sandbox-file-tool-"));
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
      throw new Error("Permission dialog appeared while sandbox file-tool policy should have applied.");
    }
    if (events.some((event) => event.type === RUNTIME_EVENT_TYPES.runSettled)) {
      await prompt;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for runSettled. Saw: ${events.map((event) => event.type).join(", ")}`);
}

async function waitForSettledAllowingOnce(
  runtime: { resolveHostDialog(input: { requestId: string; selected: string }): Promise<unknown> },
  events: RuntimeEvent[],
  prompt: Promise<unknown>,
  timeoutMs = 20_000,
): Promise<void> {
  const started = Date.now();
  let allowed = false;
  while (Date.now() - started <= timeoutMs) {
    const dialog = events.find((event) => event.type === RUNTIME_EVENT_TYPES.extensionDialogRequest);
    if (dialog && !allowed) {
      allowed = true;
      await runtime.resolveHostDialog({
        requestId: (dialog.payload as { requestId: string }).requestId,
        selected: "Yes",
      });
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

async function snapshotSshKey(): Promise<{ existed: boolean; bytes?: Buffer }> {
  const keyPath = path.join(homedir(), ".ssh", "id_rsa");
  if (!existsSync(keyPath)) {
    return { existed: false };
  }
  return { existed: true, bytes: await readFile(keyPath) };
}

describe("sandbox file-tool runtime", () => {
  test("healthy sandbox skips in-policy write, denies out-of-policy paths, and keeps V3 capture", async () => {
    const { root, agentDir, workspaceDir } = await makeIsolatedDirs();
    initGitRepo(workspaceDir);
    applyPermissionSettingsPatch({ agentDir, patch: { profile: "balanced" } });
    const extraRoot = await mkdtemp(path.join(homedir(), "pho-code-sandbox-file-extra-"));
    const extraWrite = path.join(extraRoot, "allowed");
    const extraDenied = path.join(extraRoot, "denied");
    await mkdir(extraWrite);
    await mkdir(extraDenied);
    const extraFile = path.join(extraWrite, "extra-note.txt");
    const deniedFile = path.join(extraDenied, "blocked-note.txt");

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
      const enabled = await runtime.updateSandboxSettings({
        enabled: true,
        networkMode: "deny",
        additionalWritePaths: [extraWrite],
      });
      expect(enabled.status).toBe("healthy");
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });

      events.length = 0;
      const writeAdmission = runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useWrite });
      await waitForSettledWithoutDialog(events, writeAdmission);
      const admitted = await writeAdmission;
      expect(existsSync(path.join(workspaceDir, "agent-note.txt"))).toBe(true);
      const writeReview = await runtime.getChangeReviewSet({
        workspaceId: created.workspace.id,
        sessionId: created.session.id,
        runId: admitted.runId,
      });
      expect(writeReview.files).toHaveLength(1);
      expect(writeReview.files[0]?.kind).toBe("created");
      expect(writeReview.files[0]?.status).toBe("pending");
      expect(writeReview.files[0]?.afterHash).toBe(hashUtf8("hello from agent\n"));

      events.length = 0;
      const envWrite = runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useSandboxWriteEnv });
      await waitForSettledWithoutDialog(events, envWrite);
      expect(existsSync(path.join(workspaceDir, ".env"))).toBe(false);
      expect(toolOutput(events).toLowerCase()).toMatch(/not permitted|denied|protected|sandbox policy/);

      events.length = 0;
      const mcpWrite = runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useSandboxWriteMcp });
      await waitForSettledWithoutDialog(events, mcpWrite);
      expect(existsSync(path.join(workspaceDir, ".mcp.json"))).toBe(false);
      expect(toolOutput(events)).toContain(SANDBOX_FILE_TOOL_PROTECTED_REASON);

      events.length = 0;
      const extraWritePrompt = runtime.sendPrompt({
        sessionId: created.session.id,
        text: `${TEST_PROMPT.useSandboxWriteAbs}${extraFile}`,
      });
      await waitForSettledAllowingOnce(runtime, events, extraWritePrompt);
      expect(existsSync(extraFile)).toBe(true);

      events.length = 0;
      const deniedPrompt = runtime.sendPrompt({
        sessionId: created.session.id,
        text: `${TEST_PROMPT.useSandboxWriteAbs}${deniedFile}`,
      });
      await waitForSettledWithoutDialog(events, deniedPrompt);
      expect(existsSync(deniedFile)).toBe(false);
      expect(toolOutput(events)).toContain(SANDBOX_FILE_TOOL_OUTSIDE_REASON);

      const disabled = await runtime.updateSandboxSettings({ enabled: false });
      expect(disabled.status).toBe("off");
      events.length = 0;
      const restored = runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useWrite });
      const dialog = await waitForEvent(events, RUNTIME_EVENT_TYPES.extensionDialogRequest);
      const dialogText = `${(dialog.payload as { title?: string }).title ?? ""}\n${(dialog.payload as { message?: string }).message ?? ""}`;
      expect(dialogText.toLowerCase()).toMatch(/write|agent-note/);
      await runtime.resolveHostDialog({
        requestId: (dialog.payload as { requestId: string }).requestId,
        selected: "No",
      });
      await restored;
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled);
      stop();
    } finally {
      await runtime.dispose();
      spawnSync("/usr/bin/trash", [root], { encoding: "utf8" });
      spawnSync("/usr/bin/trash", [extraRoot], { encoding: "utf8" });
    }
  }, 120_000);

  test("developer mode still cannot write ~/.ssh/id_rsa when sandbox is healthy", async () => {
    const { root, agentDir, workspaceDir } = await makeIsolatedDirs();
    applyPermissionSettingsPatch({ agentDir, patch: { profile: "developer" } });
    const before = await snapshotSshKey();

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
      const created = await runtime.createSession(workspace.workspace.id);
      const enabled = await runtime.updateSandboxSettings({ enabled: true, networkMode: "deny" });
      expect(enabled.status).toBe("healthy");
      runtime.subscribe((event) => {
        events.push(event);
      });

      const sshWrite = runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useSandboxWriteSsh });
      await waitForSettledWithoutDialog(events, sshWrite);
      expect(toolOutput(events).toLowerCase()).toMatch(/denied|sandbox policy|not permitted|protected/);
      const after = await snapshotSshKey();
      expect(after.existed).toBe(before.existed);
      if (before.existed && after.bytes && before.bytes) {
        expect(Buffer.compare(after.bytes, before.bytes)).toBe(0);
      }
      expect(after.bytes?.includes("sandbox-must-not-write") ?? false).toBe(false);
    } finally {
      await runtime.dispose();
      spawnSync("/usr/bin/trash", [root], { encoding: "utf8" });
    }
  }, 60_000);
});
