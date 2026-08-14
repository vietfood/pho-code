import type { RecentWorkspaceRecord, SessionCatalogEntry } from "@pho-code/protocol";

export interface WelcomeSessionRow {
  workspaceId: string;
  workspaceName: string;
  session: SessionCatalogEntry;
}

function timestamp(iso: string): number {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : 0;
}

export function lastOpenedProject(
  projects: readonly RecentWorkspaceRecord[],
): RecentWorkspaceRecord | undefined {
  if (projects.length === 0) {
    return undefined;
  }
  return [...projects].sort((left, right) => timestamp(right.lastOpenedAt) - timestamp(left.lastOpenedAt))[0];
}

export function collectJumpBackSessions(
  projects: readonly RecentWorkspaceRecord[],
  sessionsByWorkspace: Readonly<Record<string, readonly SessionCatalogEntry[]>>,
  limit = 3,
): WelcomeSessionRow[] {
  const rows: WelcomeSessionRow[] = [];
  for (const project of projects) {
    for (const session of sessionsByWorkspace[project.id] ?? []) {
      if (session.archived) {
        continue;
      }
      rows.push({
        workspaceId: project.id,
        workspaceName: project.displayName,
        session,
      });
    }
  }
  rows.sort((left, right) => timestamp(right.session.updatedAt) - timestamp(left.session.updatedAt));
  return rows.slice(0, limit);
}
