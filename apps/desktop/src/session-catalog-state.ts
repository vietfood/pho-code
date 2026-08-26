import {
  sessionKeyEquals,
  sessionKeyId,
  type SessionActivitySummary,
  type SessionCatalogEntry,
  type SessionSummary,
} from "@pho-code/protocol";

export function idleCatalogActivity(session: SessionSummary, archived = false): SessionActivitySummary {
  return {
    ...(session.backendId ? { backendId: session.backendId } : {}),
    workspaceId: session.workspaceId,
    sessionId: session.id,
    phase: "idle",
    selected: false,
    archived,
    unread: false,
    updatedAt: session.updatedAt,
  };
}

export function upsertCatalogSession(
  current: Record<string, SessionCatalogEntry[]>,
  session: SessionSummary,
): Record<string, SessionCatalogEntry[]> {
  const workspaceId = session.workspaceId;
  const entries = current[workspaceId] ?? [];
  const key = { ...(session.backendId ? { backendId: session.backendId } : {}), workspaceId, sessionId: session.id };
  const index = entries.findIndex((entry) => sessionKeyEquals(entry, key));
  if (index < 0) {
    const entry: SessionCatalogEntry = {
      ...(session.backendId ? { backendId: session.backendId } : {}),
      workspaceId,
      sessionId: session.id,
      title: session.title,
      updatedAt: session.updatedAt,
      archived: false,
      activity: idleCatalogActivity(session),
      ...(session.preview ? { preview: session.preview } : {}),
    };
    return { ...current, [workspaceId]: [entry, ...entries] };
  }
  const existing = entries[index];
  if (
    existing.title === session.title &&
    existing.updatedAt === session.updatedAt &&
    (existing.preview ?? undefined) === (session.preview ?? undefined)
  ) {
    return current;
  }
  const next = [...entries];
  const updated: SessionCatalogEntry = {
    ...existing,
    title: session.title,
    updatedAt: session.updatedAt,
  };
  if (session.preview) {
    updated.preview = session.preview;
  } else {
    delete updated.preview;
  }
  next[index] = updated;
  return { ...current, [workspaceId]: next };
}

export function removeCatalogSession(
  current: Record<string, SessionCatalogEntry[]>,
  workspaceId: string,
  sessionId: string,
  backendId?: string,
): Record<string, SessionCatalogEntry[]> {
  const entries = current[workspaceId];
  if (!entries) {
    return current;
  }
  const key = { ...(backendId ? { backendId } : {}), workspaceId, sessionId };
  const next = entries.filter((entry) => !sessionKeyEquals(entry, key));
  if (next.length === entries.length) {
    return current;
  }
  return { ...current, [workspaceId]: next };
}

export function mergeActivityIntoCatalog(
  current: Record<string, SessionCatalogEntry[]>,
  activity: readonly SessionActivitySummary[],
): Record<string, SessionCatalogEntry[]> {
  if (activity.length === 0) {
    return current;
  }
  const byId = new Map(activity.map((entry) => [sessionKeyId(entry), entry]));
  let changed = false;
  const next: Record<string, SessionCatalogEntry[]> = {};
  for (const [workspaceId, entries] of Object.entries(current)) {
    next[workspaceId] = entries.map((entry) => {
      const updated = byId.get(sessionKeyId(entry));
      if (!updated) {
        return entry;
      }
      changed = true;
      return { ...entry, activity: updated };
    });
  }
  return changed ? next : current;
}
