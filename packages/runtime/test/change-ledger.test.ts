import { chmod, lstat, mkdir, mkdtemp, readFile, rename, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { CHANGE_UNREADABLE_RUN_ID, HARNESS_ERROR_CODES, MAX_CHANGE_DIFF_CHARS, MAX_CHANGE_FILE_VIEW_CHARS, MAX_CHANGE_FILES_ON_SUMMARY, MAX_CHANGE_MANIFEST_BYTES, MAX_CHANGE_OPERATIONS_PER_RUN, MAX_CHANGE_PATHS_PER_RUN, MAX_CHANGE_SNAPSHOT_BYTES } from "@pho-code/protocol";
import { hashBytes, hashUtf8 } from "../src/change-hash";
import {
  applyApproveTransition,
  applyCaptureBegin,
  applyCaptureSettle,
  applyCurrentHashConflict,
  isCompletePendingRecord,
} from "../src/change-record";
import { createChangeCaptureService, projectSnapshot, projectSummary } from "../src/change-capture";
import { createChangeReviewRuntime } from "../src/change-review";
import { createAtomicChangeRecoveryService } from "../src/change-recovery";
import type { RecoverableRemovalService } from "../src/recoverable-removal";
import { buildUnifiedDiffPage, pageFileText, parseUnifiedDiff } from "../src/change-diff";
import { classifyBytes, detectLineEnding } from "../src/change-text";
import { createFileChangeLedgerStore, encodedManifestSize, exceedsPersistenceBudget, opaqueScopeId } from "../src/change-ledger-store";
import { createUndoTempName } from "../src/change-identity";
import { decodeWriteEditPath, resolveCapturePath } from "../src/change-path";

const scope = { workspaceId: "/tmp/ws", sessionId: "s1", runId: "r1" };
const FIXTURE_HASH = hashUtf8("fixture");

function createReviewForTest(
  capture: ReturnType<typeof createChangeCaptureService>,
  workspace: string,
  root: string,
  options?: { now?: () => Date; randomId?: () => string },
) {
  const removal = fakeTrashService(root);
  return createChangeReviewRuntime({
    capture,
    resolveWorkspacePath: async () => workspace,
    recovery: createAtomicChangeRecoveryService(removal),
    removal,
    trashContext: { agentDir: path.join(root, "agent") },
    ...(options?.now ? { now: options.now } : {}),
    ...(options?.randomId ? { randomId: options.randomId } : {}),
  });
}

describe("change hashing and text", () => {
  test("hashes exact bytes without normalization", () => {
    expect(hashUtf8("a\n")).not.toBe(hashUtf8("a\r\n"));
    expect(hashBytes(Buffer.from("a\n", "utf8"))).toBe(hashUtf8("a\n"));
  });

  test("classifies NUL and invalid UTF-8 as binary", () => {
    expect(classifyBytes(Buffer.from("ok\n", "utf8")).kind).toBe("text");
    expect(classifyBytes(Buffer.from([0x00, 0x61])).kind).toBe("binary");
    expect(classifyBytes(Buffer.from([0xff, 0xfe, 0x00])).kind).toBe("binary");
    expect(detectLineEnding("a\r\nb\r\n")).toBe("crlf");
    expect(detectLineEnding("a\nb\n")).toBe("lf");
    expect(detectLineEnding("a\r\nb\n")).toBe("mixed");
  });
});

describe("change records", () => {
  test("created files become pending only with an after-hash", () => {
    const capturing = applyCaptureBegin(undefined, {
      relativePath: "note.txt",
      toolCallId: "c1",
      kind: "created",
      now: "t0",
    });
    expect(capturing.status).toBe("capturing");
    const incomplete = applyCaptureSettle(capturing, { toolCallId: "c1", now: "t1", isError: true });
    expect(incomplete.status).toBe("indeterminate");
    expect(isCompletePendingRecord(incomplete)).toBe(false);
    const pending = applyCaptureSettle(capturing, {
      toolCallId: "c1",
      now: "t1",
      afterHash: FIXTURE_HASH,
      isError: false,
    });
    expect(pending.status).toBe("pending");
    expect(isCompletePendingRecord(pending)).toBe(true);
  });

  test("modified files stay indeterminate without both hashes", () => {
    const capturing = applyCaptureBegin(undefined, {
      relativePath: "tracked.txt",
      toolCallId: "c1",
      kind: "modified",
      now: "t0",
    });
    const settled = applyCaptureSettle(capturing, { toolCallId: "c1", now: "t1", afterHash: "after", isError: false });
    expect(settled.status).toBe("indeterminate");
    expect(isCompletePendingRecord(settled)).toBe(false);
  });

  test("approve requires current bytes to match the after-hash", () => {
    const pending = applyCaptureSettle(
      applyCaptureBegin(undefined, {
        relativePath: "tracked.txt",
        toolCallId: "c1",
        kind: "modified",
        now: "t0",
        beforeHash: "before",
      }),
      { toolCallId: "c1", now: "t1", afterHash: "after", isError: false },
    );
    expect(applyApproveTransition(pending, { state: "hashed", hash: "after" }).status).toBe("approved");
    expect(applyApproveTransition(pending, { state: "hashed", hash: "other" }).status).toBe("conflict");
    expect(applyApproveTransition(pending, { state: "absent" }).status).toBe("conflict");
    expect(applyApproveTransition(pending, { state: "limited", limitation: "too-large" }).status).toBe("unavailable");
    expect(applyApproveTransition({ ...pending, status: "conflict" }, { state: "hashed", hash: "owner" }).status).toBe(
      "approved",
    );
    expect(applyCurrentHashConflict(pending, { state: "hashed", hash: "other" }).status).toBe("conflict");
    expect(applyCurrentHashConflict(pending, { state: "hashed", hash: "after" }).status).toBe("pending");
    expect(applyCurrentHashConflict({ ...pending, status: "conflict" }, { state: "hashed", hash: "after" }).status).toBe(
      "pending",
    );
    expect(applyCurrentHashConflict({ ...pending, status: "conflict" }, { state: "hashed", hash: "owner" }).status).toBe(
      "conflict",
    );
    expect(applyCurrentHashConflict(pending, { state: "limited", limitation: "too-large" }).status).toBe("unavailable");
  });
});

describe("change ledger store", () => {
  test("atomically persists manifests and rejects traversal paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-ledger-"));
    const store = createFileChangeLedgerStore(root);
    const saved = {
      schemaVersion: 1 as const,
      ...scope,
      revision: 1,
      updatedAt: "t0",
      blobBytes: 0,
      files: [
        {
          relativePath: "note.txt",
          kind: "created" as const,
          status: "pending" as const,
          firstToolCallId: "c1",
          latestToolCallId: "c1",
          startedAt: "t0",
          updatedAt: "t0",
          afterHash: FIXTURE_HASH,
        },
      ],
      operations: [{ toolCallId: "c1", toolName: "write" as const, relativePath: "note.txt", at: "t0" }],
    };
    await store.save(saved);
    const loaded = await store.load(scope);
    expect(loaded?.files[0]?.relativePath).toBe("note.txt");
    expect(opaqueScopeId(scope)).toHaveLength(64);
    await expect(
      store.save({
        ...saved,
        files: [{ ...saved.files[0]!, relativePath: "../escape.txt" }],
      }),
    ).rejects.toThrow(/invalid change-ledger manifest/u);
  });

  test("refuses to treat a corrupt manifest as missing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-ledger-corrupt-"));
    const store = createFileChangeLedgerStore(root);
    await store.save({
      schemaVersion: 1 as const,
      ...scope,
      revision: 1,
      updatedAt: "t0",
      blobBytes: 0,
      files: [],
      operations: [],
    });
    const manifestFile = path.join(root, "manifests", `${opaqueScopeId(scope)}.json`);
    await writeFile(manifestFile, "{not-json", "utf8");
    await expect(store.load(scope)).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.changeReviewCorrupt,
    });
    const listing = await store.listForSession(scope.workspaceId, scope.sessionId);
    expect(listing.manifests).toEqual([]);
    expect(listing.unreadable).toBe(true);
    expect(listing.unreadableScopes).toEqual([
      { workspaceId: scope.workspaceId, sessionId: scope.sessionId, runId: CHANGE_UNREADABLE_RUN_ID },
    ]);
  });
});

