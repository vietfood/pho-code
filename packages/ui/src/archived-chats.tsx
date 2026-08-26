import { ArchiveRestoreIcon, Trash2Icon } from "lucide-react";
import type { RecentWorkspaceRecord, SessionCatalogEntry } from "@pho-code/protocol";
import { compactPath } from "./lib/compact-path";
import { formatRelativeTime } from "./lib/relative-time";
import { groupArchivedChatsByProject, type ArchivedChatGroup } from "./lib/archived-chats";
import { SessionActivityDot } from "./session-activity-dot";
import { Button } from "./ui/button";

export function ArchivedChatsSection({
  projects,
  sessionsByWorkspace,
  busy,
  onRestore,
  onOpen,
  onRemove,
  onRemoveAll,
}: {
  projects: readonly RecentWorkspaceRecord[];
  sessionsByWorkspace: Readonly<Record<string, readonly SessionCatalogEntry[]>>;
  busy: boolean;
  onRestore: (workspaceId: string, sessionId: string, backendId?: string) => void;
  onOpen: (workspaceId: string, sessionId: string, backendId?: string) => void;
  onRemove: (workspaceId: string, sessionId: string, backendId?: string) => void;
  onRemoveAll: (workspaceId: string) => void;
}) {
  const groups = groupArchivedChatsByProject(projects, sessionsByWorkspace);
  return (
    <section className="grid gap-3" aria-labelledby="archived-heading" data-testid="archived-chats">
      <h2 id="archived-heading" className="text-sm font-medium">
        Archived chats
      </h2>
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">No archived chats.</p>
      ) : (
        <div className="grid gap-4">
          {groups.map((group) => (
            <ArchivedProjectGroup
              key={group.project.id}
              group={group}
              busy={busy}
              onRestore={onRestore}
              onOpen={onOpen}
              onRemove={onRemove}
              onRemoveAll={onRemoveAll}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ArchivedProjectGroup({
  group,
  busy,
  onRestore,
  onOpen,
  onRemove,
  onRemoveAll,
}: {
  group: ArchivedChatGroup;
  busy: boolean;
  onRestore: (workspaceId: string, sessionId: string, backendId?: string) => void;
  onOpen: (workspaceId: string, sessionId: string, backendId?: string) => void;
  onRemove: (workspaceId: string, sessionId: string, backendId?: string) => void;
  onRemoveAll: (workspaceId: string) => void;
}) {
  return (
    <div className="grid gap-1.5" data-testid="archived-project-group">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium" title={group.project.displayName}>
            {group.project.displayName}
          </p>
          <p className="truncate text-[0.625rem] text-muted-foreground" title={group.project.path}>
            {compactPath(group.project.path)}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-[0.6875rem] text-muted-foreground"
          data-testid="remove-all-archived-sessions"
          disabled={busy}
          onClick={() => onRemoveAll(group.project.id)}
        >
          Delete all
        </Button>
      </div>
      <ul className="m-0 grid list-none gap-1 p-0">
        {group.sessions.map((session) => (
          <ArchivedChatRow
            key={`${session.backendId ?? "pi"}:${session.sessionId}`}
            session={session}
            busy={busy}
            onRestore={() => onRestore(session.workspaceId, session.sessionId, session.backendId)}
            onOpen={() => onOpen(session.workspaceId, session.sessionId, session.backendId)}
            onRemove={() => onRemove(session.workspaceId, session.sessionId, session.backendId)}
          />
        ))}
      </ul>
    </div>
  );
}

function ArchivedChatRow({
  session,
  busy,
  onRestore,
  onOpen,
  onRemove,
}: {
  session: SessionCatalogEntry;
  busy: boolean;
  onRestore: () => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const relative = formatRelativeTime(session.updatedAt);
  return (
    <li className="flex min-w-0 items-start gap-2 rounded-md border border-border/60 px-2 py-1.5">
      <SessionActivityDot activity={session.activity} className="mt-1 size-3.5" />
      <button
        type="button"
        className="min-w-0 flex-1 text-left disabled:opacity-50"
        data-testid="archived-chat-item"
        disabled={busy}
        onClick={onOpen}
      >
        <strong className="block truncate text-xs font-medium">{session.title}</strong>
        {session.preview ? (
          <span className="mt-0.5 block truncate text-[0.625rem] text-muted-foreground">{session.preview}</span>
        ) : null}
        {relative ? (
          <span className="mt-0.5 block text-[0.5625rem] tabular-nums text-muted-foreground">{relative}</span>
        ) : null}
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          size="icon-sm"
          variant="ghost"
          data-testid="restore-session"
          disabled={busy}
          aria-label={`Restore ${session.title}`}
          onClick={onRestore}
        >
          <ArchiveRestoreIcon className="size-3.5" aria-hidden="true" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          data-testid="remove-session"
          disabled={busy}
          aria-label={`Move ${session.title} to Trash`}
          onClick={onRemove}
        >
          <Trash2Icon className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
