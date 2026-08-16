import { AsyncLocalStorage } from "node:async_hooks";
import { open } from "node:fs/promises";
import {
  blockingReviewStatuses,
  createHarnessError,
  HARNESS_ERROR_CODES,
  MAX_CHANGE_BLOB_BYTES_PER_RUN,
  MAX_CHANGE_FILES_ON_SUMMARY,
  MAX_CHANGE_SNAPSHOT_BYTES,
  type ChangeKind,
  type ChangeLimitation,
  type ChangeReviewSetSummary,
  type ChangeScope,
} from "@pho-code/protocol";
import { hashBytes } from "./change-hash";
import {
  createEmptyManifest,
  exceedsPersistenceBudget,
  ledgerBudgetExceeded,
  type ChangeLedgerManifest,
  type ChangeLedgerStore,
} from "./change-ledger-store";
import { decodeWriteEditPath, resolveCapturePath, untrackedCapturePath } from "./change-path";
import {
  applyCaptureBegin,
  applyCaptureSettle,
  toFileChangeSummary,
  type StoredFileChangeRecord,
  type WorkspaceFileProbe,
  type WorkspaceFileRead,
} from "./change-record";

export type { WorkspaceFileProbe, WorkspaceFileRead };

export interface ToolChangeIdentity extends ChangeScope {
  toolCallId: string;
  toolName: "write" | "edit";
}

export interface ChangeCaptureTransactOptions {
  expectedRevision?: number;
  createIfMissing?: boolean;
  operation?: string;
}

export interface ChangeCaptureService {
  begin(input: ToolChangeIdentity & { workspacePath: string; args: unknown }): Promise<void>;
  settle(input: ToolChangeIdentity & { workspacePath: string; args?: unknown; isError: boolean }): Promise<void>;
  recordCaptureFailure(input: ToolChangeIdentity & { workspacePath: string; args?: unknown }): Promise<void>;
  reconcileInterrupted(scope: ChangeScope): Promise<ChangeReviewSetSummary | undefined>;
  listSessionReviews(workspaceId: string, sessionId: string): Promise<ChangeReviewSetSummary[]>;
  loadManifest(scope: ChangeScope): Promise<ChangeLedgerManifest | undefined>;
  saveManifest(manifest: ChangeLedgerManifest): Promise<void>;
  transact(
    scope: ChangeScope,
    work: (manifest: ChangeLedgerManifest) => Promise<ChangeLedgerManifest | null>,
    options?: ChangeCaptureTransactOptions,
  ): Promise<ChangeReviewSetSummary>;
  runExclusive<T>(scope: ChangeScope, work: () => Promise<T>): Promise<T>;
  getBlob(blobId: string): Promise<Uint8Array | undefined>;
  probeWorkspaceFile(workspacePath: string, relativePath: string): Promise<WorkspaceFileProbe>;
  readWorkspaceFile(workspacePath: string, relativePath: string): Promise<WorkspaceFileRead>;
  hashWorkspaceFile(workspacePath: string, relativePath: string): Promise<string | undefined>;
  hasBlockingReview(workspaceId: string, sessionId: string): Promise<boolean>;
  hasUnreadableReview(workspaceId: string, sessionId: string): Promise<boolean>;
}