describe("change diff paging", () => {
  test("parses unified hunks and pages file text", () => {
    const page = buildUnifiedDiffPage({
      relativePath: "note.txt",
      beforeText: "before\n",
      afterText: "after from agent\n",
    });
    expect(page.hunks.length).toBeGreaterThan(0);
    expect(page.hunks.some((hunk) => hunk.lines.some((line) => line.kind === "removed" && line.text.includes("before")))).toBe(
      true,
    );
    expect(page.hunks.some((hunk) => hunk.lines.some((line) => line.kind === "added" && line.text.includes("after")))).toBe(
      true,
    );
    const parsed = parseUnifiedDiff("@@ -1 +1 @@\n-before\n+after\n");
    expect(parsed[0]?.lines.map((line) => line.kind)).toEqual(["removed", "added"]);
    const file = pageFileText("note.txt", "a\nb\nc\n", "line:1");
    expect(file.text).toBe("b\nc\n");
    expect(file.language).toBe("text");
  });

  test("splits an oversized first line and first hunk instead of exceeding page caps", () => {
    const hugeLine = "x".repeat(MAX_CHANGE_FILE_VIEW_CHARS + 40);
    const paged = pageFileText("note.txt", hugeLine, undefined);
    expect(paged.text.length).toBe(MAX_CHANGE_FILE_VIEW_CHARS);
    expect(paged.truncated).toBe(true);
    expect(paged.nextCursor).toBe(`line:0:char:${MAX_CHANGE_FILE_VIEW_CHARS}`);
    const rest = pageFileText("note.txt", hugeLine, paged.nextCursor);
    expect(rest.text).toBe("x".repeat(40));
    expect(rest.truncated).toBe(false);

    const before = Array.from({ length: 500 }, (_, index) => `old${index}`).join("\n");
    const after = Array.from({ length: 500 }, (_, index) => `new${index}`).join("\n");
    const diff = buildUnifiedDiffPage({ relativePath: "note.txt", beforeText: before, afterText: after });
    expect(diff.truncated).toBe(true);
    expect(diff.hunks[0]?.lines.length ?? 0).toBeLessThan(500);
    expect(diff.nextCursor).toMatch(/^hunk:\d+/u);
  });
});

