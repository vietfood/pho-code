import { useEffect, useState } from "react";
import { ChevronDownIcon, FolderPlusIcon, InfoIcon, SettingsIcon, SquarePenIcon } from "lucide-react";
import type { BootstrapState, RecentWorkspaceRecord, SessionSummary } from "@pho-code/protocol";
import { DiagnosticsPanel } from "./diagnostics-panel";
import { cn } from "./lib/cn";
import { isMacDesktop } from "./lib/platform";
import { formatRelativeTime } from "./lib/relative-time";
import { Button } from "./ui/button";

// Desktop sidebar chrome adapted from refs/t3code/apps/web/src/components/sidebar/SidebarChrome.tsx
// and AppSidebarLayout.tsx (MIT, T3 Tools Inc., 6bc6cb6). Multi-project collapse is harness-owned;
// Cursor-inspired action/session density is harness-owned visual language (no Cursor source).
// Settings, branding, git, and mobile sheets omitted.

export function AppSidebar({
  projects,
  activeWorkspaceId,
  selectedSessionId,
  sessionsByWorkspace,
  bootstrap,
  onAddProject,
  onNewSession,
  onOpenSession,
  onExpandProject,
  onOpenSettings,
  busy,
}: {
  projects: readonly RecentWorkspaceRecord[];
  activeWorkspaceId?: string;
  selectedSessionId?: string;
  sessionsByWorkspace: Readonly<Record<string, readonly SessionSummary[]>>;
  bootstrap: BootstrapState;
  onAddProject: () => void;
  onNewSession: (workspaceId: string) => void;
  onOpenSession: (workspaceId: string, sessionId: string) => void;
  onExpandProject: (workspaceId: string) => void;
  onOpenSettings: () => void;
  busy: boolean;
}) {
  const mac = isMacDesktop();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [enterSessions, setEnterSessions] = useState<Record<string, boolean>>({});
  const canNewSession = Boolean(activeWorkspaceId);

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    setExpanded((current) => (current[activeWorkspaceId] ? current : { ...current, [activeWorkspaceId]: true }));
  }, [activeWorkspaceId]);

  function toggleProject(workspaceId: string): void {
    setExpanded((current) => {
      const nextOpen = !current[workspaceId];
      if (nextOpen) {
        onExpandProject(workspaceId);
        setEnterSessions((pending) => ({ ...pending, [workspaceId]: true }));
      }
      return { ...current, [workspaceId]: nextOpen };
    });
  }

  return (
    <aside
      className="flex h-full w-[var(--sidebar-width)] min-w-0 shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground"
      aria-label="Projects"
    >
      <header
        className={cn(
          "workspace-topbar drag-region min-w-0 justify-end overflow-hidden px-2",
          mac ? "pl-[var(--workspace-titlebar-inset)]" : undefined,
        )}
      >
        <Button
          size="icon-sm"
          variant="ghost"
          data-testid="add-project"
          onClick={onAddProject}
          disabled={busy}
          aria-label="Add project"
          className="size-6 shrink-0 text-sidebar-muted-foreground hover:text-sidebar-foreground"
        >
          <FolderPlusIcon className="size-3" aria-hidden="true" />
        </Button>
      </header>

      <div className="min-w-0 overflow-hidden px-1.5 pb-1">
        <button
          type="button"
          className="flex w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-md px-1.5 py-1 text-left text-[12px] text-sidebar-foreground hover:bg-sidebar-row-hover disabled:opacity-40"
          data-testid="new-session"
          disabled={busy || !canNewSession}
          onClick={() => {
            if (activeWorkspaceId) {
              onNewSession(activeWorkspaceId);
            }
          }}
        >
          <SquarePenIcon className="size-3 shrink-0 text-sidebar-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">New session</span>
        </button>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-1.5 pb-2">
        {projects.length > 0 ? (
          <ul className="m-0 grid list-none gap-px p-0" data-testid="project-list">
            {projects.map((project) => {
              const open = expanded[project.id] === true;
              const sessions = sessionsByWorkspace[project.id] ?? [];
              const active = project.id === activeWorkspaceId;
              return (
                <li key={project.id} className="min-w-0 overflow-hidden rounded-md">
                  <button
                    type="button"
                    className={cn(
                      "flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-md px-1.5 py-1 text-left text-[12px] hover:bg-sidebar-row-hover",
                      active && "bg-sidebar-row-selected font-medium",
                    )}
                    data-testid="project-item"
                    aria-expanded={open}
                    onClick={() => toggleProject(project.id)}
                  >
                    <ChevronDownIcon
                      className={cn(
                        "size-3 shrink-0 text-sidebar-muted-foreground transition-transform motion-reduce:transition-none",
                        !open && "-rotate-90",
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate" title={project.path}>
                      {project.displayName}
                    </span>
                  </button>
                  {open ? (
                    <div
                      className={cn(
                        "mt-px min-w-0 space-y-px overflow-hidden pb-0.5 pl-3",
                        enterSessions[project.id] && "project-sessions-enter",
                      )}
                      onAnimationEnd={() => {
                        setEnterSessions((pending) =>
                          pending[project.id] ? { ...pending, [project.id]: false } : pending,
                        );
                      }}
                    >
                      {sessions.length > 0 ? (
                        <ul className="m-0 grid min-w-0 list-none gap-px p-0">
                          {sessions.map((session) => {
                            const selected = session.id === selectedSessionId && active;
                            const relative = formatRelativeTime(session.updatedAt);
                            return (
                              <li key={session.id} className="min-w-0 overflow-hidden">
                                <button
                                  type="button"
                                  className={cn(
                                    "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-1.5 overflow-hidden rounded-md px-1.5 py-1 text-left hover:bg-sidebar-row-hover disabled:opacity-50",
                                    selected && "bg-sidebar-row-selected",
                                  )}
                                  data-testid="session-item"
                                  aria-current={selected}
                                  disabled={busy}
                                  onClick={() => onOpenSession(project.id, session.id)}
                                >
                                  <span className="min-w-0 overflow-hidden">
                                    <strong className="block truncate text-[12px] font-medium leading-4">
                                      {session.title}
                                    </strong>
                                    {session.preview ? (
                                      <span className="mt-0.5 block truncate text-[10px] leading-tight text-sidebar-muted-foreground">
                                        {session.preview}
                                      </span>
                                    ) : null}
                                  </span>
                                  {relative ? (
                                    <span className="mt-px shrink-0 text-[9px] leading-4 tabular-nums text-sidebar-muted-foreground">
                                      {relative}
                                    </span>
                                  ) : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="px-1.5 py-1 text-[11px] text-muted-foreground">No saved sessions yet.</p>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-1.5 text-[11px] text-muted-foreground">Add a project to start.</p>
        )}
      </div>
      <div className="min-w-0 overflow-hidden px-1.5 py-1.5">
        <button
          type="button"
          className="mb-1 flex w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-md px-1.5 py-1 text-left text-[12px] text-sidebar-foreground hover:bg-sidebar-row-hover"
          data-testid="open-settings"
          onClick={onOpenSettings}
        >
          <SettingsIcon className="size-3 shrink-0 text-sidebar-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">Settings</span>
        </button>
        <div className="flex min-w-0 items-start gap-1.5 overflow-hidden rounded-md px-1.5 py-1 text-sidebar-muted-foreground">
          <InfoIcon className="mt-0.5 size-3 shrink-0 opacity-70" aria-hidden="true" />
          <div className="min-w-0 flex-1 overflow-hidden">
            <DiagnosticsPanel state={bootstrap} />
          </div>
        </div>
      </div>
    </aside>
  );
}
