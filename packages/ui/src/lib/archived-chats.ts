import type { RecentWorkspaceRecord, SessionCatalogEntry } from "@pho-code/protocol";

export interface ArchivedChatGroup {
  project: RecentWorkspaceRecord;
  sessions: SessionCatalogEntry[];
}

export function groupArchivedChatsByProject(
  projects: readonly RecentWorkspaceRecord[],
  sessionsByWorkspace: Readonly<Record<string, readonly SessionCatalogEntry[]>>,
): ArchivedChatGroup[] {
  const groups: ArchivedChatGroup[] = [];
  for (const project of projects) {
    const sessions = (sessionsByWorkspace[project.id] ?? [])
      .filter((session) => session.archived)
      .slice()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    if (sessions.length > 0) {
      groups.push({ project, sessions });
    }
  }
  return groups;
}
