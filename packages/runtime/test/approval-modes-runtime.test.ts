import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  RUNTIME_EVENT_TYPES,
  type ApprovalRequest,
  type RuntimeEvent,
} from "@pho-code/protocol";
import { createPhoCodeRuntime } from "../src/pi-runtime";
import { sandboxSettingsPath } from "../src/sandbox-settings";
import { TEST_PROMPT } from "../src/test-model";

async function dirs() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-approval-"));
  const agentDir = path.join(root, "agent");
  const workspace = path.join(root, "workspace");
  const applicationDataDir = path.join(root, "data");
  await Promise.all([mkdir(agentDir), mkdir(workspace), mkdir(applicationDataDir)]);
  return { agentDir, workspace, applicationDataDir };
}

async function waitFor(
  events: RuntimeEvent[],
  type: RuntimeEvent["type"],
  sessionId?: string,
): Promise<RuntimeEvent> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const found = events.find((event) => event.type === type && (!sessionId || event.sessionId === sessionId));
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${type}`);
}

describe("approval modes Pi runtime", () => {
  test("Ask waits for one owner resolution and Auto uses the injected isolated reviewer", async () => {
    const { agentDir, workspace, applicationDataDir } = await dirs();
    let reviews = 0;
    const runtime = await createPhoCodeRuntime({
      agentDir,
      applicationDataDir,
      deterministicTestModel: true,
      approvalModes: true,
      approvalReviewer: async () => {
        reviews += 1;
        return { outcome: "allow-once", rationale: "bounded test approval" };
      },
    });
    const events: RuntimeEvent[] = [];
    const unsubscribe = runtime.subscribe((event) => events.push(event));
    try {
      const inspected = await runtime.inspectWorkspace({ path: workspace, approveProjectResources: true });
      const ask = await runtime.createSession(inspected.workspace.id);
      await runtime.sendPrompt({ workspaceId: inspected.workspace.id, sessionId: ask.session.id, text: TEST_PROMPT.useTool });
      const requested = await waitFor(events, RUNTIME_EVENT_TYPES.approvalRequest, ask.session.id);
      const request = requested.payload as ApprovalRequest;
      expect(request.action.title).toContain("harness_mark");
      await runtime.resolveApprovalRequest({
        workspaceId: inspected.workspace.id,
        sessionId: ask.session.id,
        requestId: request.requestId,
        resolution: "allow-once",
      });
      await waitFor(events, RUNTIME_EVENT_TYPES.runSettled, ask.session.id);

      const policyGeneration = (await runtime.getSessionSnapshot({
        workspaceId: inspected.workspace.id,
        sessionId: ask.session.id,
      })).approval?.policyGeneration ?? -1;
      await runtime.updateApprovalModeSettings({ autoEnabled: true });
      expect((await runtime.getSessionSnapshot({
        workspaceId: inspected.workspace.id,
        sessionId: ask.session.id,
      })).approval?.policyGeneration).toBeGreaterThan(policyGeneration);
      const auto = await runtime.createSession(inspected.workspace.id);
      await runtime.setSessionApprovalMode({
        workspaceId: inspected.workspace.id,
        sessionId: auto.session.id,
        mode: "auto",
      });
      events.length = 0;
      await runtime.sendPrompt({ workspaceId: inspected.workspace.id, sessionId: auto.session.id, text: TEST_PROMPT.useTool });
      await waitFor(events, RUNTIME_EVENT_TYPES.runSettled, auto.session.id);
      expect(reviews).toBe(1);
      expect(events.some((event) => event.type === RUNTIME_EVENT_TYPES.approvalRequest)).toBe(false);
      const reviewActivity = events
        .filter((event) => event.type === RUNTIME_EVENT_TYPES.approvalReviewChanged)
        .map((event) => (event.payload as { activity?: { state: string; outcome?: string } }).activity);
      expect(reviewActivity).toContainEqual(expect.objectContaining({ state: "reviewing" }));
      expect(reviewActivity).toContainEqual(expect.objectContaining({ state: "settled", outcome: "approved" }));
    } finally {
      unsubscribe();
      await runtime.dispose();
    }
  });

  test("Full is isolated per chat, retains invariants, and does not mutate sandbox settings", async () => {
    const { agentDir, workspace, applicationDataDir } = await dirs();
    const runtime = await createPhoCodeRuntime({
      agentDir,
      applicationDataDir,
      deterministicTestModel: true,
      approvalModes: true,
    });
    const events: RuntimeEvent[] = [];
    const unsubscribe = runtime.subscribe((event) => events.push(event));
    try {
      const inspected = await runtime.inspectWorkspace({ path: workspace, approveProjectResources: true });
      await runtime.updateApprovalModeSettings({ fullAccessEnabled: true });
      const full = await runtime.createSession(inspected.workspace.id);
      const ask = await runtime.createSession(inspected.workspace.id);
      const laterFull = await runtime.createSession(inspected.workspace.id);
      await runtime.setSessionApprovalMode({
        workspaceId: inspected.workspace.id,
        sessionId: full.session.id,
        mode: "full",
        acknowledgeFullRisk: true,
      });
      const laterFullSnapshot = await runtime.setSessionApprovalMode({
        workspaceId: inspected.workspace.id,
        sessionId: laterFull.session.id,
        mode: "full",
      });
      expect(laterFullSnapshot.approval?.fullAccess).toMatchObject({
        active: true,
        acknowledgedThisProcess: true,
      });

      await runtime.sendPrompt({ workspaceId: inspected.workspace.id, sessionId: full.session.id, text: TEST_PROMPT.useTool });
      await runtime.sendPrompt({ workspaceId: inspected.workspace.id, sessionId: ask.session.id, text: TEST_PROMPT.useTool });
      await waitFor(events, RUNTIME_EVENT_TYPES.runSettled, full.session.id);
      const pending = await waitFor(events, RUNTIME_EVENT_TYPES.approvalRequest, ask.session.id);
      expect((pending.payload as ApprovalRequest).sessionId).toBe(ask.session.id);
      expect(await exists(sandboxSettingsPath(applicationDataDir))).toBe(false);

      events.length = 0;
      await writeFile(path.join(workspace, "disposable-fixture.txt"), "keep\n");
      await runtime.sendPrompt({
        workspaceId: inspected.workspace.id,
        sessionId: full.session.id,
        text: TEST_PROMPT.useDangerousShell,
      });
      await waitFor(events, RUNTIME_EVENT_TYPES.runSettled, full.session.id);
      const snapshot = await runtime.getSessionSnapshot({
        workspaceId: inspected.workspace.id,
        sessionId: full.session.id,
      });
      expect(snapshot.messages.some((message) =>
        message.blocks.some((block) => block.type === "tool" && block.name === "bash" && block.status === "failed"),
      )).toBe(true);
      expect(await exists(path.join(workspace, "disposable-fixture.txt"))).toBe(true);
    } finally {
      unsubscribe();
      await runtime.dispose();
    }
  });
});

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
