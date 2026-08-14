import { createHarnessError, HARNESS_ERROR_CODES } from "./errors";
import type { RecentWorkspaceRecord } from "./workspace";

export const SESSION_ACTIVITY_PHASES = ["idle", "working", "attention", "completed", "failed"] as const;

export type SessionActivityPhase = (typeof SESSION_ACTIVITY_PHASES)[number];

export const SESSION_CATALOG_SCOPES = ["active", "archived", "all"] as const;

export type SessionCatalogScope = (typeof SESSION_CATALOG_SCOPES)[number];

export const SESSION_OUTCOMES = ["completed", "failed"] as const;

export type SessionOutcome = (typeof SESSION_OUTCOMES)[number];

export interface SessionKey {
  workspaceId: string;
  sessionId: string;
}

export interface SessionActivitySummary extends SessionKey {
  phase: SessionActivityPhase;
  selected: boolean;
  archived: boolean;
  unread: boolean;
  runId?: string;
  startedAt?: string;
  updatedAt: string;
}

export interface ListSessionCatalogInput {
  workspaceId: string;
  scope: SessionCatalogScope;
}

export type GetSessionSnapshotInput = SessionKey;

export interface SessionCatalogEntry extends SessionKey {
  title: string;
  updatedAt: string;
  preview?: string;
  archived: boolean;
  activity: SessionActivitySummary;
}

export type ArchiveSessionInput = SessionKey;

export type RestoreSessionInput = SessionKey;

export type PrepareRemoveSessionInput = SessionKey;

export interface PrepareRemoveSessionResult extends SessionKey {
  title: string;
  workspaceDisplayName: string;
  confirmationToken: string;
  sharedAgentDir: boolean;
  expiresAt: string;
}

export interface RemoveSessionInput extends SessionKey {
  confirmationToken: string;
}

export interface RemoveSessionResult extends SessionKey {
  title: string;
  method: string;
  recoverable: true;
}

export interface PrepareRemoveProjectInput {
  workspaceId: string;
}

export interface PrepareRemoveProjectResult {
  workspaceId: string;
  displayName: string;
  path: string;
  sessionCount: number;
  confirmationToken: string;
  sharedAgentDir: boolean;
  expiresAt: string;
}

export interface RemoveProjectInput {
  workspaceId: string;
  confirmationToken: string;
}

export interface RemoveProjectResult {
  workspaceId: string;
  removedSessionCount: number;
  method: string;
  recoverable: true;
  recentWorkspaces: RecentWorkspaceRecord[];
}

const ACTIVITY_RANK: Record<SessionActivityPhase, number> = {
  attention: 5,
  working: 4,
  failed: 3,
  completed: 2,
  idle: 1,
};

export function isSessionActivityPhase(value: unknown): value is SessionActivityPhase {
  return typeof value === "string" && (SESSION_ACTIVITY_PHASES as readonly string[]).includes(value);
}

export function isSessionCatalogScope(value: unknown): value is SessionCatalogScope {
  return value === "active" || value === "archived" || value === "all";
}

export function isSessionOutcome(value: unknown): value is SessionOutcome {
  return value === "completed" || value === "failed";
}

export function isSessionKey(value: unknown): value is SessionKey {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SessionKey>;
  return (
    typeof candidate.workspaceId === "string" &&
    candidate.workspaceId.trim() !== "" &&
    typeof candidate.sessionId === "string" &&
    candidate.sessionId.trim() !== ""
  );
}

export function sessionKeyEquals(left: SessionKey, right: SessionKey): boolean {
  return left.workspaceId === right.workspaceId && left.sessionId === right.sessionId;
}

export function sessionKeyId(key: SessionKey): string {
  return `${encodeURIComponent(key.workspaceId)}\u001f${encodeURIComponent(key.sessionId)}`;
}

export function parseSessionKeyId(value: string): SessionKey | undefined {
  const separator = value.indexOf("\u001f");
  if (separator <= 0 || separator === value.length - 1) {
    return undefined;
  }
  const workspaceId = decodeURIComponent(value.slice(0, separator));
  const sessionId = decodeURIComponent(value.slice(separator + 1));
  if (workspaceId.trim() === "" || sessionId.trim() === "") {
    return undefined;
  }
  return { workspaceId, sessionId };
}

export function requireMatchingSessionKey(
  expected: SessionKey,
  actual: Partial<SessionKey> | undefined,
  operation: string,
): SessionKey {
  if (!isSessionKey(actual)) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidCommand,
      message: `${operation} requires workspaceId and sessionId.`,
      operation,
      recoverable: true,
    });
  }
  if (!sessionKeyEquals(expected, actual)) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.sessionNotFound,
      message: `${operation} targeted a different workspace or session.`,
      operation,
      recoverable: true,
    });
  }
  return actual;
}

export function activityRank(summary: Pick<SessionActivitySummary, "phase" | "unread">): number {
  if (summary.phase === "completed" && !summary.unread) {
    return ACTIVITY_RANK.idle;
  }
  if (summary.phase === "failed" && !summary.unread) {
    return ACTIVITY_RANK.idle;
  }
  return ACTIVITY_RANK[summary.phase];
}

export function compareSessionActivity(
  left: Pick<SessionActivitySummary, "phase" | "unread">,
  right: Pick<SessionActivitySummary, "phase" | "unread">,
): number {
  return activityRank(right) - activityRank(left);
}

/** Owner-facing indicator phase, or undefined when the row should look idle. */
export function visibleActivityPhase(
  summary: Pick<SessionActivitySummary, "phase" | "unread">,
): SessionActivityPhase | undefined {
  if (activityRank(summary) <= ACTIVITY_RANK.idle) {
    return undefined;
  }
  return summary.phase;
}

export function sessionActivityPhase(input: {
  attention: boolean;
  working: boolean;
  unreadOutcome?: SessionOutcome;
}): SessionActivityPhase {
  if (input.attention) {
    return "attention";
  }
  if (input.working) {
    return "working";
  }
  if (input.unreadOutcome === "failed") {
    return "failed";
  }
  if (input.unreadOutcome === "completed") {
    return "completed";
  }
  return "idle";
}