describe("change capture without Pi", () => {
  test("captures one path across two writes and refuses Approve after a later edit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-capture-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    const filePath = path.join(workspace, "note.txt");
    const store = createFileChangeLedgerStore(path.join(root, "ledger"));
    const capture = createChangeCaptureService({ store });
    const review = createReviewForTest(capture, workspace, root);
    const identity = { ...scope, workspacePath: workspace, toolName: "write" as const };

    await capture.begin({ ...identity, toolCallId: "c1", args: { path: "note.txt" } });
    await writeFile(filePath, "first\n");
    await capture.settle({ ...identity, toolCallId: "c1", args: { path: "note.txt" }, isError: false });
    await capture.begin({ ...identity, toolCallId: "c2", args: { path: "note.txt" } });
    await writeFile(filePath, "second\n");
    await capture.settle({ ...identity, toolCallId: "c2", args: { path: "note.txt" }, isError: false });

    const snapshot = await review.getReviewSet(scope);
    expect(snapshot.files).toHaveLength(1);
    expect(snapshot.files[0]?.kind).toBe("created");
    expect(snapshot.files[0]?.status).toBe("pending");
    expect(snapshot.files[0]?.afterHash).toBe(hashUtf8("second\n"));
    expect(snapshot.toolCallIds).toEqual(["c1", "c2"]);

    const diff = await review.getDiff({ ...scope, relativePath: "note.txt" });
    expect(diff.hunks.some((hunk) => hunk.lines.some((line) => line.kind === "added"))).toBe(true);

    await writeFile(filePath, "owner edit\n");
    await expect(review.approve({ ...scope, expectedRevision: snapshot.revision, relativePaths: ["note.txt"] })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.changeReviewConflict,
    });
    const conflicted = await review.getReviewSet(scope);
    expect(conflicted.files[0]?.status).toBe("conflict");
  });

  test("resolves write/edit paths under the workspace", async () => {
    expect(decodeWriteEditPath({ path: "src/a.ts" })).toBe("src/a.ts");
    const root = await mkdtemp(path.join(tmpdir(), "pho-path-"));
    const resolved = await resolveCapturePath("note.txt", root);
    expect(resolved.kind).toBe("absent");
    expect(resolved.relativePath).toBe("note.txt");
    expect(MAX_CHANGE_SNAPSHOT_BYTES).toBeGreaterThan(0);
    const bytes = await readFile(new URL("../src/change-hash.ts", import.meta.url));
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  test("settles by the captured relative path when args keep a ./ prefix", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-settle-path-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    const store = createFileChangeLedgerStore(path.join(root, "ledger"));
    const capture = createChangeCaptureService({ store });
    const identity = { ...scope, workspacePath: workspace, toolName: "write" as const };
    await capture.begin({ ...identity, toolCallId: "c1", args: { path: "note.txt" } });
    await writeFile(path.join(workspace, "note.txt"), "hello\n");
    await capture.settle({ ...identity, toolCallId: "c1", args: { path: "./note.txt" }, isError: false });
    const manifest = await capture.loadManifest(scope);
    expect(manifest?.files).toHaveLength(1);
    expect(manifest?.files[0]?.relativePath).toBe("note.txt");
    expect(manifest?.files[0]?.status).toBe("pending");
  });

  test("checks expectedRevision inside the scope lock", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-lock-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    const store = createFileChangeLedgerStore(path.join(root, "ledger"));
    const capture = createChangeCaptureService({ store });
    const review = createReviewForTest(capture, workspace, root);
    const identity = { ...scope, workspacePath: workspace, toolName: "write" as const };
    await capture.begin({ ...identity, toolCallId: "c1", args: { path: "note.txt" } });
    await writeFile(path.join(workspace, "note.txt"), "hello\n");
    await capture.settle({ ...identity, toolCallId: "c1", args: { path: "note.txt" }, isError: false });
    const snapshot = await review.getReviewSet(scope);
    let entered!: () => void;
    const enteredLock = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let hold!: () => void;
    const gate = new Promise<void>((resolve) => {
      hold = resolve;
    });
    const bump = capture.transact(scope, async (manifest) => {
      entered();
      await gate;
      return manifest;
    });
    await enteredLock;
    const approve = review.approve({
      ...scope,
      expectedRevision: snapshot.revision,
      relativePaths: ["note.txt"],
    });
    hold();
    await bump;
    await expect(approve).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.changeReviewRevisionMismatch,
    });
    const stillPending = await review.getReviewSet(scope);
    expect(stillPending.files[0]?.status).toBe("pending");
  });

  test("does not append paths past the per-run cap and keeps review-set snapshots untruncated", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-cap-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    const store = createFileChangeLedgerStore(path.join(root, "ledger"));
    const capture = createChangeCaptureService({ store });
    const identity = { ...scope, workspacePath: workspace, toolName: "write" as const };
    for (let index = 0; index < MAX_CHANGE_PATHS_PER_RUN + 1; index += 1) {
      await capture.begin({ ...identity, toolCallId: `c${index}`, args: { path: `f${index}.txt` } });
    }
    const manifest = await capture.loadManifest(scope);
    expect(manifest?.files).toHaveLength(MAX_CHANGE_PATHS_PER_RUN);
    expect(manifest?.captureCapped).toBe(true);
    expect(projectSummary(manifest!).captureCapped).toBe(true);
    expect(projectSummary(manifest!).files).toHaveLength(MAX_CHANGE_FILES_ON_SUMMARY);
    expect(projectSummary(manifest!).filesTruncated).toBe(true);
    expect(projectSummary(manifest!).fileCount).toBe(MAX_CHANGE_PATHS_PER_RUN);
    expect(projectSnapshot(manifest!).files).toHaveLength(MAX_CHANGE_PATHS_PER_RUN);
    expect(projectSnapshot(manifest!).filesTruncated).toBe(false);
  });

  test("probe of an oversized workspace file is too-large rather than hashed", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-large-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    const store = createFileChangeLedgerStore(path.join(root, "ledger"));
    const capture = createChangeCaptureService({ store });
    await writeFile(path.join(workspace, "big.bin"), Buffer.alloc(MAX_CHANGE_SNAPSHOT_BYTES + 1));
    const probe = await capture.probeWorkspaceFile(workspace, "big.bin");
    expect(probe).toEqual({ state: "limited", limitation: "too-large" });
    expect(await capture.hashWorkspaceFile(workspace, "big.bin")).toBeUndefined();
  });

  test("persists an unavailable record when begin snapshot storage fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-fail-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    await writeFile(path.join(workspace, "note.txt"), "before\n");
    const store = createFileChangeLedgerStore(path.join(root, "ledger"));
    const capture = createChangeCaptureService({
      store: {
        ...store,
        putBlob: async () => {
          throw new Error("blob write failed");
        },
      },
    });
    await capture.begin({
      ...scope,
      workspacePath: workspace,
      toolName: "edit",
      toolCallId: "c1",
      args: { path: "note.txt" },
    });
    const manifest = await capture.loadManifest(scope);
    expect(manifest?.files[0]?.status).toBe("unavailable");
    expect(manifest?.files[0]?.limitation).toBe("capture-failed");
  });

  test("omitted-path Approve all refuses when the ledger has more files than the summary cap", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-approve-cap-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    const store = createFileChangeLedgerStore(path.join(root, "ledger"));
    const capture = createChangeCaptureService({ store });
    const review = createReviewForTest(capture, workspace, root);
    const files = Array.from({ length: MAX_CHANGE_FILES_ON_SUMMARY + 1 }, (_, index) => ({
      relativePath: `f${index}.txt`,
      kind: "created" as const,
      status: "pending" as const,
      firstToolCallId: `c${index}`,
      latestToolCallId: `c${index}`,
      startedAt: "t0",
      updatedAt: "t0",
      afterHash: FIXTURE_HASH,
    }));
    await store.save({
      schemaVersion: 1 as const,
      ...scope,
      revision: 1,
      updatedAt: "t0",
      blobBytes: 0,
      files,
      operations: files.map((file) => ({
        toolCallId: file.firstToolCallId,
        toolName: "write" as const,
        relativePath: file.relativePath,
        at: "t0",
      })),
    });
    await expect(review.approve({ ...scope, expectedRevision: 1 })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.invalidCommand,
    });
  });
});

