import { createHarnessError, HARNESS_ERROR_CODES } from "./errors";

export const CHANGE_SCOPE_FIELDS = ["workspaceId", "sessionId", "runId"] as const;

export interface ChangeScope {
  workspaceId: string;
  sessionId: string;
  runId: string;
}

export const REVIEW_STATUSES = [
  "capturing",
  "pending",
  "approved",
  "undoing",
  "undone",
  "conflict",
  "unavailable",
  "indeterminate",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const CHANGE_KINDS = ["created", "modified"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export const CHANGE_LIMITATIONS = [
  "too-large",
  "binary",
  "unsupported-kind",
  "outside-workspace",
  "capture-failed",
  "sensitive",
] as const;

export type ChangeLimitation = (typeof CHANGE_LIMITATIONS)[number];

export const CHANGE_FILE_VERSIONS = ["before", "agent", "current"] as const;
export type ChangeFileVersion = (typeof CHANGE_FILE_VERSIONS)[number];

export const CHANGE_DIFF_LINE_KINDS = ["context", "added", "removed"] as const;
export type ChangeDiffLineKind = (typeof CHANGE_DIFF_LINE_KINDS)[number];

export const CHANGE_LINE_ENDINGS = ["lf", "crlf", "mixed"] as const;
export type ChangeLineEnding = (typeof CHANGE_LINE_ENDINGS)[number];

/** Source-owned snapshot/review bounds. Not Settings. */
export const MAX_CHANGE_SNAPSHOT_BYTES = 2 * 1024 * 1024;
export const MAX_CHANGE_PATHS_PER_RUN = 200;
export const MAX_CHANGE_BLOB_BYTES_PER_RUN = 50 * 1024 * 1024;
export const MAX_CHANGE_LEDGER_BYTES = 250 * 1024 * 1024;
export const MAX_CHANGE_REVIEWS_ON_SNAPSHOT = 20;
export const MAX_CHANGE_FILES_ON_SUMMARY = 50;
export const MAX_CHANGE_DIFF_CHARS = 64_000;
export const MAX_CHANGE_FILE_VIEW_CHARS = 32_000;
export const MAX_CHANGE_DIFF_HUNKS_PER_PAGE = 40;
export const MAX_CHANGE_DIFF_LINES_PER_PAGE = 400;
export const MAX_CHANGE_RELATIVE_PATH_CHARS = 1024;

export const CHANGE_LEDGER_DISCLOSURE =
  "Tracked write/edit snapshots are stored in Pho Code's application data directory. They are not encrypted at rest in personal v3 and are not part of the Pi transcript or Git history. Pending review is kept until you Approve or Undo. Approved and undone records are retained rather than silently deleted; if the 250 MiB ledger budget is reached, new snapshots are marked unavailable.";

export const CHANGE_REVIEW_COPY = {
  alreadyApplied:
    "These writes and edits are already on disk. Approve records that you accept the current file; it does not write the files again. Undo restores the captured before-image only when the current file still matches the agent result.",
  trackedOnly: "Changes",
  notAllChanges:
    "Only Pi write and edit calls are tracked. Shell commands and other tools are not. Undo all is unavailable because restoring several files plus Trash cannot be made atomic.",
} as const;

export interface FileChangeSummary {
  relativePath: string;
  kind: ChangeKind;
  status: ReviewStatus;
  firstToolCallId: string;
  latestToolCallId: string;
  startedAt: string;
  updatedAt: string;
  beforeHash?: string;
  afterHash?: string;
  byteLengthBefore?: number;
  byteLengthAfter?: number;
  limitation?: ChangeLimitation;
}

export interface ChangeReviewSetSummary extends ChangeScope {
  revision: number;
  pendingCount: number;
  approvedCount: number;
  conflictCount: number;
  unavailableCount: number;
  fileCount: number;
  filesTruncated: boolean;
  files: FileChangeSummary[];
  toolCallIds: string[];
  updatedAt: string;
}

export type ChangeReviewSetSnapshot = ChangeReviewSetSummary;

export type GetChangeReviewSetInput = ChangeScope;

export interface GetChangeDiffInput extends ChangeScope {
  relativePath: string;
  cursor?: string;
  contextLines?: number;
}

export interface GetChangeFileViewInput extends ChangeScope {
  relativePath: string;
  version: ChangeFileVersion;
  cursor?: string;
}

export interface ApproveChangesInput extends ChangeScope {
  relativePaths?: string[];
  expectedRevision: number;
}

export const UNDO_ACTIONS = ["restore", "move-to-trash"] as const;
export type UndoAction = (typeof UNDO_ACTIONS)[number];

export interface PrepareUndoChangesInput extends ChangeScope {
  relativePath: string;
  expectedRevision: number;
}

export interface UndoPreview extends ChangeScope {
  relativePath: string;
  action: UndoAction;
  previewToken: string;
  expiresAt: string;
  effect: string;
}

export interface ApplyUndoChangesInput extends ChangeScope {
  previewToken: string;
}

export interface ChangeDiffLine {
  kind: ChangeDiffLineKind;
  text: string;
  beforeLine?: number;
  afterLine?: number;
}

export interface ChangeDiffHunk {
  header: string;
  lines: ChangeDiffLine[];
}

export interface ChangeDiffPage {
  relativePath: string;
  status: ReviewStatus;
  hunks: ChangeDiffHunk[];
  truncated: boolean;
  lineEnding?: ChangeLineEnding;
  language?: string;
  nextCursor?: string;
  limitation?: ChangeLimitation;
}

export interface ChangeFileViewPage {
  relativePath: string;
  version: ChangeFileVersion;
  status: ReviewStatus;
  truncated: boolean;
  text?: string;
  language?: string;
  lineEnding?: ChangeLineEnding;
  nextCursor?: string;
  limitation?: ChangeLimitation;
}

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return typeof value === "string" && (REVIEW_STATUSES as readonly string[]).includes(value);
}

export function isChangeKind(value: unknown): value is ChangeKind {
  return value === "created" || value === "modified";
}

export function isChangeLimitation(value: unknown): value is ChangeLimitation {
  return typeof value === "string" && (CHANGE_LIMITATIONS as readonly string[]).includes(value);
}

export function isChangeFileVersion(value: unknown): value is ChangeFileVersion {
  return value === "before" || value === "agent" || value === "current";
}

export function isUndoAction(value: unknown): value is UndoAction {
  return typeof value === "string" && (UNDO_ACTIONS as readonly string[]).includes(value);
}

export function isChangeScope(value: unknown): value is ChangeScope {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ChangeScope>;
  return (
    typeof candidate.workspaceId === "string" &&
    candidate.workspaceId.trim() !== "" &&
    typeof candidate.sessionId === "string" &&
    candidate.sessionId.trim() !== "" &&
    typeof candidate.runId === "string" &&
    candidate.runId.trim() !== ""
  );
}

export function changeScopeId(scope: ChangeScope): string {
  return `${scope.workspaceId}\0${scope.sessionId}\0${scope.runId}`;
}

export function changeScopeEquals(left: ChangeScope, right: ChangeScope): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.sessionId === right.sessionId &&
    left.runId === right.runId
  );
}