export function createChangeCaptureService(input: {
  store: ChangeLedgerStore;
  now?: () => Date;
  onUpdated?: (summary: ChangeReviewSetSummary) => void;
}): ChangeCaptureService {
  const now = () => (input.now ?? (() => new Date()))().toISOString();
  const locks = new Map<string, Promise<void>>();
  const heldLock = new AsyncLocalStorage<string>();

  async function withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    if (heldLock.getStore() === key) {
      return work();
    }
    const previous = locks.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = previous.then(() => gate);
    locks.set(key, current);
    await previous;
    try {
      return await heldLock.run(key, work);
    } finally {
      release();
      if (locks.get(key) === current) {
        locks.delete(key);
      }
    }
  }

  async function transact(
    scope: ChangeScope,
    work: (manifest: ChangeLedgerManifest) => Promise<ChangeLedgerManifest | null>,
    options?: ChangeCaptureTransactOptions,
  ): Promise<ChangeReviewSetSummary> {
    return withLock(scopeKey(scope), async () => {
      const existing = await input.store.load(scope);
      if (!existing && options?.createIfMissing === false) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.changeReviewNotFound,
          message: "No tracked write/edit review exists for that run.",
          operation: options.operation ?? "changeReviewTransact",
          recoverable: true,
        });
      }
      const current = existing ?? createEmptyManifest(scope, now());
      if (options?.expectedRevision !== undefined && options.expectedRevision !== current.revision) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.changeReviewRevisionMismatch,
          message: "The review set changed. Refresh and try again.",
          operation: options.operation ?? "changeReviewTransact",
          recoverable: true,
        });
      }
      const next = await work(current);
      if (next === null) {
        return projectSnapshot(current);
      }
      next.revision += 1;
      next.updatedAt = now();
      await input.store.save(next);
      const summary = projectSummary(next);
      input.onUpdated?.(summary);
      return projectSnapshot(next);
    });
  }

  return {
    async begin(command) {
      const relative = decodeWriteEditPath(command.args);
      await transact(
        command,
        async (manifest) => {
          const previous = cloneManifest(manifest);
          const resolved = relative
            ? await resolveCapturePath(relative, command.workspacePath)
            : {
                relativePath: untrackedCapturePath("malformed", command.toolCallId),
                canonicalPath: command.workspacePath,
                kind: "other" as const,
                limitation: "capture-failed" as const,
              };
          const kind = resolved.kind === "regular-file" || command.toolName === "edit" ? "modified" : "created";
          const file = beginFile(manifest, command, resolved.relativePath, kind, resolved.limitation, now());
          upsertFile(manifest, file);
          manifest.operations.push({
            toolCallId: command.toolCallId,
            toolName: command.toolName,
            relativePath: resolved.relativePath,
            at: now(),
          });
          if (resolved.limitation || resolved.kind === "directory" || resolved.kind === "symlink" || resolved.kind === "other") {
            return commitOrCap(manifest, previous);
          }
          if (resolved.kind === "absent") {
            return commitOrCap(manifest, previous);
          }
          const current = manifest.files.find((entry) => entry.relativePath === resolved.relativePath);
          if (!current) {
            return commitOrCap(manifest, previous);
          }
          try {
            const snapshot = await snapshotFile(resolved.canonicalPath, manifest, input.store);
            if (snapshot.limitation) {
              current.limitation = snapshot.limitation;
              current.status = "unavailable";
            }
            if (snapshot.hash) {
              current.beforeHash = current.beforeHash ?? snapshot.hash;
            }
            if (snapshot.blobId) {
              current.beforeBlobId = current.beforeBlobId ?? snapshot.blobId;
            }
            if (snapshot.byteLength !== undefined) {
              current.byteLengthBefore = current.byteLengthBefore ?? snapshot.byteLength;
            }
          } catch {
            current.status = "unavailable";
            current.limitation = "capture-failed";
          }
          return commitOrCap(manifest, previous);
        },
        { createIfMissing: true },
      );
    },
    async settle(command) {
      await transact(
        command,
        async (manifest) => {
          const relative = await relativeForSettle(manifest, command);
          if (!relative) {
            return null;
          }
          const existing = manifest.files.find((entry) => entry.relativePath === relative);
          if (!existing) {
            return null;
          }
          const resolved = await resolveCapturePath(relative, command.workspacePath);
          let afterHash: string | undefined;
          let afterBlobId: string | undefined;
          let byteLengthAfter: number | undefined;
          let limitation = existing.limitation ?? resolved.limitation;
          if (!limitation && (resolved.kind === "regular-file" || resolved.kind === "absent")) {
            if (resolved.kind === "regular-file") {
              try {
                const snapshot = await snapshotFile(resolved.canonicalPath, manifest, input.store);
                afterHash = snapshot.hash;
                afterBlobId = snapshot.blobId;
                byteLengthAfter = snapshot.byteLength;
                limitation = snapshot.limitation ?? limitation;
              } catch {
                limitation = "capture-failed";
              }
            }
          } else if (resolved.limitation) {
            limitation = resolved.limitation;
          }
          const settled = applyCaptureSettle(existing, {
            toolCallId: command.toolCallId,
            now: now(),
            ...(afterHash ? { afterHash } : {}),
            ...(afterBlobId ? { afterBlobId } : {}),
            ...(byteLengthAfter !== undefined ? { byteLengthAfter } : {}),
            ...(limitation ? { limitation } : {}),
            isError: command.isError,
          });
          upsertFile(manifest, settled);
          const operation = manifest.operations.find((entry) => entry.toolCallId === command.toolCallId);
          if (operation) {
            operation.isError = command.isError;
          }
          return manifest;
        },
        { createIfMissing: true },
      );
    },
    async recordCaptureFailure(command) {
      await transact(
        command,
        async (manifest) => {
          const previous = cloneManifest(manifest);
          const relative = await relativeForSettle(manifest, command);
          if (!relative) {
            return null;
          }
          const existing = manifest.files.find((entry) => entry.relativePath === relative);
          const failed = applyCaptureBegin(existing, {
            relativePath: relative,
            toolCallId: command.toolCallId,
            kind: existing?.kind ?? (command.toolName === "edit" ? "modified" : "created"),
            now: now(),
            limitation: "capture-failed",
          });
          failed.status = "unavailable";
          failed.limitation = "capture-failed";
          upsertFile(manifest, failed);
          if (!manifest.operations.some((entry) => entry.toolCallId === command.toolCallId)) {
            manifest.operations.push({
              toolCallId: command.toolCallId,
              toolName: command.toolName,
              relativePath: relative,
              at: now(),
            });
          }
          return commitOrCap(manifest, previous);
        },
        { createIfMissing: true },
      );
    },
    async reconcileInterrupted(scope) {
      return withLock(scopeKey(scope), async () => {
        const existing = await input.store.load(scope);
        if (!existing) {
          return undefined;
        }
        let changed = false;
        for (const file of existing.files) {
          if (file.status !== "capturing") {
            continue;
          }
          file.status = "indeterminate";
          file.updatedAt = now();
          changed = true;
        }
        if (!changed) {
          return projectSnapshot(existing);
        }
        existing.revision += 1;
        existing.updatedAt = now();
        await input.store.save(existing);
        const summary = projectSummary(existing);
        input.onUpdated?.(summary);
        return projectSnapshot(existing);
      });
    },
    async listSessionReviews(workspaceId, sessionId) {
      const listing = await input.store.listForSession(workspaceId, sessionId);
      const summaries = listing.manifests.map(projectSummary);
      for (const scope of listing.unreadableScopes) {
        if (summaries.some((summary) => summary.runId === scope.runId)) {
          continue;
        }
        summaries.push(unreadableReviewSummary(scope, now()));
      }
      return summaries;
    },
    loadManifest(scope) {
      return input.store.load(scope);
    },
    saveManifest(manifest) {
      return withLock(scopeKey(manifest), () => input.store.save(manifest));
    },
    transact,
    runExclusive(scope, work) {
      return withLock(scopeKey(scope), work);
    },
    getBlob(blobId) {
      return input.store.getBlob(blobId);
    },
    probeWorkspaceFile(workspacePath, relativePath) {
      return probeFromRead(readWorkspaceBytes(workspacePath, relativePath));
    },
    readWorkspaceFile(workspacePath, relativePath) {
      return readWorkspaceBytes(workspacePath, relativePath);
    },
    async hashWorkspaceFile(workspacePath, relativePath) {
      const probe = await probeFromRead(readWorkspaceBytes(workspacePath, relativePath));
      return probe.state === "hashed" ? probe.hash : undefined;
    },
    async hasBlockingReview(workspaceId, sessionId) {
      const listing = await input.store.listForSession(workspaceId, sessionId);
      if (listing.unreadable) {
        return true;
      }
      return listing.manifests.some((manifest) => manifest.files.some((file) => blockingReviewStatuses(file.status)));
    },
    async hasUnreadableReview(workspaceId, sessionId) {
      return (await input.store.listForSession(workspaceId, sessionId)).unreadable;
    },
  };
}

