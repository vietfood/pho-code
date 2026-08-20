import { existsSync } from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
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

async function makeIsolatedDirs() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-sandbox-settings-"));
  const agentDir = path.join(root, "agent");
  const workspaceDir = path.join(root, "workspace");
  await mkdir(agentDir);
  await mkdir(workspaceDir);
  return { root, agentDir, workspaceDir };
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

describe("sandbox settings runtime", () => {
  test("idle enable wraps workspace touch, denies curl, and disable restores bash asks", async () => {
    const { root, agentDir, workspaceDir } = await makeIsolatedDirs();
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
      expect(runtime.getSandboxSettings().enabled).toBe(false);
      expect(runtime.getSandboxSettings().status).toBe("off");

      const enabled = await runtime.updateSandboxSettings({ enabled: true, networkMode: "deny" });
      expect(enabled.enabled).toBe(true);
      expect(enabled.status).toBe("healthy");

      const stop = runtime.subscribe((event) => {
        events.push(event);
      });

      const touch = runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useSandboxTouch });
      await waitForSettledWithoutDialog(events, touch);
      expect(existsSync(path.join(workspaceDir, "sandbox-allowed.txt"))).toBe(true);
      expect(events.some((event) => event.type === RUNTIME_EVENT_TYPES.extensionDialogRequest)).toBe(false);
      expect(
        events.some(
          (event) =>
            event.type === RUNTIME_EVENT_TYPES.toolEvent &&
            (event.payload as { name?: string; sandboxed?: boolean }).name === "bash" &&
            (event.payload as { sandboxed?: boolean }).sandboxed === true,
        ),
      ).toBe(true);

      events.length = 0;
      const curl = runtime.sendPrompt({ sessionId: created.session.id, text: TEST_PROMPT.useSandboxCurl });
      await waitForSettledWithoutDialog(events, curl);
      expect(events.some((event) => event.type === RUNTIME_EVENT_TYPES.extensionDialogRequest)).toBe(false);
      expect(toolOutput(events).toLowerCase()).toMatch(/not permitted|denied|unavailable|operation not permitted|failed/);
      expect(toolOutput(events)).toContain("Do not retry");
      expect(toolOutput(events)).toContain("Settings → Sandbox");

      const disabled = await runtime.updateSandboxSettings({ enabled: false });
      expect(disabled.enabled).toBe(false);
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
  }, 90_000);
});