export function requireChangeScope(value: unknown, operation: string): ChangeScope {
  if (!isChangeScope(value)) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: `${operation} requires workspaceId, sessionId, and runId.`,
      operation,
      recoverable: true,
    });
  }
  return {
    workspaceId: value.workspaceId.trim(),
    sessionId: value.sessionId.trim(),
    runId: value.runId.trim(),
  };
}

export function emptyChangeReviews(): ChangeReviewSetSummary[] {
  return [];
}

export function reviewSummaryForToolCall(
  reviews: readonly ChangeReviewSetSummary[] | undefined,
  callId: string,
): ChangeReviewSetSummary | undefined {
  if (!reviews || callId.trim() === "") {
    return undefined;
  }
  return reviews.find((review) => review.toolCallIds.includes(callId));
}

export function latestChangeReview(
  reviews: readonly ChangeReviewSetSummary[] | undefined,
): ChangeReviewSetSummary | undefined {
  if (!reviews || reviews.length === 0) {
    return undefined;
  }
  return reviews.reduce((latest, review) => (review.updatedAt >= latest.updatedAt ? review : latest));
}

export function reviewFileCount(summary: ChangeReviewSetSummary): number {
  return summary.fileCount;
}

export function formatChangedFileCount(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

export function blockingReviewStatuses(status: ReviewStatus): boolean {
  switch (status) {
    case "capturing":
    case "pending":
    case "undoing":
    case "conflict":
    case "indeterminate":
      return true;
    case "approved":
    case "undone":
    case "unavailable":
      return false;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