export function projectSummary(manifest: ChangeLedgerManifest): ChangeReviewSetSummary {
  return projectReview(manifest, true);
}

export function projectSnapshot(manifest: ChangeLedgerManifest): ChangeReviewSetSummary {
  return projectReview(manifest, false);
}

function projectReview(manifest: ChangeLedgerManifest, truncateFiles: boolean): ChangeReviewSetSummary {
  const files = manifest.files.map(toFileChangeSummary);
  const truncated = truncateFiles && files.length > MAX_CHANGE_FILES_ON_SUMMARY;
  return {
    workspaceId: manifest.workspaceId,
    sessionId: manifest.sessionId,
    runId: manifest.runId,
    revision: manifest.revision,
    pendingCount: files.filter((file) => file.status === "pending").length,
    approvedCount: files.filter((file) => file.status === "approved").length,
    conflictCount: files.filter((file) => file.status === "conflict").length,
    unavailableCount: files.filter((file) => file.status === "unavailable" || file.status === "indeterminate").length,
    fileCount: files.length,
    filesTruncated: truncated,
    ...(manifest.captureCapped ? { captureCapped: true } : {}),
    files: truncated ? files.slice(0, MAX_CHANGE_FILES_ON_SUMMARY) : files,
    toolCallIds: [...new Set(manifest.operations.map((operation) => operation.toolCallId))],
    updatedAt: manifest.updatedAt,
  };
}

