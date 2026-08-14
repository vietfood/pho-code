import {
  sessionActivityPhase,
  sessionKeyEquals,
  type SessionActivitySummary,
  type SessionCatalogEntry,
  type SessionCatalogScope,
  type SessionKey,
  type SessionOutcome,
  type SessionSummary,
} from "@pho-code/protocol";
import { getSessionLifecycle, type AppMetadata } from "./metadata";

export function isArchivedSession(metadata: AppMetadata, key: SessionKey): boolean {
  return Boolean(getSessionLifecycle(metadata, key)?.archivedAt);
}

export function unreadOutcomeFor(
  metadata: AppMetadata,
  key: SessionKey,
  selected: boolean,
): SessionOutcome | undefined {
  if (selected) {
    return undefined;
  }
  const record = getSessionLifecycle(metadata, key);
  if (!record?.lastOutcome) {
    return undefined;
  }
  if (record.lastViewedAt && record.lastOutcomeAt && record.lastViewedAt >= record.lastOutcomeAt) {
    return undefined;
  }
  return record.lastOutcome;
}

export function projectCatalogActivity(
  metadata: AppMetadata,
  key: SessionKey,
  live: SessionActivitySummary | undefined,
  selected: boolean,
  fallbackUpdatedAt?: string,
): SessionActivitySummary {
  const archived = isArchivedSession(metadata, key);
  const unreadOutcome = unreadOutcomeFor(metadata, key, selected);
  const livePhase = live?.phase ?? "idle";
  return {
    workspaceId: key.workspaceId,
    sessionId: key.sessionId,
    phase: sessionActivityPhase({
      attention: livePhase === "attention",
      working: livePhase === "working" || livePhase === "attention",
      ...(unreadOutcome ? { unreadOutcome } : {}),
    }),
    selected,
    archived,
    unread: unreadOutcome !== undefined,
    updatedAt: live?.updatedAt ?? fallbackUpdatedAt ?? "1970-01-01T00:00:00.000Z",
    ...(live?.runId ? { runId: live.runId } : {}),
    ...(live?.startedAt ? { startedAt: live.startedAt } : {}),
  };
}

export function projectCatalogEntry(
  metadata: AppMetadata,
  session: SessionSummary,
  live: SessionActivitySummary | undefined,
  selected: boolean,
): SessionCatalogEntry {
  const key = { workspaceId: session.workspaceId, sessionId: session.id };
  const entry: SessionCatalogEntry = {
    workspaceId: session.workspaceId,
    sessionId: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    archived: isArchivedSession(metadata, key),
    activity: projectCatalogActivity(metadata, key, live, selected, session.updatedAt),
  };
  if (session.preview) {
    entry.preview = session.preview;
  }
  return entry;
}

export function filterCatalogScope(
  entries: readonly SessionCatalogEntry[],
  scope: SessionCatalogScope,
): SessionCatalogEntry[] {
  switch (scope) {
    case "active":
      return entries.filter((entry) => !entry.archived);
    case "archived":
      return entries.filter((entry) => entry.archived);
    case "all":
      return [...entries];
    default: {
      const exhaustive: never = scope;
      return exhaustive;
    }
  }
}

export function selectedSessionKey(session: { session: { id: string }; workspace: { id: string } } | undefined): SessionKey | undefined {
  if (!session) {
    return undefined;
  }
  return { workspaceId: session.workspace.id, sessionId: session.session.id };
}

export function isSelectedSession(selected: SessionKey | undefined, key: SessionKey): boolean {
  return selected !== undefined && sessionKeyEquals(selected, key);
}
