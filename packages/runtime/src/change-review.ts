import {
  randomUUID,
} from "node:crypto";
import { lstat } from "node:fs/promises";
import path from "node:path";
import {
  CHANGE_UNREADABLE_RUN_ID,
  createHarnessError,
  failCommand,
  HARNESS_ERROR_CODES,
  MAX_CHANGE_FILES_ON_SUMMARY,
  isChangeFileVersion,
  isHarnessError,
  parseChangeDiffCursor,
  parseChangeFileViewCursor,
  requireChangeRelativePath,
  type ApproveChangesInput,
  type ApplyUndoChangesInput,
  type ChangeDiffPage,
  type ChangeFileViewPage,
  type ChangeKind,
  type ChangeReviewSetSnapshot,
  type ChangeScope,
  type GetChangeDiffInput,
  type GetChangeFileViewInput,
  type HarnessError,
  type PrepareUndoChangesInput,
  type UndoAction,
  type UndoPreview,
} from "@pho-code/protocol";
import { applyApproveTransition, applyCurrentHashConflict } from "./change-record";
import { buildUnifiedDiffPage, pageFileText } from "./change-diff";
import { type ChangeCaptureService } from "./change-capture";
import { classifyBytes } from "./change-text";
import { hashBytes } from "./change-hash";
import { resolveCapturePath } from "./change-path";
import {
  assertPathHoldsIdentity,
  createUndoTempName,
  inspectDirectoryIdentity,
  inspectRegularFile,
  isUndoTempName,
  sameFilesystemIdentity,
  type FilesystemIdentity,
} from "./change-identity";
import { validateTrashTarget, TrashTargetError, type TrashTargetContext } from "./trash-target";
import type { RecoverableRemovalService } from "./recoverable-removal";
import {
  ChangeRecoveryConflictError,
  type ChangeRecoveryService,
} from "./change-recovery";

const UNDO_PREVIEW_TTL_MS = 5 * 60 * 1000;
const KNOWN_HARNESS_ERROR_CODES = new Set<string>(Object.values(HARNESS_ERROR_CODES));

interface StoredUndoPreview {
  scope: ChangeScope;
  relativePath: string;
  kind: ChangeKind;
  action: UndoAction;
  expectedRevision: number;
  expectedCurrentHash: string;
  workspacePath: string;
  workspaceIdentity: FilesystemIdentity;
  fileIdentity: FilesystemIdentity;
  undoTempName?: string;
  beforeBlobId?: string;
  beforeHash?: string;
  expiresAtMs: number;
}

export interface ChangeReviewRuntime {
  getReviewSet(scope: ChangeScope): Promise<ChangeReviewSetSnapshot>;
  getFileView(input: GetChangeFileViewInput): Promise<ChangeFileViewPage>;
  getDiff(input: GetChangeDiffInput): Promise<ChangeDiffPage>;
  approve(input: ApproveChangesInput): Promise<ChangeReviewSetSnapshot>;
  prepareUndo(input: PrepareUndoChangesInput): Promise<UndoPreview>;
  applyUndo(input: ApplyUndoChangesInput): Promise<ChangeReviewSetSnapshot>;
}