function beginFile(
  manifest: ChangeLedgerManifest,
  command: ToolChangeIdentity,
  relativePath: string,
  kind: ChangeKind,
  limitation: ChangeLimitation | undefined,
  timestamp: string,
): StoredFileChangeRecord {
  const existing = manifest.files.find((entry) => entry.relativePath === relativePath);
  return applyCaptureBegin(existing, {
    relativePath,
    toolCallId: command.toolCallId,
    kind: existing?.kind ?? kind,
    now: timestamp,
    ...(limitation ? { limitation } : {}),
  });
}

async function snapshotFile(
  canonicalPath: string,
  manifest: ChangeLedgerManifest,
  store: ChangeLedgerStore,
): Promise<{ hash?: string; blobId?: string; byteLength?: number; limitation?: ChangeLimitation }> {
  const bounded = await readBoundedBytes(canonicalPath);
  if (bounded.limitation) {
    return { byteLength: bounded.byteLength, limitation: bounded.limitation };
  }
  if (!bounded.bytes) {
    return {};
  }
  if (manifest.blobBytes + bounded.bytes.byteLength > MAX_CHANGE_BLOB_BYTES_PER_RUN) {
    return { byteLength: bounded.bytes.byteLength, limitation: "too-large" };
  }
  if (ledgerBudgetExceeded(await store.totalBytes())) {
    return { byteLength: bounded.bytes.byteLength, limitation: "capture-failed" };
  }
  const hash = hashBytes(bounded.bytes);
  const stored = await store.putBlob(bounded.bytes);
  if (stored.created) {
    manifest.blobBytes += bounded.bytes.byteLength;
  }
  return {
    hash,
    blobId: stored.blobId,
    byteLength: bounded.bytes.byteLength,
  };
}

async function readWorkspaceBytes(workspacePath: string, relativePath: string): Promise<WorkspaceFileRead> {
  const resolved = await resolveCapturePath(relativePath, workspacePath);
  if (resolved.kind === "absent") {
    return { state: "absent" };
  }
  if (resolved.kind !== "regular-file" || resolved.limitation) {
    return { state: "limited", limitation: resolved.limitation ?? "unsupported-kind" };
  }
  const bounded = await readBoundedBytes(resolved.canonicalPath);
  if (bounded.limitation) {
    return { state: "limited", limitation: bounded.limitation };
  }
  if (!bounded.bytes) {
    return { state: "absent" };
  }
  return { state: "bytes", bytes: bounded.bytes, hash: hashBytes(bounded.bytes) };
}

