import type { ChangeKind, ChangeLimitation, FileChangeSummary, ReviewStatus } from "@pho-code/protocol";

export interface ChangeOperation {
  toolCallId: string;
  toolName: "write" | "edit";
  relativePath: string;
  at: string;
  isError?: boolean;
}

export interface StoredFileChangeRecord {
  relativePath: string;
  kind: ChangeKind;
  status: ReviewStatus;
  firstToolCallId: string;
  latestToolCallId: string;
  startedAt: string;
  updatedAt: string;
  beforeHash?: string;
  afterHash?: string;
  beforeBlobId?: string;
  afterBlobId?: string;
  byteLengthBefore?: number;
  byteLengthAfter?: number;
  limitation?: ChangeLimitation;
  undoTempName?: string;
}

export function toFileChangeSummary(record: StoredFileChangeRecord): FileChangeSummary {
  const summary: FileChangeSummary = {
    relativePath: record.relativePath,
    kind: record.kind,
    status: record.status,
    firstToolCallId: record.firstToolCallId,
    latestToolCallId: record.latestToolCallId,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
  };
  if (record.beforeHash) {
    summary.beforeHash = record.beforeHash;
  }
  if (record.afterHash) {
    summary.afterHash = record.afterHash;
  }
  if (record.byteLengthBefore !== undefined) {
    summary.byteLengthBefore = record.byteLengthBefore;
  }
  if (record.byteLengthAfter !== undefined) {
    summary.byteLengthAfter = record.byteLengthAfter;
  }
  if (record.limitation) {
    summary.limitation = record.limitation;
  }
  return summary;
}

export function applyCaptureBegin(
  existing: StoredFileChangeRecord | undefined,
  input: {
    relativePath: string;
    toolCallId: string;
    kind: ChangeKind;
    now: string;
    beforeHash?: string;
    beforeBlobId?: string;
    byteLengthBefore?: number;
    limitation?: ChangeLimitation;
  },
): StoredFileChangeRecord {
  if (existing) {
    return {
      ...existing,
      status: existing.status === "approved" || existing.status === "undone" ? existing.status : "capturing",
      latestToolCallId: input.toolCallId,
      updatedAt: input.now,
    };
  }
  const record: StoredFileChangeRecord = {
    relativePath: input.relativePath,
    kind: input.kind,
    status: input.limitation ? "unavailable" : "capturing",
    firstToolCallId: input.toolCallId,
    latestToolCallId: input.toolCallId,
    startedAt: input.now,
    updatedAt: input.now,
  };
  if (input.beforeHash) {
    record.beforeHash = input.beforeHash;
  }
  if (input.beforeBlobId) {
    record.beforeBlobId = input.beforeBlobId;
  }
  if (input.byteLengthBefore !== undefined) {
    record.byteLengthBefore = input.byteLengthBefore;
  }
  if (input.limitation) {
    record.limitation = input.limitation;
  }
  return record;
}

export function applyCaptureSettle(
  existing: StoredFileChangeRecord,
  input: {
    toolCallId: string;
    now: string;
    afterHash?: string;
    afterBlobId?: string;
    byteLengthAfter?: number;
    limitation?: ChangeLimitation;
    isError: boolean;
  },
): StoredFileChangeRecord {
  const next: StoredFileChangeRecord = {
    ...existing,
    latestToolCallId: input.toolCallId,
    updatedAt: input.now,
  };
  if (input.afterHash) {
    next.afterHash = input.afterHash;
  }
  if (input.afterBlobId) {
    next.afterBlobId = input.afterBlobId;
  }
  if (input.byteLengthAfter !== undefined) {
    next.byteLengthAfter = input.byteLengthAfter;
  }
  if (input.limitation) {
    next.limitation = input.limitation;
    next.status = "unavailable";
    return next;
  }
  if (existing.limitation) {
    next.status = "unavailable";
    return next;
  }
  if (existing.kind === "created") {
    next.status = typeof next.afterHash === "string" ? "pending" : "indeterminate";
    return next;
  }
  if (typeof next.beforeHash === "string" && typeof next.afterHash === "string") {
    next.status = "pending";
    return next;
  }
  next.status = input.isError ? "indeterminate" : "indeterminate";
  return next;
}

export type WorkspaceFileProbe =
  | { state: "absent" }
  | { state: "hashed"; hash: string }
  | { state: "limited"; limitation: ChangeLimitation };

export type WorkspaceFileRead =
  | { state: "absent" }
  | { state: "bytes"; bytes: Uint8Array; hash: string }
  | { state: "limited"; limitation: ChangeLimitation };

export function applyApproveTransition(
  record: StoredFileChangeRecord,
  probe: WorkspaceFileProbe,
): StoredFileChangeRecord {
  if (record.status === "conflict") {
    if (probe.state === "limited") {
      return { ...record, status: "unavailable", limitation: probe.limitation };
    }
    return { ...record, status: "approved" };
  }
  if (record.status !== "pending") {
    return record;
  }
  if (record.limitation || typeof record.afterHash !== "string") {
    return { ...record, status: "unavailable" };
  }
  if (probe.state === "limited") {
    return { ...record, status: "unavailable", limitation: probe.limitation };
  }
  if (probe.state !== "hashed" || probe.hash !== record.afterHash) {
    return { ...record, status: "conflict" };
  }
  return { ...record, status: "approved" };
}

export function applyCurrentHashConflict(
  record: StoredFileChangeRecord,
  probe: WorkspaceFileProbe,
): StoredFileChangeRecord {
  if (record.status !== "pending" && record.status !== "conflict") {
    return record;
  }
  if (probe.state === "limited") {
    return { ...record, status: "unavailable", limitation: probe.limitation };
  }
  if (typeof record.afterHash !== "string") {
    return record;
  }
  if (probe.state === "hashed" && probe.hash === record.afterHash) {
    return record.status === "conflict" ? { ...record, status: "pending" } : record;
  }
  if (record.status === "pending") {
    return { ...record, status: "conflict" };
  }
  return record;
}