export function createChangeReviewRuntime(input: {
  capture: ChangeCaptureService;
  resolveWorkspacePath: (workspaceId: string) => Promise<string>;
  recovery: ChangeRecoveryService;
  removal: RecoverableRemovalService;
  trashContext: Omit<TrashTargetContext, "workspacePath">;
  now?: () => Date;
  randomId?: () => string;
}): ChangeReviewRuntime {
  const previews = new Map<string, StoredUndoPreview>();
  const now = () => (input.now ?? (() => new Date()))();

  async function requireRecord(scope: ChangeScope, relativePath: string, operation: string) {
    const manifest = await input.capture.loadManifest(scope);
    if (!manifest) {
      failCommand(operation, "No tracked write/edit review exists for that run.", HARNESS_ERROR_CODES.changeReviewNotFound);
    }
    const record = manifest.files.find((file) => file.relativePath === relativePath);
    if (!record) {
      failCommand(operation, "That path is not in the selected review set.", HARNESS_ERROR_CODES.changeReviewNotFound);
    }
    return { manifest, record };
  }

  type ManifestRecord = Awaited<ReturnType<typeof requireRecord>>["record"];

  function markProbeMismatch(
    record: ManifestRecord,
    probe: Awaited<ReturnType<ChangeCaptureService["probeWorkspaceFile"]>>,
  ): void {
    record.status = probe.state === "limited" ? "unavailable" : "conflict";
    if (probe.state === "limited") {
      record.limitation = probe.limitation;
    }
    record.updatedAt = now().toISOString();
  }

  async function reconcileUndoingRecord(
    record: ManifestRecord,
    workspacePath: string,
  ): Promise<ReturnType<typeof reconcileUndoingStatus>> {
    if (record.undoTempName) {
      const removed = await trashJournaledUndoTemp(
        input.removal,
        { ...input.trashContext, workspacePath },
        record.relativePath,
        record.undoTempName,
      );
      if (removed) {
        delete record.undoTempName;
      }
    }
    const probe = await input.capture.probeWorkspaceFile(workspacePath, record.relativePath);
    const status = reconcileUndoingStatus(record, probe);
    record.status = status;
    record.updatedAt = now().toISOString();
    return status;
  }

  async function reconcileFailedUndo(
    scope: ChangeScope,
    preview: StoredUndoPreview,
    workspacePath: string,
    expectedRevision: number,
  ): Promise<void> {
    try {
      await input.capture.transact(
        scope,
        async (manifest) => {
          const record = manifest.files.find((file) => file.relativePath === preview.relativePath);
          if (!record || record.status !== "undoing") {
            return null;
          }
          await reconcileUndoingRecord(record, workspacePath);
          return manifest;
        },
        { expectedRevision, createIfMissing: false, operation: "applyUndoChanges" },
      );
    } catch {
      // The persisted undoing state is reconciled the next time the review set opens.
    }
  }

  async function refreshCurrentHash(scope: ChangeScope, relativePath: string, operation: string): Promise<void> {
    const workspacePath = await input.resolveWorkspacePath(scope.workspaceId);
    await input.capture.transact(
      scope,
      async (manifest) => {
        const record = manifest.files.find((file) => file.relativePath === relativePath);
        if (!record) {
          return null;
        }
        const probe = await input.capture.probeWorkspaceFile(workspacePath, relativePath);
        const next = applyCurrentHashConflict(record, probe);
        if (next.status === record.status && next.limitation === record.limitation) {
          return null;
        }
        Object.assign(record, next);
        return manifest;
      },
      { createIfMissing: false, operation },
    );
  }

  async function findUnreadableReview(scope: ChangeScope): Promise<ChangeReviewSetSnapshot | undefined> {
    const listed = await input.capture.listSessionReviews(scope.workspaceId, scope.sessionId);
    return listed.find((review) => review.runId === scope.runId && review.ledgerUnreadable === true);
  }

  return {
    async getReviewSet(scope) {
      if (scope.runId === CHANGE_UNREADABLE_RUN_ID) {
        const unreadable = await findUnreadableReview(scope);
        if (unreadable) {
          return unreadable;
        }
      }
      try {
        await input.capture.reconcileInterrupted(scope);
      } catch (error) {
        if (!isHarnessError(error) || error.code !== HARNESS_ERROR_CODES.changeReviewCorrupt) {
          throw error;
        }
        const unreadable = await findUnreadableReview(scope);
        if (unreadable) {
          return unreadable;
        }
        throw error;
      }
      const workspacePath = await input.resolveWorkspacePath(scope.workspaceId);
      return input.capture.transact(
        scope,
        async (manifest) => {
          let changed = false;
          for (const file of manifest.files) {
            if (file.status === "undoing") {
              await reconcileUndoingRecord(file, workspacePath);
              changed = true;
              continue;
            }
            if (file.undoTempName) {
              const removed = await trashJournaledUndoTemp(
                input.removal,
                { ...input.trashContext, workspacePath },
                file.relativePath,
                file.undoTempName,
              );
              if (removed) {
                delete file.undoTempName;
                changed = true;
              }
            }
            if (file.status !== "pending" && file.status !== "conflict") {
              continue;
            }
            const probe = await input.capture.probeWorkspaceFile(workspacePath, file.relativePath);
            const next = applyCurrentHashConflict(file, probe);
            if (next.status !== file.status || next.limitation !== file.limitation) {
              Object.assign(file, next);
              changed = true;
            }
          }
          return changed ? manifest : null;
        },
        { createIfMissing: false, operation: "getChangeReviewSet" },
      );
    },
    async getFileView(command) {
      if (!isChangeFileVersion(command.version)) {
        failCommand("getChangeFileView", "File version must be before, agent, or current.");
      }
      const relativePath = requireChangeRelativePath(command.relativePath, "getChangeFileView");
      parseChangeFileViewCursor(command.cursor, "getChangeFileView");
      if (command.version === "current") {
        await refreshCurrentHash(command, relativePath, "getChangeFileView");
        const { record } = await requireRecord(command, relativePath, "getChangeFileView");
        const workspacePath = await input.resolveWorkspacePath(command.workspaceId);
        const current = await input.capture.readWorkspaceFile(workspacePath, relativePath);
        switch (current.state) {
          case "absent":
            return limitedFileView(relativePath, command.version, record.status, "capture-failed");
          case "limited":
            return limitedFileView(relativePath, command.version, record.status, current.limitation);
          case "bytes":
            return fileViewFromBytes(relativePath, command.version, record.status, current.bytes, command.cursor);
          default: {
            const exhaustive: never = current;
            return exhaustive;
          }
        }
      }
      const { record } = await requireRecord(command, relativePath, "getChangeFileView");
      const blobId = command.version === "before" ? record.beforeBlobId : record.afterBlobId;
      if (command.version === "before" && record.kind === "created" && !blobId) {
        return {
          relativePath,
          version: command.version,
          status: record.status,
          truncated: false,
          text: "",
        };
      }
      if (!blobId) {
        return limitedFileView(relativePath, command.version, record.status, record.limitation ?? "capture-failed");
      }
      const stored = await verifiedBlob(input.capture, blobId, command.version === "before" ? record.beforeHash : record.afterHash);
      if (!stored) {
        return limitedFileView(relativePath, command.version, record.status, "capture-failed");
      }
      return fileViewFromBytes(relativePath, command.version, record.status, stored, command.cursor);
    },
    async getDiff(command) {
      const relativePath = requireChangeRelativePath(command.relativePath, "getChangeDiff");
      parseChangeDiffCursor(command.cursor, "getChangeDiff");
      await refreshCurrentHash(command, relativePath, "getChangeDiff");
      const { record } = await requireRecord(command, relativePath, "getChangeDiff");
      if (record.limitation) {
        return limitedDiff(relativePath, record.status, record.limitation);
      }
      const beforeBytes = record.beforeBlobId
        ? await verifiedBlob(input.capture, record.beforeBlobId, record.beforeHash)
        : new Uint8Array();
      const afterBytes = record.afterBlobId
        ? await verifiedBlob(input.capture, record.afterBlobId, record.afterHash)
        : undefined;
      if (beforeBytes === undefined || !afterBytes) {
        return limitedDiff(relativePath, record.status, "capture-failed");
      }
      const beforeClass = classifyBytes(beforeBytes);
      const afterClass = classifyBytes(afterBytes);
      if (beforeClass.kind !== "text" || afterClass.kind !== "text" || beforeClass.text === undefined || afterClass.text === undefined) {
        return limitedDiff(relativePath, record.status, "binary");
      }
      const paged = buildUnifiedDiffPage({
        relativePath,
        beforeText: beforeClass.text,
        afterText: afterClass.text,
        ...(command.cursor ? { cursor: command.cursor } : {}),
        ...(command.contextLines !== undefined ? { contextLines: command.contextLines } : {}),
        operation: "getChangeDiff",
      });
      if (paged.limitation) {
        return limitedDiff(relativePath, record.status, paged.limitation);
      }
      return {
        relativePath,
        status: record.status,
        hunks: paged.hunks,
        truncated: paged.truncated,
        ...(paged.nextCursor ? { nextCursor: paged.nextCursor } : {}),
        ...(paged.language ? { language: paged.language } : {}),
        ...(afterClass.lineEnding ? { lineEnding: afterClass.lineEnding } : {}),
      };
    },
    async approve(command) {
      const workspacePath = await input.resolveWorkspacePath(command.workspaceId);
      let approved = 0;
      let conflicted = 0;
      const snapshot = await input.capture.transact(
        command,
        async (manifest) => {
          const omitted = command.relativePaths === undefined;
          if (omitted && manifest.files.length > MAX_CHANGE_FILES_ON_SUMMARY) {
            failCommand("approveChanges", "Approve all requires the visible pending paths when the file list is truncated.");
          }
          const selected =
            command.relativePaths?.map((path) => requireChangeRelativePath(path, "approveChanges")) ??
            manifest.files
              .filter((file) => file.status === "pending" || file.status === "conflict")
              .map((file) => file.relativePath);
          for (const relativePath of selected) {
            const record = manifest.files.find((file) => file.relativePath === relativePath);
            if (!record) {
              failCommand("approveChanges", "That path is not in the selected review set.", HARNESS_ERROR_CODES.changeReviewNotFound);
            }
            const probe = await input.capture.probeWorkspaceFile(workspacePath, relativePath);
            const next = applyApproveTransition(record, probe);
            Object.assign(record, next, { updatedAt: now().toISOString() });
            if (next.status === "approved") {
              approved += 1;
            } else if (next.status === "conflict") {
              conflicted += 1;
            }
          }
          return manifest;
        },
        { expectedRevision: command.expectedRevision, createIfMissing: false, operation: "approveChanges" },
      );
      if (approved === 0 && conflicted > 0) {
        failCommand(
          "approveChanges",
          "The file no longer matches the recorded agent result, so Approve is unavailable.",
          HARNESS_ERROR_CODES.changeReviewConflict,
        );
      }
      return snapshot;
    },
    async prepareUndo(command) {
      expireUndoPreviews(previews, now().getTime());
      const relativePath = requireChangeRelativePath(command.relativePath, "prepareUndoChanges");
      const workspacePath = await input.resolveWorkspacePath(command.workspaceId);
      let prepared: StoredUndoPreview | undefined;
      let conflict = false;
      await input.capture.transact(
        command,
        async (manifest) => {
          const record = manifest.files.find((file) => file.relativePath === relativePath);
          if (!record) {
            failCommand("prepareUndoChanges", "That path is not in the selected review set.", HARNESS_ERROR_CODES.changeUndoUnavailable);
          }
          if (record.status !== "pending" || record.limitation || !record.afterHash) {
            failCommand("prepareUndoChanges", "Undo is available only for a complete pending write/edit change.", HARNESS_ERROR_CODES.changeUndoUnavailable);
          }
          if (record.kind === "modified" && (!record.beforeHash || !record.beforeBlobId)) {
            failCommand("prepareUndoChanges", "The before-image required for Undo is unavailable.", HARNESS_ERROR_CODES.changeUndoUnavailable);
          }
          const probe = await input.capture.probeWorkspaceFile(workspacePath, relativePath);
          if (probe.state !== "hashed" || probe.hash !== record.afterHash) {
            markProbeMismatch(record, probe);
            conflict = true;
            return manifest;
          }
          const resolved = await resolveCapturePath(relativePath, workspacePath);
          if (resolved.kind !== "regular-file" || resolved.limitation) {
            failCommand("prepareUndoChanges", "The tracked path is no longer a safe regular file.", HARNESS_ERROR_CODES.changeUndoUnavailable);
          }
          let file;
          try {
            file = await inspectRegularFile(resolved.canonicalPath);
          } catch (error) {
            if (error instanceof ChangeRecoveryConflictError) {
              record.status = "conflict";
              record.updatedAt = now().toISOString();
              conflict = true;
              return manifest;
            }
            throw error;
          }
          if (file.hash !== record.afterHash) {
            record.status = "conflict";
            record.updatedAt = now().toISOString();
            conflict = true;
            return manifest;
          }
          const action: UndoAction = record.kind === "created" ? "move-to-trash" : "restore";
          prepared = {
            scope: { workspaceId: command.workspaceId, sessionId: command.sessionId, runId: command.runId },
            relativePath,
            kind: record.kind,
            action,
            expectedRevision: manifest.revision,
            expectedCurrentHash: file.hash,
            workspacePath,
            workspaceIdentity: await inspectDirectoryIdentity(workspacePath),
            fileIdentity: file.identity,
            ...(record.beforeBlobId ? { beforeBlobId: record.beforeBlobId } : {}),
            ...(record.beforeHash ? { beforeHash: record.beforeHash } : {}),
            expiresAtMs: now().getTime() + UNDO_PREVIEW_TTL_MS,
          };
          return null;
        },
        { expectedRevision: command.expectedRevision, createIfMissing: false, operation: "prepareUndoChanges" },
      );
      if (conflict || !prepared) {
        failCommand(
          "prepareUndoChanges",
          "The file no longer matches the recorded agent result, so Undo is unavailable.",
          HARNESS_ERROR_CODES.changeReviewConflict,
        );
      }
      const previewToken = (input.randomId ?? randomUUID)();
      previews.set(previewToken, prepared);
      return {
        ...prepared.scope,
        relativePath: prepared.relativePath,
        action: prepared.action,
        previewToken,
        expiresAt: new Date(prepared.expiresAtMs).toISOString(),
        effect:
          prepared.action === "move-to-trash"
            ? "Move this unchanged agent-created file to operating-system Trash."
            : "Restore the exact bytes captured before the agent edit.",
      };
    },
    async applyUndo(command) {
      expireUndoPreviews(previews, now().getTime());
      const preview = previews.get(command.previewToken);
      previews.delete(command.previewToken);
      if (!preview || preview.expiresAtMs <= now().getTime() || !sameScope(preview.scope, command)) {
        failCommand(
          "applyUndoChanges",
          "That Undo preview expired or does not belong to this review set.",
          HARNESS_ERROR_CODES.changeUndoTokenInvalid,
        );
      }
      return input.capture.runExclusive(command, async () => {
        const workspacePath = await input.resolveWorkspacePath(command.workspaceId);
        let workspaceIdentity: FilesystemIdentity;
        try {
          workspaceIdentity = await inspectDirectoryIdentity(workspacePath);
        } catch (error) {
          throw normalizeUndoError(error);
        }
        if (
          workspacePath !== preview.workspacePath ||
          !sameFilesystemIdentity(workspaceIdentity, preview.workspaceIdentity)
        ) {
          failCommand(
            "applyUndoChanges",
            "The workspace identity changed after the Undo preview.",
            HARNESS_ERROR_CODES.changeReviewConflict,
          );
        }
        const undoTempName = preview.action === "restore" ? createUndoTempName() : undefined;
        const undoing = await input.capture.transact(
          command,
          async (manifest) => {
            const record = manifest.files.find((file) => file.relativePath === preview.relativePath);
            if (
              !record ||
              record.status !== "pending" ||
              record.kind !== preview.kind ||
              record.afterHash !== preview.expectedCurrentHash
            ) {
              failCommand("applyUndoChanges", "The pending change no longer matches the Undo preview.", HARNESS_ERROR_CODES.changeUndoUnavailable);
            }
            const probe = await input.capture.probeWorkspaceFile(workspacePath, preview.relativePath);
            if (probe.state !== "hashed" || probe.hash !== preview.expectedCurrentHash) {
              markProbeMismatch(record, probe);
              return manifest;
            }
            record.status = "undoing";
            record.updatedAt = now().toISOString();
            if (undoTempName) {
              record.undoTempName = undoTempName;
            }
            return manifest;
          },
          { expectedRevision: preview.expectedRevision, createIfMissing: false, operation: "applyUndoChanges" },
        );
        const undoingRecord = undoing.files.find((file) => file.relativePath === preview.relativePath);
        if (undoingRecord?.status !== "undoing") {
          failCommand("applyUndoChanges", "The file changed after the Undo preview.", HARNESS_ERROR_CODES.changeReviewConflict);
        }

        const abort = new AbortController();
        try {
          if (preview.action === "restore") {
            if (!preview.beforeBlobId || !preview.beforeHash || !undoTempName) {
              failCommand("applyUndoChanges", "The before-image required for Undo is unavailable.", HARNESS_ERROR_CODES.changeUndoUnavailable);
            }
            const bytes = await input.capture.getBlob(preview.beforeBlobId);
            if (!bytes || hashBytes(bytes) !== preview.beforeHash) {
              failCommand("applyUndoChanges", "The before-image required for Undo is missing.", HARNESS_ERROR_CODES.changeUndoUnavailable);
            }
            const resolved = await resolveCapturePath(preview.relativePath, workspacePath);
            if (resolved.kind !== "regular-file" || resolved.limitation) {
              throw new ChangeRecoveryConflictError("The tracked path is no longer a safe regular file.");
            }
            if (resolved.canonicalPath !== preview.fileIdentity.canonicalPath) {
              throw new ChangeRecoveryConflictError("The tracked path is no longer the same file.");
            }
            await input.recovery.restoreExact({
              canonicalPath: resolved.canonicalPath,
              workspacePath,
              expectedCurrentHash: preview.expectedCurrentHash,
              expectedIdentity: preview.fileIdentity,
              temporaryPath: path.join(path.dirname(resolved.canonicalPath), undoTempName),
              bytes,
              signal: abort.signal,
            });
          } else {
            const target = await validateTrashTarget(preview.relativePath, {
              ...input.trashContext,
              workspacePath,
            });
            const inspected = await inspectRegularFile(target.canonicalPath);
            if (
              inspected.hash !== preview.expectedCurrentHash ||
              !sameFilesystemIdentity(inspected.identity, preview.fileIdentity)
            ) {
              throw new ChangeRecoveryConflictError("The created file changed after the Undo preview.");
            }
            await assertPathHoldsIdentity(target.canonicalPath, preview.fileIdentity);
            await input.removal.moveToTrash({
              canonicalPath: target.canonicalPath,
              workspacePath,
              signal: abort.signal,
            });
            await waitForCreatedFileAbsence(input.capture, workspacePath, preview.relativePath, abort.signal);
          }
        } catch (error) {
          await reconcileFailedUndo(command, preview, workspacePath, undoing.revision);
          throw normalizeUndoError(error);
        }

        let finalized = false;
        const finalSnapshot = await input.capture.transact(
          command,
          async (manifest) => {
            const record = manifest.files.find((file) => file.relativePath === preview.relativePath);
            if (!record || record.status !== "undoing") {
              failCommand("applyUndoChanges", "Undo state changed before it could be finalized.", HARNESS_ERROR_CODES.changeUndoUnavailable);
            }
            finalized = (await reconcileUndoingRecord(record, workspacePath)) === "undone";
            return manifest;
          },
          { expectedRevision: undoing.revision, createIfMissing: false, operation: "applyUndoChanges" },
        );
        if (!finalized) {
          failCommand("applyUndoChanges", "Undo completed with an unexpected filesystem state.", HARNESS_ERROR_CODES.changeUndoFailed);
        }
        return finalSnapshot;
      });
    },
  };
}