describe("safe per-file Undo", () => {
  test("restores an unchanged modified file and refuses a stale preview", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-undo-modified-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    const filePath = path.join(workspace, "note.txt");
    await writeFile(filePath, "before\n");
    const removal = fakeTrashService(root);
    const capture = createChangeCaptureService({ store: createFileChangeLedgerStore(path.join(root, "ledger")) });
    const review = createChangeReviewRuntime({
      capture,
      resolveWorkspacePath: async () => workspace,
      recovery: createAtomicChangeRecoveryService(removal),
      removal,
      trashContext: { agentDir: path.join(root, "agent") },
      randomId: () => "undo-modified-token",
    });
    const modifiedScope = { workspaceId: workspace, sessionId: "s1", runId: "undo-modified" };
    const identity = { ...modifiedScope, workspacePath: workspace, toolName: "edit" as const, toolCallId: "edit-1" };
    await capture.begin({ ...identity, args: { path: "note.txt" } });
    await writeFile(filePath, "after\n");
    await capture.settle({ ...identity, args: { path: "note.txt" }, isError: false });

    const pending = await review.getReviewSet(modifiedScope);
    const preview = await review.prepareUndo({ ...modifiedScope, relativePath: "note.txt", expectedRevision: pending.revision });
    expect(preview.action).toBe("restore");
    expect(preview).not.toHaveProperty("beforeBlobId");
    expect(preview).not.toHaveProperty("workspacePath");
    expect(JSON.stringify(preview)).not.toContain(path.join(root, "ledger"));
    const undone = await review.applyUndo({ ...modifiedScope, previewToken: preview.previewToken });
    expect((await readFile(filePath, "utf8"))).toBe("before\n");
    expect(undone.files[0]?.status).toBe("undone");
    await expect(review.applyUndo({ ...modifiedScope, previewToken: preview.previewToken })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.changeUndoTokenInvalid,
    });
  });

  test("moves an unchanged created file to Trash and preserves a conflicting owner edit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-undo-created-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    const removal = fakeTrashService(root);
    const capture = createChangeCaptureService({ store: createFileChangeLedgerStore(path.join(root, "ledger")) });
    let token = 0;
    const review = createChangeReviewRuntime({
      capture,
      resolveWorkspacePath: async () => workspace,
      recovery: createAtomicChangeRecoveryService(removal),
      removal,
      trashContext: { agentDir: path.join(root, "agent") },
      randomId: () => `undo-created-${++token}`,
    });
    const createdScope = { workspaceId: workspace, sessionId: "s1", runId: "undo-created" };
    const identity = { ...createdScope, workspacePath: workspace, toolName: "write" as const, toolCallId: "write-1" };
    const createdPath = path.join(workspace, "created.txt");
    await capture.begin({ ...identity, args: { path: "created.txt" } });
    await writeFile(createdPath, "agent\n");
    await capture.settle({ ...identity, args: { path: "created.txt" }, isError: false });
    const pending = await review.getReviewSet(createdScope);
    const preview = await review.prepareUndo({ ...createdScope, relativePath: "created.txt", expectedRevision: pending.revision });
    expect(preview.action).toBe("move-to-trash");
    const undone = await review.applyUndo({ ...createdScope, previewToken: preview.previewToken });
    expect(existsSync(createdPath)).toBe(false);
    expect(existsSync(path.join(root, "trash", "created.txt"))).toBe(true);
    expect(undone.files[0]?.status).toBe("undone");

    const conflictScope = { workspaceId: workspace, sessionId: "s1", runId: "undo-conflict" };
    const conflictIdentity = { ...conflictScope, workspacePath: workspace, toolName: "write" as const, toolCallId: "write-2" };
    const conflictPath = path.join(workspace, "conflict.txt");
    await capture.begin({ ...conflictIdentity, args: { path: "conflict.txt" } });
    await writeFile(conflictPath, "agent\n");
    await capture.settle({ ...conflictIdentity, args: { path: "conflict.txt" }, isError: false });
    const conflictPending = await review.getReviewSet(conflictScope);
    const conflictPreview = await review.prepareUndo({
      ...conflictScope,
      relativePath: "conflict.txt",
      expectedRevision: conflictPending.revision,
    });
    await writeFile(conflictPath, "owner\n");
    await expect(review.applyUndo({ ...conflictScope, previewToken: conflictPreview.previewToken })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.changeReviewConflict,
    });
    expect((await readFile(conflictPath, "utf8"))).toBe("owner\n");
    expect((await review.getReviewSet(conflictScope)).files[0]?.status).toBe("conflict");
    expect(await capture.hasBlockingReview(workspace, "s1")).toBe(true);
    await writeFile(conflictPath, "agent\n");
    expect((await review.getReviewSet(conflictScope)).files[0]?.status).toBe("pending");
    await writeFile(conflictPath, "owner\n");
    const conflicted = await review.getReviewSet(conflictScope);
    expect(conflicted.files[0]?.status).toBe("conflict");
    const acknowledged = await review.approve({
      ...conflictScope,
      expectedRevision: conflicted.revision,
      relativePaths: ["conflict.txt"],
    });
    expect(acknowledged.files[0]?.status).toBe("approved");
    expect((await readFile(conflictPath, "utf8"))).toBe("owner\n");
    expect(await capture.hasBlockingReview(workspace, "s1")).toBe(false);
  });

  test("refuses Undo when the path is replaced with identical bytes at a new inode", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-undo-inode-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    const filePath = path.join(workspace, "note.txt");
    await writeFile(filePath, "before\n");
    const capture = createChangeCaptureService({ store: createFileChangeLedgerStore(path.join(root, "ledger")) });
    const review = createReviewForTest(capture, workspace, root, { randomId: () => "inode-token" });
    const inodeScope = { workspaceId: workspace, sessionId: "s1", runId: "undo-inode" };
    const identity = { ...inodeScope, workspacePath: workspace, toolName: "edit" as const, toolCallId: "edit-inode" };
    await capture.begin({ ...identity, args: { path: "note.txt" } });
    await writeFile(filePath, "after\n");
    await capture.settle({ ...identity, args: { path: "note.txt" }, isError: false });
    const pending = await review.getReviewSet(inodeScope);
    const preview = await review.prepareUndo({
      ...inodeScope,
      relativePath: "note.txt",
      expectedRevision: pending.revision,
    });
    const before = await stat(filePath);
    await unlink(filePath);
    await writeFile(filePath, "after\n");
    const replaced = await stat(filePath);
    expect(`${replaced.dev}:${replaced.ino}`).not.toBe(`${before.dev}:${before.ino}`);
    await expect(review.applyUndo({ ...inodeScope, previewToken: preview.previewToken })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.changeReviewConflict,
    });
    expect((await readFile(filePath, "utf8"))).toBe("after\n");
  });

  test("trashes a journaled Undo temp on the next review open", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-undo-journal-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    const capture = createChangeCaptureService({ store: createFileChangeLedgerStore(path.join(root, "ledger")) });
    const review = createReviewForTest(capture, workspace, root);
    const journalScope = { workspaceId: workspace, sessionId: "s1", runId: "undo-journal" };
    const identity = { ...journalScope, workspacePath: workspace, toolName: "write" as const, toolCallId: "write-journal" };
    await capture.begin({ ...identity, args: { path: "created.txt" } });
    await writeFile(path.join(workspace, "created.txt"), "agent\n");
    await capture.settle({ ...identity, args: { path: "created.txt" }, isError: false });
    await review.getReviewSet(journalScope);
    const undoTempName = createUndoTempName();
    const tempPath = path.join(workspace, undoTempName);
    await writeFile(tempPath, "orphan-temp\n");
    const manifest = await capture.loadManifest(journalScope);
    expect(manifest).toBeDefined();
    if (manifest) {
      manifest.files[0]!.undoTempName = undoTempName;
      await capture.saveManifest(manifest);
    }
    expect(existsSync(tempPath)).toBe(true);
    const snapshot = await review.getReviewSet(journalScope);
    expect(snapshot.files[0]?.status).toBe("pending");
    expect(existsSync(tempPath)).toBe(false);
    expect(existsSync(path.join(root, "trash", undoTempName))).toBe(true);
    expect((await capture.loadManifest(journalScope))?.files[0]?.undoTempName).toBeUndefined();
    expect((await readFile(path.join(workspace, "created.txt"), "utf8"))).toBe("agent\n");
  });

  test("redacts filesystem errors and trashes a leftover Undo temp after a failed restore", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-undo-redact-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    const filePath = path.join(workspace, "note.txt");
    await writeFile(filePath, "before\n");
    const removal = fakeTrashService(root);
    const capture = createChangeCaptureService({ store: createFileChangeLedgerStore(path.join(root, "ledger")) });
    const review = createChangeReviewRuntime({
      capture,
      resolveWorkspacePath: async () => workspace,
      recovery: {
        async restoreExact(input) {
          await writeFile(input.temporaryPath, "partial-undo\n");
          throw Object.assign(new Error("ENOENT: no such file or directory, rename '/secret/note.txt'"), {
            code: "ENOENT",
            path: "/secret/note.txt",
            recoverable: true,
          });
        },
      },
      removal,
      trashContext: { agentDir: path.join(root, "agent") },
      randomId: () => "redact-token",
    });
    const redactScope = { workspaceId: workspace, sessionId: "s1", runId: "undo-redact" };
    const identity = { ...redactScope, workspacePath: workspace, toolName: "edit" as const, toolCallId: "edit-redact" };
    await capture.begin({ ...identity, args: { path: "note.txt" } });
    await writeFile(filePath, "after\n");
    await capture.settle({ ...identity, args: { path: "note.txt" }, isError: false });
    const pending = await review.getReviewSet(redactScope);
    const preview = await review.prepareUndo({
      ...redactScope,
      relativePath: "note.txt",
      expectedRevision: pending.revision,
    });
    let thrown: unknown;
    try {
      await review.applyUndo({ ...redactScope, previewToken: preview.previewToken });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      code: HARNESS_ERROR_CODES.changeUndoFailed,
      message: "Undo failed.",
    });
    const serialized = JSON.stringify(thrown);
    expect(serialized).not.toContain("/secret/note.txt");
    expect(serialized).not.toContain("ENOENT");
    expect((await readFile(filePath, "utf8"))).toBe("after\n");
    expect((await capture.loadManifest(redactScope))?.files[0]?.undoTempName).toBeUndefined();
    expect((await capture.loadManifest(redactScope))?.files[0]?.status).toBe("pending");
    expect(readdirSync(workspace).filter((name) => name.startsWith(".pho-code-undo-"))).toEqual([]);
    expect(readdirSync(path.join(root, "trash")).filter((name) => name.startsWith(".pho-code-undo-"))).toHaveLength(1);
  });

  test("refuses an expired preview and a token whose kind or workspace identity changed", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-undo-token-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    await writeFile(path.join(workspace, "note.txt"), "before\n");
    const capture = createChangeCaptureService({ store: createFileChangeLedgerStore(path.join(root, "ledger")) });
    let nowMs = Date.parse("2026-08-15T00:00:00.000Z");
    const expiredReview = createReviewForTest(capture, workspace, root, {
      now: () => new Date(nowMs),
      randomId: () => "expired-token",
    });
    const expiredScope = { workspaceId: workspace, sessionId: "s1", runId: "undo-expired" };
    const identity = { ...expiredScope, workspacePath: workspace, toolName: "edit" as const, toolCallId: "edit-exp" };
    await capture.begin({ ...identity, args: { path: "note.txt" } });
    await writeFile(path.join(workspace, "note.txt"), "after\n");
    await capture.settle({ ...identity, args: { path: "note.txt" }, isError: false });
    const pending = await expiredReview.getReviewSet(expiredScope);
    const preview = await expiredReview.prepareUndo({
      ...expiredScope,
      relativePath: "note.txt",
      expectedRevision: pending.revision,
    });
    nowMs += 6 * 60 * 1000;
    await expect(expiredReview.applyUndo({ ...expiredScope, previewToken: preview.previewToken })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.changeUndoTokenInvalid,
    });
    expect((await readFile(path.join(workspace, "note.txt"), "utf8"))).toBe("after\n");

    const kindPath = path.join(workspace, "kind.txt");
    await writeFile(kindPath, "before\n");
    const kindReview = createReviewForTest(capture, workspace, root, { randomId: () => "kind-token" });
    const kindScope = { workspaceId: workspace, sessionId: "s1", runId: "undo-kind" };
    const kindIdentity = { ...kindScope, workspacePath: workspace, toolName: "edit" as const, toolCallId: "edit-kind" };
    await capture.begin({ ...kindIdentity, args: { path: "kind.txt" } });
    await writeFile(kindPath, "after\n");
    await capture.settle({ ...kindIdentity, args: { path: "kind.txt" }, isError: false });
    const kindPending = await kindReview.getReviewSet(kindScope);
    const kindPreview = await kindReview.prepareUndo({
      ...kindScope,
      relativePath: "kind.txt",
      expectedRevision: kindPending.revision,
    });
    const kindManifest = await capture.loadManifest(kindScope);
    const kindRecord = kindManifest?.files.find((file) => file.relativePath === "kind.txt");
    if (kindRecord && kindManifest) {
      kindRecord.kind = "created";
      await capture.saveManifest(kindManifest);
    }
    await expect(kindReview.applyUndo({ ...kindScope, previewToken: kindPreview.previewToken })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.changeUndoUnavailable,
    });
    expect((await readFile(kindPath, "utf8"))).toBe("after\n");

    let resolvedWorkspace = workspace;
    const removal = fakeTrashService(root);
    const identityReview = createChangeReviewRuntime({
      capture,
      resolveWorkspacePath: async () => resolvedWorkspace,
      recovery: createAtomicChangeRecoveryService(removal),
      removal,
      trashContext: { agentDir: path.join(root, "agent") },
      randomId: () => "workspace-token",
    });
    const identityScope = { workspaceId: workspace, sessionId: "s1", runId: "undo-workspace" };
    const identityRecord = {
      ...identityScope,
      workspacePath: workspace,
      toolName: "write" as const,
      toolCallId: "write-ws",
    };
    await capture.begin({ ...identityRecord, args: { path: "created-ws.txt" } });
    await writeFile(path.join(workspace, "created-ws.txt"), "agent\n");
    await capture.settle({ ...identityRecord, args: { path: "created-ws.txt" }, isError: false });
    const identityPending = await identityReview.getReviewSet(identityScope);
    const identityPreview = await identityReview.prepareUndo({
      ...identityScope,
      relativePath: "created-ws.txt",
      expectedRevision: identityPending.revision,
    });
    resolvedWorkspace = path.join(root, "other-ws");
    await mkdir(resolvedWorkspace);
    await expect(
      identityReview.applyUndo({ ...identityScope, previewToken: identityPreview.previewToken }),
    ).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.changeReviewConflict,
    });
    expect((await readFile(path.join(workspace, "created-ws.txt"), "utf8"))).toBe("agent\n");
  });

  test("reconciles leftover undoing without reporting a partial restore as undone", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-undo-interrupt-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    const filePath = path.join(workspace, "note.txt");
    await writeFile(filePath, "before\n");
    const capture = createChangeCaptureService({ store: createFileChangeLedgerStore(path.join(root, "ledger")) });
    const review = createReviewForTest(capture, workspace, root);
    const interruptedScope = { workspaceId: workspace, sessionId: "s1", runId: "undo-interrupt" };
    const identity = { ...interruptedScope, workspacePath: workspace, toolName: "edit" as const, toolCallId: "edit-int" };
    await capture.begin({ ...identity, args: { path: "note.txt" } });
    await writeFile(filePath, "after\n");
    await capture.settle({ ...identity, args: { path: "note.txt" }, isError: false });
    const pending = await review.getReviewSet(interruptedScope);
    await capture.transact(
      interruptedScope,
      async (manifest) => {
        const record = manifest.files.find((file) => file.relativePath === "note.txt");
        if (record) {
          record.status = "undoing";
        }
        return manifest;
      },
      { expectedRevision: pending.revision, createIfMissing: false, operation: "testUndoing" },
    );
    const stillAfter = await review.getReviewSet(interruptedScope);
    expect(stillAfter.files[0]?.status).toBe("pending");
    expect((await readFile(filePath, "utf8"))).toBe("after\n");

    await capture.transact(
      interruptedScope,
      async (manifest) => {
        const record = manifest.files.find((file) => file.relativePath === "note.txt");
        if (record) {
          record.status = "undoing";
        }
        return manifest;
      },
      { expectedRevision: stillAfter.revision, createIfMissing: false, operation: "testUndoingRestored" },
    );
    await writeFile(filePath, "before\n");
    const restored = await review.getReviewSet(interruptedScope);
    expect(restored.files[0]?.status).toBe("undone");
  });

  test("holds the scope lock so a concurrent review reload cannot bump revision mid-Undo", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-undo-lock-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    let enteredTrash!: () => void;
    const entered = new Promise<void>((resolve) => {
      enteredTrash = resolve;
    });
    let releaseTrash!: () => void;
    const trashGate = new Promise<void>((resolve) => {
      releaseTrash = resolve;
    });
    const capture = createChangeCaptureService({ store: createFileChangeLedgerStore(path.join(root, "ledger")) });
    const removal: RecoverableRemovalService = {
      async moveToTrash(input) {
        enteredTrash();
        await trashGate;
        const trash = path.join(root, "trash");
        await mkdir(trash, { recursive: true });
        await rename(input.canonicalPath, path.join(trash, path.basename(input.canonicalPath)));
        return { method: "macos-trash" };
      },
    };
    const review = createChangeReviewRuntime({
      capture,
      resolveWorkspacePath: async () => workspace,
      recovery: createAtomicChangeRecoveryService(removal),
      removal,
      trashContext: { agentDir: path.join(root, "agent") },
      randomId: () => "undo-lock-token",
    });
    const createdScope = { workspaceId: workspace, sessionId: "s1", runId: "undo-lock" };
    const identity = { ...createdScope, workspacePath: workspace, toolName: "write" as const, toolCallId: "write-lock" };
    await capture.begin({ ...identity, args: { path: "created.txt" } });
    await writeFile(path.join(workspace, "created.txt"), "agent\n");
    await capture.settle({ ...identity, args: { path: "created.txt" }, isError: false });
    const pending = await review.getReviewSet(createdScope);
    const preview = await review.prepareUndo({
      ...createdScope,
      relativePath: "created.txt",
      expectedRevision: pending.revision,
    });
    const applyPromise = review.applyUndo({ ...createdScope, previewToken: preview.previewToken });
    await entered;
    const reloadPromise = review.getReviewSet(createdScope);
    releaseTrash();
    const [undone, reloaded] = await Promise.all([applyPromise, reloadPromise]);
    expect(undone.files[0]?.status).toBe("undone");
    expect(reloaded.files[0]?.status).toBe("undone");
    expect(existsSync(path.join(workspace, "created.txt"))).toBe(false);
  });
});

