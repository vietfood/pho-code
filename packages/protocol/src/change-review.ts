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
  "too-complex",
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
export const MAX_CHANGE_OPERATIONS_PER_RUN = MAX_CHANGE_PATHS_PER_RUN * 8;
export const MAX_CHANGE_BLOB_BYTES_PER_RUN = 50 * 1024 * 1024;
export const MAX_CHANGE_LEDGER_BYTES = 250 * 1024 * 1024;
export const MAX_CHANGE_REVIEWS_ON_SNAPSHOT = 20;
export const MAX_CHANGE_FILES_ON_SUMMARY = 50;
export const MAX_CHANGE_DIFF_CHARS = 64_000;
export const MAX_CHANGE_FILE_VIEW_CHARS = 32_000;
export const MAX_CHANGE_DIFF_HUNKS_PER_PAGE = 40;
export const MAX_CHANGE_DIFF_LINES_PER_PAGE = 400;
export const MAX_CHANGE_DIFF_INPUT_LINES = 8_000;
export const MAX_CHANGE_DIFF_PATCH_CHARS = 1_048_576;
export const MAX_CHANGE_MANIFEST_BYTES = 1_048_576;
export const MAX_CHANGE_RELATIVE_PATH_CHARS = 1024;
export const MAX_CHANGE_SCOPE_ID_CHARS = 4096;
export const MAX_CHANGE_CURSOR_CHARS = 96;
export const MAX_CHANGE_PREVIEW_TOKEN_CHARS = 128;
export const MAX_CHANGE_TOOL_CALL_ID_CHARS = 128;
export const MAX_CHANGE_LEDGER_STRING_CHARS = 256;
export const MAX_CHANGE_CONTEXT_LINES = 8;
export const DEFAULT_CHANGE_CONTEXT_LINES = 3;
export const CHANGE_UNTRACKED_PATH_PREFIX = ".pho-code-untracked/";
export const CHANGE_UNREADABLE_RUN_ID = ".pho-code-unreadable";
export const CHANGE_CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/u;

export const CHANGE_LEDGER_DISCLOSURE =
  "Tracked write/edit snapshots are stored in Pho Code's application data directory. They are not encrypted at rest in personal v3 and are not part of the Pi transcript or Git history. Pending review is kept until you Approve or Undo. Approved and undone records are retained rather than silently deleted; if the 250 MiB ledger budget is reached, new snapshots are marked unavailable.";

export const CHANGE_REVIEW_COPY = {
  alreadyApplied:
    "",
  trackedOnly: "Changes",
  notAllChanges:
    "",
  captureCapped:
    "",
  ledgerUnreadable:
    "",
  undoMetadata:
    "",
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
  captureCapped?: boolean;
  ledgerUnreadable?: boolean;
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

export function hasDisallowedControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export function isChangeContentHash(value: unknown): value is string {
  return typeof value === "string" && CHANGE_CONTENT_HASH_PATTERN.test(value);
}

export function isPersistableRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_CHANGE_RELATIVE_PATH_CHARS) {
    return false;
  }
  if (value.startsWith("/") || value.includes("\\") || hasDisallowedControlChars(value)) {
    return false;
  }
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function isUntrackedChangePath(relativePath: string): boolean {
  return relativePath.startsWith(CHANGE_UNTRACKED_PATH_PREFIX);
}

export function isChangeScope(value: unknown): value is ChangeScope {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ChangeScope>;
  return isBoundedScopeId(candidate.workspaceId) && isBoundedScopeId(candidate.sessionId) && isBoundedScopeId(candidate.runId);
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

export function requireChangeRelativePath(value: unknown, operation: string): string {
  if (typeof value !== "string" || !isPersistableRelativePath(value.trim())) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "A workspace-relative tracked path is required.",
      operation,
      recoverable: true,
    });
  }
  return value.trim();
}