function reconcileUndoingStatus(
  record: { kind: "created" | "modified"; beforeHash?: string; afterHash?: string; status: string },
  probe: Awaited<ReturnType<ChangeCaptureService["probeWorkspaceFile"]>>,
): "pending" | "undone" | "conflict" | "unavailable" {
  if (probe.state === "limited") {
    return "unavailable";
  }
  if (record.kind === "created" && probe.state === "absent") {
    return "undone";
  }
  if (record.kind === "modified" && probe.state === "hashed" && probe.hash === record.beforeHash) {
    return "undone";
  }
  if (probe.state === "hashed" && probe.hash === record.afterHash) {
    return "pending";
  }
  return "conflict";
}

function expireUndoPreviews(previews: Map<string, StoredUndoPreview>, timestamp: number): void {
  for (const [token, preview] of previews) {
    if (preview.expiresAtMs <= timestamp) {
      previews.delete(token);
    }
  }
}

function normalizeUndoError(error: unknown) {
  if (error instanceof ChangeRecoveryConflictError) {
    return createHarnessError({
      code: HARNESS_ERROR_CODES.changeReviewConflict,
      message: error.message,
      operation: "applyUndoChanges",
      recoverable: true,
    });
  }
  if (error instanceof TrashTargetError) {
    return createHarnessError({
      code: HARNESS_ERROR_CODES.changeUndoFailed,
      message: error.message,
      operation: "applyUndoChanges",
      recoverable: true,
    });
  }
  if (isValidatedHarnessError(error)) {
    return error;
  }
  return createHarnessError({
    code: HARNESS_ERROR_CODES.changeUndoFailed,
    message: "Undo failed.",
    operation: "applyUndoChanges",
    recoverable: true,
  });
}