describe("milestone 3 capture, ledger, and recovery hardening", () => {
  test("persists redacted outside-workspace, traversal, and malformed identities", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-outside-"));
    const workspace = path.join(root, "ws");
    const outside = path.join(root, "secret.txt");
    await mkdir(workspace);
    await writeFile(outside, "secret\n");
    const capture = createChangeCaptureService({ store: createFileChangeLedgerStore(path.join(root, "ledger")) });
    const identity = { ...scope, workspacePath: workspace, toolName: "write" as const };
    await capture.begin({ ...identity, toolCallId: "abs", args: { path: outside } });
    await capture.begin({ ...identity, toolCallId: "trav", args: { path: "../secret.txt" } });
    await capture.begin({ ...identity, toolCallId: "bad", args: { path: "" } });
    const parentLink = path.join(workspace, "escape");
    await symlink(root, parentLink);
    await capture.begin({ ...identity, toolCallId: "link", args: { path: "escape/secret.txt" } });
    const manifest = await capture.loadManifest(scope);
    expect(manifest?.files.length).toBeGreaterThanOrEqual(3);
    for (const file of manifest?.files ?? []) {
      expect(file.relativePath.startsWith(".pho-code-untracked/")).toBe(true);
      expect(file.relativePath.includes("..")).toBe(false);
      expect(file.relativePath.startsWith("/")).toBe(false);
      expect(JSON.stringify(file)).not.toContain(outside);
      expect(file.status).toBe("unavailable");
    }
    expect(manifest?.files.some((file) => file.limitation === "outside-workspace")).toBe(true);
  });

  test("rejects oversized, contradictory, and duplicate manifests on save", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-corrupt-schema-"));
    const store = createFileChangeLedgerStore(root);
    await store.save({
      schemaVersion: 1 as const,
      ...scope,
      revision: 1,
      updatedAt: "t0",
      blobBytes: 0,
      files: [],
      operations: [],
    });
    await expect(
      store.save({
        schemaVersion: 1 as const,
        ...scope,
        revision: 1,
        updatedAt: "t0",
        blobBytes: 0,
        files: [
          {
            relativePath: "note.txt",
            kind: "created" as const,
            status: "pending" as const,
            firstToolCallId: "c1",
            latestToolCallId: "c1",
            startedAt: "t0",
            updatedAt: "t0",
            afterHash: "abc",
          },
        ],
        operations: [{ toolCallId: "c1", toolName: "write" as const, relativePath: "note.txt", at: "t0" }],
      }),
    ).rejects.toThrow(/invalid change-ledger manifest/u);
    const other = { workspaceId: "/tmp/ws", sessionId: "s1", runId: "r-other" };
    await store.save({
      schemaVersion: 1 as const,
      ...other,
      revision: 1,
      updatedAt: "t1",
      blobBytes: 0,
      files: [],
      operations: [],
    });
    const listed = await store.listForSession(scope.workspaceId, scope.sessionId);
    expect(listed.unreadable).toBe(false);
    expect(listed.manifests.some((manifest) => manifest.runId === "r-other")).toBe(true);
  });

  test("refuses to display or restore tampered blob bytes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-blob-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    await writeFile(path.join(workspace, "note.txt"), "before\n");
    const store = createFileChangeLedgerStore(path.join(root, "ledger"));
    const capture = createChangeCaptureService({ store });
    const review = createReviewForTest(capture, workspace, root);
    const blobScope = { workspaceId: workspace, sessionId: "s1", runId: "blob" };
    const identity = { ...blobScope, workspacePath: workspace, toolName: "edit" as const, toolCallId: "edit-blob" };
    await capture.begin({ ...identity, args: { path: "note.txt" } });
    await writeFile(path.join(workspace, "note.txt"), "after\n");
    await capture.settle({ ...identity, args: { path: "note.txt" }, isError: false });
    const manifest = await capture.loadManifest(blobScope);
    const blobId = manifest?.files[0]?.afterBlobId;
    expect(blobId).toHaveLength(64);
    await writeFile(path.join(root, "ledger", "blobs", blobId!), "tampered\n");
    const diff = await review.getDiff({ ...blobScope, relativePath: "note.txt" });
    expect(diff.limitation).toBe("capture-failed");
    expect(diff.hunks).toEqual([]);
    expect(await store.getBlob(blobId!)).toBeUndefined();
  });

  test("pages a long changed line without dropping the remainder", async () => {
    const huge = "x".repeat(MAX_CHANGE_DIFF_CHARS + 80);
    const beforeText = `${huge}\n`;
    const afterText = `y${huge}\n`;
    let cursor: string | undefined;
    let added = "";
    let removed = "";
    let pages = 0;
    for (;;) {
      const page = buildUnifiedDiffPage({
        relativePath: "min.js",
        beforeText,
        afterText,
        ...(cursor ? { cursor } : {}),
      });
      expect(page.limitation).toBeUndefined();
      for (const hunk of page.hunks) {
        for (const line of hunk.lines) {
          if (line.kind === "added") {
            added += line.text;
          } else if (line.kind === "removed") {
            removed += line.text;
          }
        }
      }
      pages += 1;
      if (!page.truncated || !page.nextCursor || pages > 20) {
        break;
      }
      cursor = page.nextCursor;
    }
    expect(pages).toBeGreaterThan(1);
    expect(removed).toBe(huge);
    expect(added).toBe(`y${huge}`);
  });

  test("rejects malformed cursors and too-complex diff input before paging", async () => {
    expect(() => pageFileText("note.txt", "a\n", "nope")).toThrow(
      expect.objectContaining({ code: HARNESS_ERROR_CODES.invalidCommand }),
    );
    expect(() => buildUnifiedDiffPage({ relativePath: "note.txt", beforeText: "a\n", afterText: "b\n", cursor: "hunk:9" })).toThrow(
      expect.objectContaining({ code: HARNESS_ERROR_CODES.invalidCommand }),
    );
    const many = Array.from({ length: 8_001 }, (_, index) => `line-${index}`).join("\n");
    const complex = buildUnifiedDiffPage({ relativePath: "note.txt", beforeText: many, afterText: `${many}\nchanged` });
    expect(complex.limitation).toBe("too-complex");
    expect(complex.hunks).toEqual([]);
  });

  test("preserves POSIX permission bits on restore and refuses symlink replacement", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-mode-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    const filePath = path.join(workspace, "note.txt");
    await writeFile(filePath, "before\n");
    await chmod(filePath, 0o640);
    const capture = createChangeCaptureService({ store: createFileChangeLedgerStore(path.join(root, "ledger")) });
    const review = createReviewForTest(capture, workspace, root, { randomId: () => "mode-token" });
    const modeScope = { workspaceId: workspace, sessionId: "s1", runId: "undo-mode" };
    const identity = { ...modeScope, workspacePath: workspace, toolName: "edit" as const, toolCallId: "edit-mode" };
    await capture.begin({ ...identity, args: { path: "note.txt" } });
    await writeFile(filePath, "after\n");
    await capture.settle({ ...identity, args: { path: "note.txt" }, isError: false });
    const pending = await review.getReviewSet(modeScope);
    const preview = await review.prepareUndo({ ...modeScope, relativePath: "note.txt", expectedRevision: pending.revision });
    const undone = await review.applyUndo({ ...modeScope, previewToken: preview.previewToken });
    expect(undone.files[0]?.status).toBe("undone");
    expect(await readFile(filePath, "utf8")).toBe("before\n");
    expect((await stat(filePath)).mode & 0o777).toBe(0o640);

    const linkPath = path.join(workspace, "link.txt");
    await writeFile(linkPath, "before\n");
    const linkReview = createReviewForTest(capture, workspace, root, { randomId: () => "link-token" });
    const linkScope = { workspaceId: workspace, sessionId: "s1", runId: "undo-link" };
    const linkIdentity = { ...linkScope, workspacePath: workspace, toolName: "edit" as const, toolCallId: "edit-link" };
    await capture.begin({ ...linkIdentity, args: { path: "link.txt" } });
    await writeFile(linkPath, "after\n");
    await capture.settle({ ...linkIdentity, args: { path: "link.txt" }, isError: false });
    const linkPending = await linkReview.getReviewSet(linkScope);
    const linkPreview = await linkReview.prepareUndo({
      ...linkScope,
      relativePath: "link.txt",
      expectedRevision: linkPending.revision,
    });
    await unlink(linkPath);
    await symlink(path.join(workspace, "note.txt"), linkPath);
    await expect(linkReview.applyUndo({ ...linkScope, previewToken: linkPreview.previewToken })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.changeReviewConflict,
    });
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
  });

  test("treats an unreadable session ledger as blocking instead of missing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-unreadable-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    const store = createFileChangeLedgerStore(path.join(root, "ledger"));
    const capture = createChangeCaptureService({ store });
    const review = createReviewForTest(capture, workspace, root);
    const identity = { workspaceId: workspace, sessionId: "s1", runId: "r-block", workspacePath: workspace, toolName: "write" as const, toolCallId: "c1" };
    await capture.begin({ ...identity, args: { path: "note.txt" } });
    await capture.settle({ ...identity, args: { path: "note.txt" }, isError: false });
    expect(await capture.hasBlockingReview(workspace, "s1")).toBe(true);
    const manifestFile = path.join(root, "ledger", "manifests", `${opaqueScopeId({ workspaceId: workspace, sessionId: "s1", runId: "r-block" })}.json`);
    await writeFile(manifestFile, "{not-json", "utf8");
    expect(await capture.hasUnreadableReview(workspace, "s1")).toBe(true);
    expect(await capture.hasBlockingReview(workspace, "s1")).toBe(true);
    const reviews = await capture.listSessionReviews(workspace, "s1");
    expect(reviews.some((review) => review.ledgerUnreadable && review.runId === CHANGE_UNREADABLE_RUN_ID)).toBe(true);
    const opened = await review.getReviewSet({
      workspaceId: workspace,
      sessionId: "s1",
      runId: CHANGE_UNREADABLE_RUN_ID,
    });
    expect(opened.ledgerUnreadable).toBe(true);
    expect(opened.files).toEqual([]);
    const other = await store.listForSession(workspace, "s2");
    expect(other.unreadable).toBe(true);
  });

  test("attributes a parseable but invalid manifest to its session without hiding it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-attributed-corrupt-"));
    const store = createFileChangeLedgerStore(root);
    await mkdir(path.join(root, "manifests"), { recursive: true });
    await writeFile(
      path.join(root, "manifests", "broken.json"),
      JSON.stringify({
        schemaVersion: 2,
        workspaceId: "/tmp/ws",
        sessionId: "s-other",
        runId: "r-other",
      }),
    );
    const attributed = await store.listForSession("/tmp/ws", "s-other");
    expect(attributed.unreadable).toBe(true);
    expect(attributed.unreadableScopes).toEqual([
      { workspaceId: "/tmp/ws", sessionId: "s-other", runId: CHANGE_UNREADABLE_RUN_ID },
    ]);
    const capture = createChangeCaptureService({ store });
    const review = createReviewForTest(capture, "/tmp/ws", root);
    const opened = await review.getReviewSet({
      workspaceId: "/tmp/ws",
      sessionId: "s-other",
      runId: CHANGE_UNREADABLE_RUN_ID,
    });
    expect(opened.ledgerUnreadable).toBe(true);
    const unrelated = await store.listForSession("/tmp/ws", "s1");
    expect(unrelated.unreadable).toBe(false);
    expect(unrelated.manifests).toEqual([]);
  });

  test("sets captureCapped instead of persisting past the operation budget", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pho-op-cap-"));
    const workspace = path.join(root, "ws");
    await mkdir(workspace);
    const store = createFileChangeLedgerStore(path.join(root, "ledger"));
    const fatOps = Array.from({ length: MAX_CHANGE_OPERATIONS_PER_RUN }, (_, index) => ({
      toolCallId: `op-${index}`,
      toolName: "write" as const,
      relativePath: "note.txt",
      at: "t0",
    }));
    expect(
      exceedsPersistenceBudget({
        schemaVersion: 1 as const,
        workspaceId: workspace,
        sessionId: "s1",
        runId: "r-ops",
        revision: 1,
        updatedAt: "t0",
        blobBytes: 0,
        files: [
          {
            relativePath: "note.txt",
            kind: "created",
            status: "unavailable",
            limitation: "capture-failed",
            firstToolCallId: "op-0",
            latestToolCallId: "op-0",
            startedAt: "t0",
            updatedAt: "t0",
          },
        ],
        operations: [...fatOps, { toolCallId: "op-extra", toolName: "write", relativePath: "note.txt", at: "t0" }],
      }),
    ).toBe(true);
    await store.save({
      schemaVersion: 1 as const,
      workspaceId: workspace,
      sessionId: "s1",
      runId: "r-ops",
      revision: 1,
      updatedAt: "t0",
      blobBytes: 0,
      files: [
        {
          relativePath: "note.txt",
          kind: "created",
          status: "unavailable",
          limitation: "capture-failed",
          firstToolCallId: "op-0",
          latestToolCallId: "op-0",
          startedAt: "t0",
          updatedAt: "t0",
        },
      ],
      operations: fatOps,
    });
    const capture = createChangeCaptureService({ store });
    await capture.begin({
      workspaceId: workspace,
      sessionId: "s1",
      runId: "r-ops",
      workspacePath: workspace,
      toolName: "write",
      toolCallId: "op-overflow",
      args: { path: "extra.txt" },
    });
    const manifest = await capture.loadManifest({ workspaceId: workspace, sessionId: "s1", runId: "r-ops" });
    expect(manifest?.captureCapped).toBe(true);
    expect(manifest?.operations).toHaveLength(MAX_CHANGE_OPERATIONS_PER_RUN);
    expect(manifest?.files).toHaveLength(1);
    expect(encodedManifestSize(manifest!)).toBeLessThanOrEqual(MAX_CHANGE_MANIFEST_BYTES);
  });
});

function fakeTrashService(root: string): RecoverableRemovalService {
  return {
    async moveToTrash(input) {
      const trash = path.join(root, "trash");
      await mkdir(trash, { recursive: true });
      await rename(input.canonicalPath, path.join(trash, path.basename(input.canonicalPath)));
      return { method: "macos-trash" };
    },
  };
}