async function probeFromRead(read: Promise<WorkspaceFileRead>): Promise<WorkspaceFileProbe> {
  const result = await read;
  switch (result.state) {
    case "absent":
      return { state: "absent" };
    case "bytes":
      return { state: "hashed", hash: result.hash };
    case "limited":
      return { state: "limited", limitation: result.limitation };
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}

async function readBoundedBytes(
  canonicalPath: string,
): Promise<{ bytes?: Uint8Array; byteLength?: number; limitation?: ChangeLimitation }> {
  let handle;
  try {
    handle = await open(canonicalPath, "r");
  } catch {
    return {};
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) {
      return { limitation: "unsupported-kind" };
    }
    if (info.size > MAX_CHANGE_SNAPSHOT_BYTES) {
      return { byteLength: info.size, limitation: "too-large" };
    }
    const buffer = Buffer.alloc(info.size);
    const { bytesRead } = await handle.read(buffer, 0, info.size, 0);
    if (bytesRead !== info.size) {
      return { byteLength: info.size, limitation: "capture-failed" };
    }
    return { bytes: buffer.subarray(0, bytesRead), byteLength: bytesRead };
  } finally {
    await handle.close();
  }
}

async function relativeForSettle(
  manifest: ChangeLedgerManifest,
  command: ToolChangeIdentity & { args?: unknown; workspacePath: string },
): Promise<string | undefined> {
  const captured = findRelativeForCall(manifest, command.toolCallId);
  if (captured) {
    return captured;
  }
  const decoded = decodeWriteEditPath(command.args);
  if (!decoded) {
    return untrackedCapturePath("malformed", command.toolCallId);
  }
  const resolved = await resolveCapturePath(decoded, command.workspacePath);
  return resolved.relativePath;
}

function upsertFile(manifest: ChangeLedgerManifest, record: StoredFileChangeRecord): void {
  const index = manifest.files.findIndex((entry) => entry.relativePath === record.relativePath);
  if (index < 0) {
    manifest.files.push(record);
    return;
  }
  manifest.files[index] = record;
}

function findRelativeForCall(manifest: ChangeLedgerManifest | undefined, toolCallId: string): string | undefined {
  return manifest?.operations.find((operation) => operation.toolCallId === toolCallId)?.relativePath;
}

function scopeKey(scope: ChangeScope): string {
  return `${scope.workspaceId}\0${scope.sessionId}\0${scope.runId}`;
}

function cloneManifest(manifest: ChangeLedgerManifest): ChangeLedgerManifest {
  return {
    ...manifest,
    files: manifest.files.map((file) => ({ ...file })),
    operations: manifest.operations.map((operation) => ({ ...operation })),
  };
}

function restoreManifest(target: ChangeLedgerManifest, source: ChangeLedgerManifest): void {
  target.files = source.files;
  target.operations = source.operations;
  target.blobBytes = source.blobBytes;
  if (source.captureCapped) {
    target.captureCapped = true;
  } else {
    delete target.captureCapped;
  }
}

function commitOrCap(manifest: ChangeLedgerManifest, previous: ChangeLedgerManifest): ChangeLedgerManifest | null {
  if (!exceedsPersistenceBudget(manifest)) {
    return manifest;
  }
  restoreManifest(manifest, previous);
  if (manifest.captureCapped) {
    return null;
  }
  manifest.captureCapped = true;
  return manifest;
}

function unreadableReviewSummary(scope: ChangeScope, updatedAt: string): ChangeReviewSetSummary {
  return {
    workspaceId: scope.workspaceId,
    sessionId: scope.sessionId,
    runId: scope.runId,
    revision: 0,
    pendingCount: 0,
    approvedCount: 0,
    conflictCount: 0,
    unavailableCount: 1,
    fileCount: 0,
    filesTruncated: false,
    ledgerUnreadable: true,
    files: [],
    toolCallIds: [],
    updatedAt,
  };
}
