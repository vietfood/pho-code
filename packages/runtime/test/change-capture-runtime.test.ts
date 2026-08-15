import { mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { HARNESS_ERROR_CODES, RUNTIME_EVENT_TYPES, type RuntimeEvent } from "@pho-code/protocol";
import { TEST_PROMPT, createPhoCodeRuntime, hashUtf8 } from "../src/index";

async function makeIsolatedDirs() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-change-"));
  const agentDir = path.join(root, "agent");
  const workspaceDir = path.join(root, "workspace");
  await mkdir(agentDir);
  await mkdir(workspaceDir);
  return { agentDir, workspaceDir };
}

async function waitForEvent(
  events: RuntimeEvent[],
  type: RuntimeEvent["type"],
  predicate: (event: RuntimeEvent) => boolean = () => true,
  timeoutMs = 20_000,
): Promise<RuntimeEvent> {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const match = events.find((event) => event.type === type && predicate(event));
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${type}. Saw: ${events.map((event) => event.type).join(", ")}`);
}

describe("Pi write/edit change capture", () => {
  test("captures write, edit, failure, and independent sessions with pre-mutation images", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createPhoCodeRuntime({ agentDir, deterministicTestModel: true });
    const events: RuntimeEvent[] = [];
    runtime.subscribe((event) => {
      events.push(event);
    });

    try {
      const workspace = await runtime.inspectWorkspace({ path: workspaceDir, approveProjectResources: true });
      await writeFile(path.join(workspaceDir, "tracked.txt"), "before\n");
      await mkdir(path.join(workspaceDir, "blocked-dir"));

      const first = await runtime.createSession(workspace.workspace.id);
      const writeAdmission = await runtime.sendPrompt({ sessionId: first.session.id, text: TEST_PROMPT.useWrite });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled, (event) => event.runId === writeAdmission.runId);

      const writeNote = await readFile(path.join(workspaceDir, "agent-note.txt"));
      expect(writeNote.toString("utf8")).toBe("hello from agent\n");
      const writeScope = {
        workspaceId: first.workspace.id,
        sessionId: first.session.id,
        runId: writeAdmission.runId,
      };
      const writeReview = await runtime.getChangeReviewSet(writeScope);
      expect(writeReview.files).toHaveLength(1);
      expect(writeReview.files[0]?.kind).toBe("created");
      expect(writeReview.files[0]?.status).toBe("pending");
      expect(writeReview.files[0]?.afterHash).toBe(hashUtf8("hello from agent\n"));
      expect(writeReview.files[0]?.beforeHash).toBeUndefined();
      expect(writeReview.toolCallIds).toContain("call_write");
      expect(existsSync(path.join(workspaceDir, "change-ledger"))).toBe(false);
      expect(existsSync(path.join(agentDir, "change-ledger", "v1"))).toBe(true);

      const editAdmission = await runtime.sendPrompt({ sessionId: first.session.id, text: TEST_PROMPT.useEdit });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled, (event) => event.runId === editAdmission.runId);
      const edited = await readFile(path.join(workspaceDir, "tracked.txt"));
      expect(edited.toString("utf8")).toBe("after from agent\n");
      const editReview = await runtime.getChangeReviewSet({
        workspaceId: first.workspace.id,
        sessionId: first.session.id,
        runId: editAdmission.runId,
      });
      expect(editReview.files[0]?.kind).toBe("modified");
      expect(editReview.files[0]?.status).toBe("pending");
      expect(editReview.files[0]?.beforeHash).toBe(hashUtf8("before\n"));
      expect(editReview.files[0]?.afterHash).toBe(hashUtf8("after from agent\n"));

      const failAdmission = await runtime.sendPrompt({ sessionId: first.session.id, text: TEST_PROMPT.useWriteFail });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled, (event) => event.runId === failAdmission.runId);
      const failReview = await runtime.getChangeReviewSet({
        workspaceId: first.workspace.id,
        sessionId: first.session.id,
        runId: failAdmission.runId,
      });
      expect(failReview.files).toHaveLength(1);
      expect(["unavailable", "indeterminate"].includes(failReview.files[0]?.status ?? "")).toBe(true);
      expect(failReview.files[0]?.status === "pending" && Boolean(failReview.files[0]?.afterHash)).toBe(false);

      const second = await runtime.createSession(workspace.workspace.id);
      const secondWrite = await runtime.sendPrompt({ sessionId: second.session.id, text: TEST_PROMPT.useWrite });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled, (event) => event.runId === secondWrite.runId);
      const secondReview = await runtime.getChangeReviewSet({
        workspaceId: second.workspace.id,
        sessionId: second.session.id,
        runId: secondWrite.runId,
      });
      expect(secondReview.sessionId).toBe(second.session.id);
      expect(secondReview.runId).not.toBe(writeAdmission.runId);
      const firstSnapshot = await runtime.getSessionSnapshot({
        workspaceId: first.workspace.id,
        sessionId: first.session.id,
      });
      expect(firstSnapshot.changeReviews?.some((review) => review.runId === writeAdmission.runId)).toBe(true);
      expect(firstSnapshot.changeReviews?.some((review) => review.runId === secondWrite.runId)).toBe(false);

      await expect(
        runtime.inspectRemovableSession({ workspaceId: first.workspace.id, sessionId: first.session.id }),
      ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.sessionRemovalRefused });

      const approved = await runtime.approveChanges({
        ...writeScope,
        expectedRevision: writeReview.revision,
        relativePaths: ["agent-note.txt"],
      });
      expect(approved.files[0]?.status).toBe("approved");
      expect((await readFile(path.join(workspaceDir, "agent-note.txt"))).toString("utf8")).toBe("hello from agent\n");
    } finally {
      await runtime.dispose();
    }
  }, 60_000);

  test("undoes a created write through Trash and restores an unchanged edit", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const trashDir = path.join(agentDir, "trash");
    const runtime = await createPhoCodeRuntime({
      agentDir,
      deterministicTestModel: true,
      removalService: {
        async moveToTrash(input) {
          await mkdir(trashDir, { recursive: true });
          await rename(input.canonicalPath, path.join(trashDir, path.basename(input.canonicalPath)));
          return { method: "macos-trash" };
        },
      },
    });
    const events: RuntimeEvent[] = [];
    runtime.subscribe((event) => {
      events.push(event);
    });

    try {
      const workspace = await runtime.inspectWorkspace({ path: workspaceDir, approveProjectResources: true });
      await writeFile(path.join(workspaceDir, "tracked.txt"), "before\n");
      const session = await runtime.createSession(workspace.workspace.id);

      const writeAdmission = await runtime.sendPrompt({ sessionId: session.session.id, text: TEST_PROMPT.useWrite });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled, (event) => event.runId === writeAdmission.runId);
      const writeScope = {
        workspaceId: session.workspace.id,
        sessionId: session.session.id,
        runId: writeAdmission.runId,
      };
      const writeReview = await runtime.getChangeReviewSet(writeScope);
      const writePreview = await runtime.prepareUndoChanges({
        ...writeScope,
        relativePath: "agent-note.txt",
        expectedRevision: writeReview.revision,
      });
      expect(writePreview.action).toBe("move-to-trash");
      expect(writePreview).not.toHaveProperty("beforeBlobId");
      const writeUndone = await runtime.applyUndoChanges({ ...writeScope, previewToken: writePreview.previewToken });
      expect(existsSync(path.join(workspaceDir, "agent-note.txt"))).toBe(false);
      expect(existsSync(path.join(trashDir, "agent-note.txt"))).toBe(true);
      expect(writeUndone.files[0]?.status).toBe("undone");

      const editAdmission = await runtime.sendPrompt({ sessionId: session.session.id, text: TEST_PROMPT.useEdit });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled, (event) => event.runId === editAdmission.runId);
      const editScope = {
        workspaceId: session.workspace.id,
        sessionId: session.session.id,
        runId: editAdmission.runId,
      };
      const editReview = await runtime.getChangeReviewSet(editScope);
      const editPreview = await runtime.prepareUndoChanges({
        ...editScope,
        relativePath: "tracked.txt",
        expectedRevision: editReview.revision,
      });
      expect(editPreview.action).toBe("restore");
      const editUndone = await runtime.applyUndoChanges({ ...editScope, previewToken: editPreview.previewToken });
      expect((await readFile(path.join(workspaceDir, "tracked.txt"))).toString("utf8")).toBe("before\n");
      expect(editUndone.files[0]?.status).toBe("undone");
    } finally {
      await runtime.dispose();
    }
  }, 60_000);
});
