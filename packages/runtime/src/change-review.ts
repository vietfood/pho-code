import {
  randomUUID,
} from "node:crypto";
import {
  createHarnessError,
  HARNESS_ERROR_CODES,
  MAX_CHANGE_FILES_ON_SUMMARY,
  MAX_CHANGE_RELATIVE_PATH_CHARS,
  isChangeFileVersion,
  type ApproveChangesInput,
  type ApplyUndoChangesInput,
  type ChangeDiffPage,
  type ChangeFileViewPage,
  type ChangeKind,
  type ChangeReviewSetSnapshot,
  type ChangeScope,
  type GetChangeDiffInput,
  type GetChangeFileViewInput,
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
import { validateTrashTarget, TrashTargetError, type TrashTargetContext } from "./trash-target";
import type { RecoverableRemovalService } from "./recoverable-removal";
import {
  ChangeRecoveryConflictError,
  type ChangeRecoveryService,
} from "./change-recovery";

const UNDO_PREVIEW_TTL_MS = 5 * 60 * 1000;

interface StoredUndoPreview {
  scope: ChangeScope;
  relativePath: string;
  kind: ChangeKind;
  action: UndoAction;
  expectedRevision: number;
  expectedCurrentHash: string;
  workspacePath: string;
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
  function requireRelativePath(relativePath: string, operation: string): string {
    const trimmed = relativePath.trim();
    if (trimmed === "" || trimmed.length > MAX_CHANGE_RELATIVE_PATH_CHARS || trimmed.includes("..") || trimmed.startsWith("/")) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.invalidCommand,
        message: "A workspace-relative tracked path is required.",
        operation,
        recoverable: true,
      });
    }
    return trimmed;
  }

  async function requireRecord(scope: ChangeScope, relativePath: string, operation: string) {
    const manifest = await input.capture.loadManifest(scope);
    if (!manifest) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.changeReviewNotFound,
        message: "No tracked write/edit review exists for that run.",
        operation,
        recoverable: true,
      });
    }
    const record = manifest.files.find((file) => file.relativePath === relativePath);
    if (!record) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.changeReviewNotFound,
        message: "That path is not in the selected review set.",
        operation,
        recoverable: true,
      });
    }
    return { manifest, record };
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

  return {
    async getReviewSet(scope) {
      await input.capture.reconcileInterrupted(scope);
      const workspacePath = await input.resolveWorkspacePath(scope.workspaceId);
      return input.capture.transact(
        scope,
        async (manifest) => {
          let changed = false;
          for (const file of manifest.files) {
            if (file.status === "undoing") {
              const probe = await input.capture.probeWorkspaceFile(workspacePath, file.relativePath);
              const status = reconcileUndoingStatus(file, probe);
              file.status = status;
              file.updatedAt = now().toISOString();
              changed = true;
              continue;
            }
            if (file.status !== "pending") {
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
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "File version must be before, agent, or current.",
          operation: "getChangeFileView",
          recoverable: true,
        });
      }
      const relativePath = requireRelativePath(command.relativePath, "getChangeFileView");
      if (command.version === "current") {
        await refreshCurrentHash(command, relativePath, "getChangeFileView");
        const { record } = await requireRecord(command, relativePath, "getChangeFileView");
        const workspacePath = await input.resolveWorkspacePath(command.workspaceId);
        const current = await input.capture.readWorkspaceFile(workspacePath, relativePath);
        switch (current.state) {
          case "absent":
            return {
              relativePath,
              version: command.version,
              status: record.status,
              truncated: false,
              limitation: "capture-failed",
            };
          case "limited":
            return {
              relativePath,
              version: command.version,
              status: record.status,
              truncated: false,
              limitation: current.limitation,
            };
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
        return {
          relativePath,
          version: command.version,
          status: record.status,
          truncated: false,
          limitation: record.limitation ?? "capture-failed",
        };
      }
      const stored = await input.capture.getBlob(blobId);
      if (!stored) {
        return {
          relativePath,
          version: command.version,
          status: record.status,
          truncated: false,
          limitation: "capture-failed",
        };
      }
      return fileViewFromBytes(relativePath, command.version, record.status, stored, command.cursor);
    },
    async getDiff(command) {
      const relativePath = requireRelativePath(command.relativePath, "getChangeDiff");
      await refreshCurrentHash(command, relativePath, "getChangeDiff");
      const { record } = await requireRecord(command, relativePath, "getChangeDiff");
      if (record.limitation) {
        return {
          relativePath,
          status: record.status,
          hunks: [],
          truncated: false,
          limitation: record.limitation,
        };
      }
      const beforeBytes = record.beforeBlobId ? await input.capture.getBlob(record.beforeBlobId) : new Uint8Array();
      const afterBytes = record.afterBlobId ? await input.capture.getBlob(record.afterBlobId) : undefined;
      if (beforeBytes === undefined || !afterBytes) {
        return {
          relativePath,
          status: record.status,
          hunks: [],
          truncated: false,
          limitation: "capture-failed",
        };
      }
      const beforeClass = classifyBytes(beforeBytes);
      const afterClass = classifyBytes(afterBytes);
      if (beforeClass.kind !== "text" || afterClass.kind !== "text" || beforeClass.text === undefined || afterClass.text === undefined) {
        return {
          relativePath,
          status: record.status,
          hunks: [],
          truncated: false,
          limitation: "binary",
        };
      }
      const paged = buildUnifiedDiffPage({
        relativePath,
        beforeText: beforeClass.text,
        afterText: afterClass.text,
        ...(command.cursor ? { cursor: command.cursor } : {}),
        ...(command.contextLines !== undefined ? { contextLines: command.contextLines } : {}),
      });
      const page: ChangeDiffPage = {
        relativePath,
        status: record.status,
        hunks: paged.hunks,
        truncated: paged.truncated,
      };
      if (paged.nextCursor) {
        page.nextCursor = paged.nextCursor;
      }
      if (paged.language) {
        page.language = paged.language;
      }
      if (afterClass.lineEnding) {
        page.lineEnding = afterClass.lineEnding;
      }
      return page;
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
            throw createHarnessError({
              code: HARNESS_ERROR_CODES.invalidCommand,
              message: "Approve all requires the visible pending paths when the file list is truncated.",
              operation: "approveChanges",
              recoverable: true,
            });
          }
          const selected =
            command.relativePaths?.map((path) => path.trim()).filter((path) => path !== "") ??
            manifest.files.filter((file) => file.status === "pending").map((file) => file.relativePath);
          for (const relativePath of selected) {
            const record = manifest.files.find((file) => file.relativePath === relativePath);
            if (!record) {
              throw createHarnessError({
                code: HARNESS_ERROR_CODES.changeReviewNotFound,
                message: "That path is not in the selected review set.",
                operation: "approveChanges",
                recoverable: true,
              });
            }
            const probe = await input.capture.probeWorkspaceFile(workspacePath, relativePath);
            const next = applyApproveTransition(record, probe);
            Object.assign(record, next, { updatedAt: new Date().toISOString() });
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
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.changeReviewConflict,
          message: "The file no longer matches the recorded agent result, so Approve is unavailable.",
          operation: "approveChanges",
          recoverable: true,
        });
      }
      return snapshot;
    },
    async prepareUndo(command) {
      expireUndoPreviews(previews, now().getTime());
      const relativePath = requireRelativePath(command.relativePath, "prepareUndoChanges");
      const workspacePath = await input.resolveWorkspacePath(command.workspaceId);
      let prepared: StoredUndoPreview | undefined;
      let conflict = false;
      await input.capture.transact(
        command,
        async (manifest) => {
          const record = manifest.files.find((file) => file.relativePath === relativePath);
          if (!record) {
            throw undoUnavailable("That path is not in the selected review set.", "prepareUndoChanges");
          }
          if (record.status !== "pending" || record.limitation || !record.afterHash) {
            throw undoUnavailable("Undo is available only for a complete pending write/edit change.", "prepareUndoChanges");
          }
          if (record.kind === "modified" && (!record.beforeHash || !record.beforeBlobId)) {
            throw undoUnavailable("The before-image required for Undo is unavailable.", "prepareUndoChanges");
          }
          const probe = await input.capture.probeWorkspaceFile(workspacePath, relativePath);
          if (probe.state !== "hashed" || probe.hash !== record.afterHash) {
            record.status = probe.state === "limited" ? "unavailable" : "conflict";
            if (probe.state === "limited") {
              record.limitation = probe.limitation;
            }
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
            expectedCurrentHash: probe.hash,
            workspacePath,
            ...(record.beforeBlobId ? { beforeBlobId: record.beforeBlobId } : {}),
            ...(record.beforeHash ? { beforeHash: record.beforeHash } : {}),
            expiresAtMs: now().getTime() + UNDO_PREVIEW_TTL_MS,
          };
          return null;
        },
        { expectedRevision: command.expectedRevision, createIfMissing: false, operation: "prepareUndoChanges" },
      );
      if (conflict || !prepared) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.changeReviewConflict,
          message: "The file no longer matches the recorded agent result, so Undo is unavailable.",
          operation: "prepareUndoChanges",
          recoverable: true,
        });
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
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.changeUndoTokenInvalid,
          message: "That Undo preview expired or does not belong to this review set.",
          operation: "applyUndoChanges",
          recoverable: true,
        });
      }
      return input.capture.runExclusive(command, async () => {
      const workspacePath = await input.resolveWorkspacePath(command.workspaceId);
      if (workspacePath !== preview.workspacePath) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.changeReviewConflict,
          message: "The workspace identity changed after the Undo preview.",
          operation: "applyUndoChanges",
          recoverable: true,
        });
      }
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
            throw undoUnavailable("The pending change no longer matches the Undo preview.", "applyUndoChanges");
          }
          const probe = await input.capture.probeWorkspaceFile(workspacePath, preview.relativePath);
          if (probe.state !== "hashed" || probe.hash !== preview.expectedCurrentHash) {
            record.status = probe.state === "limited" ? "unavailable" : "conflict";
            if (probe.state === "limited") {
              record.limitation = probe.limitation;
            }
            record.updatedAt = now().toISOString();
            return manifest;
          }
          record.status = "undoing";
          record.updatedAt = now().toISOString();
          return manifest;
        },
        { expectedRevision: preview.expectedRevision, createIfMissing: false, operation: "applyUndoChanges" },
      );
      const undoingRecord = undoing.files.find((file) => file.relativePath === preview.relativePath);
      if (undoingRecord?.status !== "undoing") {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.changeReviewConflict,
          message: "The file changed after the Undo preview.",
          operation: "applyUndoChanges",
          recoverable: true,
        });
      }

      const abort = new AbortController();
      try {
        if (preview.action === "restore") {
          if (!preview.beforeBlobId || !preview.beforeHash) {
            throw undoUnavailable("The before-image required for Undo is unavailable.", "applyUndoChanges");
          }
          const bytes = await input.capture.getBlob(preview.beforeBlobId);
          if (!bytes || hashBytes(bytes) !== preview.beforeHash) {
            throw undoUnavailable("The before-image required for Undo is missing.", "applyUndoChanges");
          }
          const resolved = await resolveCapturePath(preview.relativePath, workspacePath);
          if (resolved.kind !== "regular-file" || resolved.limitation) {
            throw new ChangeRecoveryConflictError("The tracked path is no longer a safe regular file.");
          }
          await input.recovery.restoreExact({
            canonicalPath: resolved.canonicalPath,
            workspacePath,
            expectedCurrentHash: preview.expectedCurrentHash,
            bytes,
            signal: abort.signal,
          });
        } else {
          const target = await validateTrashTarget(preview.relativePath, {
            ...input.trashContext,
            workspacePath,
          });
          const probe = await input.capture.probeWorkspaceFile(workspacePath, preview.relativePath);
          if (probe.state !== "hashed" || probe.hash !== preview.expectedCurrentHash) {
            throw new ChangeRecoveryConflictError("The created file changed after the Undo preview.");
          }
          const resolved = await resolveCapturePath(preview.relativePath, workspacePath);
          if (resolved.kind !== "regular-file" || resolved.canonicalPath !== target.canonicalPath || resolved.limitation) {
            throw new ChangeRecoveryConflictError("The tracked path is no longer a safe regular file.");
          }
          await input.removal.moveToTrash({
            canonicalPath: target.canonicalPath,
            workspacePath,
            signal: abort.signal,
          });
          await waitForCreatedFileAbsence(input.capture, workspacePath, preview.relativePath, abort.signal);
        }
      } catch (error) {
        await reconcileFailedUndo(input.capture, command, preview, workspacePath, undoing.revision, now);
        if (error instanceof ChangeRecoveryConflictError) {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.changeReviewConflict,
            message: error.message,
            operation: "applyUndoChanges",
            recoverable: true,
          });
        }
        if (error instanceof TrashTargetError) {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.changeUndoFailed,
            message: error.message,
            operation: "applyUndoChanges",
            recoverable: true,
          });
        }
        if (typeof error === "object" && error !== null && "code" in error) {
          throw error;
        }
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.changeUndoFailed,
          message: error instanceof Error ? error.message : "Undo failed.",
          operation: "applyUndoChanges",
          recoverable: true,
        });
      }

      let finalized = false;
      const finalSnapshot = await input.capture.transact(
        command,
        async (manifest) => {
          const record = manifest.files.find((file) => file.relativePath === preview.relativePath);
          if (!record || record.status !== "undoing") {
            throw undoUnavailable("Undo state changed before it could be finalized.", "applyUndoChanges");
          }
          const probe = await input.capture.probeWorkspaceFile(workspacePath, preview.relativePath);
          const status = reconcileUndoingStatus(record, probe);
          record.status = status;
          record.updatedAt = now().toISOString();
          finalized = status === "undone";
          return manifest;
        },
        { expectedRevision: undoing.revision, createIfMissing: false, operation: "applyUndoChanges" },
      );
      if (!finalized) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.changeUndoFailed,
          message: "Undo completed with an unexpected filesystem state.",
          operation: "applyUndoChanges",
          recoverable: true,
        });
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

