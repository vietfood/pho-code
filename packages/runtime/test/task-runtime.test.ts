import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { RUNTIME_EVENT_TYPES, type RuntimeEvent } from "@pho-code/protocol";
import { TEST_PROMPT, createPhoCodeRuntime } from "../src/index";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-task-"));
  const agentDir = path.join(root, "agent");
  const workspaceDir = path.join(root, "workspace");
  const applicationDataDir = path.join(root, "app-data");
  await Promise.all([mkdir(agentDir), mkdir(workspaceDir), mkdir(applicationDataDir)]);
  return { agentDir, workspaceDir, applicationDataDir };
}

async function waitForRun(events: RuntimeEvent[], runId: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (!events.some((event) => event.type === RUNTIME_EVENT_TYPES.runSettled && event.runId === runId)) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for run ${runId}.`);
    await Bun.sleep(10);
  }
}

describe("V5 Task runtime", () => {
  test("persists the brief, injects evidence, records settled verification, accepts gaps, and reopens", async () => {
    const dirs = await fixture();
    const first = await createPhoCodeRuntime({
      agentDir: dirs.agentDir,
      applicationDataDir: dirs.applicationDataDir,
      deterministicTestModel: true,
    });
    const events: RuntimeEvent[] = [];
    let sessionId = "";
    let revision = "";
    try {
      const workspace = await first.inspectWorkspace({ path: dirs.workspaceDir, approveProjectResources: true });
      const created = await first.createSession(workspace.workspace.id);
      sessionId = created.session.id;
      expect(created.task).toEqual({ verification: { records: [], truncated: false } });
      const scope = { workspaceId: workspace.workspace.id, sessionId };
      const briefed = await first.updateTaskBrief({
        ...scope,
        content: {
          objective: "Finish the V5 deterministic task journey",
          constraints: ["Keep Task separate from Plan"],
          acceptanceCriteria: [
            { id: "mechanics", text: "Task mechanics pass deterministic verification" },
            { id: "owner", text: "Owner can inspect and accept disclosed gaps" },
          ],
          assumptions: [],
          openQuestions: [],
          nonGoals: ["Do not claim real-model verification"],
        },
        status: "active",
      });
      revision = briefed.task!.brief!.revision;
      expect(briefed.task?.brief).toMatchObject({ status: "active", updatedBy: "owner" });
      await expect(first.updateTaskBrief({
        ...scope,
        expectedRevision: "stale",
        content: briefed.task!.brief!,
      })).rejects.toThrow("changed before");

      const stop = first.subscribe((event) => events.push(event));
      const verifiedRun = await first.sendPrompt({ ...scope, text: TEST_PROMPT.useTool });
      await waitForRun(events, verifiedRun.runId);
      const verified = await first.getSessionSnapshot(scope);
      expect(verified.task?.evidence).toMatchObject({
        runId: verifiedRun.runId,
        briefRevision: revision,
      });
      expect(verified.task?.evidence?.items[0]).toMatchObject({
        providerId: "task-brief",
        freshness: "current",
      });
      expect(verified.task?.verification.records).toContainEqual(expect.objectContaining({
        sourceAdapterId: "pho-code-settled-tools",
        sourceCallId: "call_harness_mark",
        outcome: "passed",
        freshness: "current",
      }));

      const ownerRecorded = await first.recordOwnerVerification({
        ...scope,
        criterionId: "owner",
        outcome: "observed",
        summary: "Owner confirmed the deterministic surface is inspectable.",
      });
      expect(ownerRecorded.task?.verification.records.at(-1)).toMatchObject({
        sourceAdapterId: "owner",
        criterionId: "owner",
        outcome: "observed",
      });

      events.length = 0;
      const completionRun = await first.sendPrompt({ ...scope, text: TEST_PROMPT.useCompleteTask });
      await waitForRun(events, completionRun.runId);
      const incomplete = await first.getSessionSnapshot(scope);
      expect(incomplete.task?.completion).toMatchObject({
        briefRevision: revision,
        status: "incomplete",
        criteria: [
          { criterionId: "mechanics", outcome: "unverified" },
          { criterionId: "owner", outcome: "unverified" },
        ],
      });
      const accepted = await first.acceptTaskCompletionGaps(scope);
      expect(accepted.task?.completion?.status).toBe("accepted_with_gaps");
      expect(accepted.task?.brief?.status).toBe("completed");
      stop();
    } finally {
      await first.dispose();
    }

    const second = await createPhoCodeRuntime({
      agentDir: dirs.agentDir,
      applicationDataDir: dirs.applicationDataDir,
      deterministicTestModel: true,
    });
    try {
      const workspace = await second.inspectWorkspace({ path: dirs.workspaceDir, approveProjectResources: true });
      const reopened = await second.openSession(workspace.workspace.id, sessionId);
      expect(reopened.task?.brief).toMatchObject({ revision, status: "completed" });
      expect(reopened.task?.completion?.status).toBe("accepted_with_gaps");
      const active = await second.reopenTask({ workspaceId: workspace.workspace.id, sessionId });
      expect(active.task?.brief?.status).toBe("active");
      expect(active.task?.brief?.revision).not.toBe(revision);
      expect(active.task?.completion).toBeUndefined();
      const reset = await second.resetTaskBrief({
        workspaceId: workspace.workspace.id,
        sessionId,
        expectedRevision: active.task!.brief!.revision,
      });
      expect(reset.task?.brief).toBeUndefined();
      expect(reset.task?.evidence).toBeUndefined();
    } finally {
      await second.dispose();
    }
  }, 40_000);
});
