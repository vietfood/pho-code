import type { ReactNode } from "react";
import { FolderIcon, SquarePenIcon } from "lucide-react";
import type { PiRuntimeStatusSnapshot, RecentWorkspaceRecord, SessionCatalogEntry } from "@pho-code/protocol";
import { compactPath } from "./lib/compact-path";
import { timeOfDayGreeting } from "./lib/welcome-recents";
import { formatRelativeTime } from "./lib/relative-time";
import { collectJumpBackSessions, lastOpenedProject } from "./lib/welcome-recents";
import { workspaceTopbarClass } from "./lib/workspace-topbar";
import { SessionLeadingMark } from "./session-leading-mark";
import { SidebarToggleButton } from "./sidebar-toggle-button";
import { Button } from "./ui/button";

export function WorkspacePicker({
  recents,
  sessionsByWorkspace,
  appName,
  appVersion,
  runtimeStatus,
  onPick,
  onOpenRecent,
  onNewSession,
  onOpenSession,
  busy,
  sidebarCollapsed,
  onToggleSidebar,
  notice,
}: {
  recents: readonly RecentWorkspaceRecord[];
  sessionsByWorkspace: Readonly<Record<string, readonly SessionCatalogEntry[]>>;
  appName: string;
  appVersion: string;
  runtimeStatus: PiRuntimeStatusSnapshot;
  onPick: () => void;
  onOpenRecent: (workspaceId: string) => void;
  onNewSession: (workspaceId: string) => void;
  onOpenSession: (workspaceId: string, sessionId: string) => void;
  busy: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  notice?: ReactNode;
}) {
  const showToggle = Boolean(sidebarCollapsed && onToggleSidebar);
  const lastProject = lastOpenedProject(recents);
  const jumpBack = collectJumpBackSessions(recents, sessionsByWorkspace);
  const recentPreview = recents.slice(0, 3);

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-labelledby="workspace-heading">
      <header className={workspaceTopbarClass({ leadingInset: showToggle, className: "gap-3" })}>
        {showToggle && onToggleSidebar ? (
          <SidebarToggleButton
            collapsed
            onToggle={onToggleSidebar}
            className="text-muted-foreground hover:text-foreground"
          />
        ) : null}
        <span className="sr-only">
          {appName} {appVersion}
        </span>
      </header>
      {notice}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto px-6 py-10">
        <div className="w-full min-w-0 max-w-md overflow-hidden">
          <p className="text-[13px] font-medium text-muted-foreground">{appName}</p>
          {runtimeStatus.status !== "ready" ? (
            <p
              className={runtimeStatus.status === "failed" ? "mt-1 text-xs text-destructive-foreground" : "mt-1 text-xs text-muted-foreground"}
              data-testid="pi-runtime-status"
              role={runtimeStatus.status === "failed" ? "alert" : "status"}
            >
              {runtimeStatus.status === "failed" ? runtimeStatus.error.message : "Starting Pi…"}
            </p>
          ) : null}
          <h1
            id="workspace-heading"
            data-testid="workspace-heading"
            className="mt-1 text-2xl font-medium tracking-tight text-foreground"
          >
            {timeOfDayGreeting()}
          </h1>
          <div className="mt-6 flex flex-col gap-2">
            <Button className="w-full gap-2" onClick={onPick} disabled={busy} data-testid="welcome-open-project">
              <FolderIcon className="size-3.5" aria-hidden="true" />
              Open a project…
            </Button>
            {lastProject ? (
              <Button
                variant="outline"
                className="w-full min-w-0 gap-2"
                disabled={busy}
                data-testid="welcome-new-session"
                onClick={() => onNewSession(lastProject.id)}
              >
                <SquarePenIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">New session in {lastProject.displayName}</span>
              </Button>
            ) : null}
          </div>
          {recentPreview.length > 0 ? (
            <div className="mt-8 min-w-0 overflow-hidden">
              <h2 className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Recent projects
              </h2>
              <ul className="m-0 grid min-w-0 list-none p-0">
                {recentPreview.map((workspace) => (
                  <li key={workspace.id} className="min-w-0">
                    <button
                      type="button"
                      className="flex w-full min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-2 text-left hover:bg-accent disabled:opacity-50"
                      disabled={busy}
                      data-testid="welcome-recent-project"
                      title={workspace.path}
                      onClick={() => onOpenRecent(workspace.id)}
                    >
                      <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 overflow-hidden">
                        <strong className="block truncate text-sm font-medium">{workspace.displayName}</strong>
                        <span className="block truncate text-xs text-muted-foreground">
                          {compactPath(workspace.path, 42)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {jumpBack.length > 0 ? (
            <div className="mt-6 min-w-0 overflow-hidden">
              <h2 className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Jump back in
              </h2>
              <ul className="m-0 grid min-w-0 list-none p-0">
                {jumpBack.map((row) => {
                  const relative = formatRelativeTime(row.session.updatedAt);
                  const meta = relative ? `${row.workspaceName} · ${relative}` : row.workspaceName;
                  return (
                    <li key={`${row.workspaceId}:${row.session.sessionId}`} className="min-w-0">
                      <button
                        type="button"
                        className="flex w-full min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-2 text-left hover:bg-accent disabled:opacity-50"
                        disabled={busy}
                        data-testid="welcome-jump-back"
                        title={row.session.title}
                        onClick={() => onOpenSession(row.workspaceId, row.session.sessionId)}
                      >
                        <SessionLeadingMark activity={row.session.activity} />
                        <span className="min-w-0 flex-1 overflow-hidden">
                          <strong className="block truncate text-sm font-medium">{row.session.title}</strong>
                          <span className="block truncate text-xs text-muted-foreground">{meta}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