async function reconcileFailedUndo(
  capture: ChangeCaptureService,
  scope: ChangeScope,
  preview: StoredUndoPreview,
  workspacePath: string,
  expectedRevision: number,
  now: () => Date,
): Promise<void> {
  try {
    await capture.transact(
      scope,
      async (manifest) => {
        const record = manifest.files.find((file) => file.relativePath === preview.relativePath);
        if (!record || record.status !== "undoing") {
          return null;
        }
        const probe = await capture.probeWorkspaceFile(workspacePath, preview.relativePath);
        record.status = reconcileUndoingStatus(record, probe);
        record.updatedAt = now().toISOString();
        return manifest;
      },
      { expectedRevision, createIfMissing: false, operation: "applyUndoChanges" },
    );
  } catch {
    // The persisted undoing state is reconciled the next time the review set opens.
  }
}

function undoUnavailable(message: string, operation: string) {
  return createHarnessError({
    code: HARNESS_ERROR_CODES.changeUndoUnavailable,
    message,
    operation,
    recoverable: true,
  });
}

function expireUndoPreviews(previews: Map<string, StoredUndoPreview>, timestamp: number): void {
  for (const [token, preview] of previews) {
    if (preview.expiresAtMs <= timestamp) {
      previews.delete(token);
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

function fileViewFromBytes(
  relativePath: string,
  version: ChangeFileViewPage["version"],
  status: ChangeFileViewPage["status"],
  bytes: Uint8Array,
  cursor?: string,
): ChangeFileViewPage {
  const classified = classifyBytes(bytes);
  if (classified.kind !== "text" || classified.text === undefined) {
    return {
      relativePath,
      version,
      status,
      truncated: false,
      limitation: "binary",
    };
  }
  const paged = pageFileText(relativePath, classified.text, cursor);
  const page: ChangeFileViewPage = {
    relativePath,
    version,
    status,
    truncated: paged.truncated,
    text: paged.text,
  };
  if (paged.nextCursor) {
    page.nextCursor = paged.nextCursor;
  }
  if (paged.language) {
    page.language = paged.language;
  }
  if (classified.lineEnding) {
    page.lineEnding = classified.lineEnding;
  }
  return page;
}