function isValidatedHarnessError(error: unknown): error is HarnessError {
  return isHarnessError(error) && KNOWN_HARNESS_ERROR_CODES.has(error.code);
}

async function trashJournaledUndoTemp(
  removal: RecoverableRemovalService,
  trashContext: TrashTargetContext,
  relativePath: string,
  undoTempName: string,
): Promise<boolean> {
  if (!isUndoTempName(undoTempName)) {
    return true;
  }
  const directory = path.dirname(relativePath);
  const relativeTemp = directory === "." ? undoTempName : `${directory}/${undoTempName}`;
  const candidatePath = path.resolve(trashContext.workspacePath, relativeTemp);
  try {
    const target = await validateTrashTarget(relativeTemp, trashContext);
    await removal.moveToTrash({
      canonicalPath: target.canonicalPath,
      workspacePath: trashContext.workspacePath,
      signal: new AbortController().signal,
    });
    return true;
  } catch {
    try {
      await lstat(candidatePath);
      return false;
    } catch {
      return true;
    }
  }
}

async function waitForCreatedFileAbsence(
  capture: ChangeCaptureService,
  workspacePath: string,
  relativePath: string,
  signal: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + 3_000;
  let probe = await capture.probeWorkspaceFile(workspacePath, relativePath);
  while (probe.state !== "absent") {
    if (signal.aborted) {
      throw new Error("Undo was cancelled.");
    }
    if (Date.now() >= deadline) {
      throw new Error("The created file was still present after Trash.");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    probe = await capture.probeWorkspaceFile(workspacePath, relativePath);
  }
}

function sameScope(left: ChangeScope, right: ChangeScope): boolean {
  return left.workspaceId === right.workspaceId && left.sessionId === right.sessionId && left.runId === right.runId;
}

async function verifiedBlob(
  capture: ChangeCaptureService,
  blobId: string,
  expectedHash: string | undefined,
): Promise<Uint8Array | undefined> {
  const stored = await capture.getBlob(blobId);
  if (!stored) {
    return undefined;
  }
  const hash = hashBytes(stored);
  if (hash !== blobId || (expectedHash !== undefined && hash !== expectedHash)) {
    return undefined;
  }
  return stored;
}

function limitedFileView(
  relativePath: string,
  version: ChangeFileViewPage["version"],
  status: ChangeFileViewPage["status"],
  limitation: NonNullable<ChangeFileViewPage["limitation"]>,
): ChangeFileViewPage {
  return { relativePath, version, status, truncated: false, limitation };
}

function limitedDiff(
  relativePath: string,
  status: ChangeDiffPage["status"],
  limitation: NonNullable<ChangeDiffPage["limitation"]>,
): ChangeDiffPage {
  return { relativePath, status, hunks: [], truncated: false, limitation };
}

function fileViewFromBytes(
  relativePath: string,
  version: ChangeFileViewPage["version"],
  status: ChangeFileViewPage["status"],
  bytes: Uint8Array,
  cursor?: string,
): ChangeFileViewPage {
  const classified = classifyBytes(bytes);
  if (classified.kind !== "text" || classified.text === undefined) {
    return limitedFileView(relativePath, version, status, "binary");
  }
  const paged = pageFileText(relativePath, classified.text, cursor);
  return {
    relativePath,
    version,
    status,
    truncated: paged.truncated,
    text: paged.text,
    ...(paged.nextCursor ? { nextCursor: paged.nextCursor } : {}),
    ...(paged.language ? { language: paged.language } : {}),
    ...(classified.lineEnding ? { lineEnding: classified.lineEnding } : {}),
  };
}