export function requireChangeRelativePaths(value: unknown, operation: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "relativePaths must be an array of unique tracked paths.",
      operation,
      recoverable: true,
    });
  }
  if (value.length > MAX_CHANGE_PATHS_PER_RUN) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: `relativePaths cannot include more than ${MAX_CHANGE_PATHS_PER_RUN} paths.`,
      operation,
      recoverable: true,
    });
  }
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const relativePath = requireChangeRelativePath(entry, operation);
    if (seen.has(relativePath)) {
      throw createHarnessError({
        code: HARNESS_ERROR_CODES.invalidCommand,
        message: "relativePaths must not contain duplicates.",
        operation,
        recoverable: true,
      });
    }
    seen.add(relativePath);
    paths.push(relativePath);
  }
  return paths;
}

export function requireChangeRevision(value: unknown, operation: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "expectedRevision is required.",
      operation,
      recoverable: true,
    });
  }
  return value;
}

export function requireChangePreviewToken(value: unknown, operation: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.trim().length > MAX_CHANGE_PREVIEW_TOKEN_CHARS) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "An Undo preview token is required.",
      operation,
      recoverable: true,
    });
  }
  if (hasDisallowedControlChars(value)) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: "An Undo preview token is required.",
      operation,
      recoverable: true,
    });
  }
  return value.trim();
}

export function requireChangeContextLines(value: unknown, operation: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_CHANGE_CONTEXT_LINES) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: `contextLines must be an integer from 0 to ${MAX_CHANGE_CONTEXT_LINES}.`,
      operation,
      recoverable: true,
    });
  }
  return value;
}

export interface ChangeFileViewCursor {
  line: number;
  char: number;
}

export interface ChangeDiffCursor {
  hunk: number;
  line: number;
  char: number;
}

export function parseChangeFileViewCursor(cursor: string | undefined, operation: string): ChangeFileViewCursor {
  if (cursor === undefined) {
    return { line: 0, char: 0 };
  }
  const raw = requireCursorString(cursor, operation);
  const match = /^line:(\d{1,10})(?::char:(\d{1,10}))?$/u.exec(raw);
  if (!match) {
    throw invalidCursor(operation);
  }
  return {
    line: parseCursorInt(match[1], operation),
    char: match[2] === undefined ? 0 : parseCursorInt(match[2], operation),
  };
}

export function parseChangeDiffCursor(cursor: string | undefined, operation: string): ChangeDiffCursor {
  if (cursor === undefined) {
    return { hunk: 0, line: 0, char: 0 };
  }
  const raw = requireCursorString(cursor, operation);
  const match = /^hunk:(\d{1,10})(?::line:(\d{1,10})(?::char:(\d{1,10}))?)?$/u.exec(raw);
  if (!match) {
    throw invalidCursor(operation);
  }
  return {
    hunk: parseCursorInt(match[1], operation),
    line: match[2] === undefined ? 0 : parseCursorInt(match[2], operation),
    char: match[3] === undefined ? 0 : parseCursorInt(match[3], operation),
  };
}

export function formatChangeFileViewCursor(cursor: ChangeFileViewCursor): string {
  return cursor.char > 0 ? `line:${cursor.line}:char:${cursor.char}` : `line:${cursor.line}`;
}

export function formatChangeDiffCursor(cursor: ChangeDiffCursor): string {
  if (cursor.char > 0) {
    return `hunk:${cursor.hunk}:line:${cursor.line}:char:${cursor.char}`;
  }
  if (cursor.line > 0) {
    return `hunk:${cursor.hunk}:line:${cursor.line}`;
  }
  return `hunk:${cursor.hunk}`;
}

function isBoundedScopeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    value.trim().length <= MAX_CHANGE_SCOPE_ID_CHARS &&
    !hasDisallowedControlChars(value)
  );
}

function requireCursorString(cursor: string, operation: string): string {
  if (cursor.length === 0 || cursor.length > MAX_CHANGE_CURSOR_CHARS) {
    throw invalidCursor(operation);
  }
  return cursor;
}

function parseCursorInt(raw: string | undefined, operation: string): number {
  if (raw === undefined || !/^\d{1,10}$/u.test(raw)) {
    throw invalidCursor(operation);
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000_000) {
    throw invalidCursor(operation);
  }
  return value;
}

function invalidCursor(operation: string) {
  return createHarnessError({
    code: HARNESS_ERROR_CODES.invalidCommand,
    message: "That review cursor is invalid.",
    operation,
    recoverable: true,
  });
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
