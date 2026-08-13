import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDownIcon,
  FolderIcon,
  FolderPlusIcon,
  InfoIcon,
  MessageSquareIcon,
  PlusIcon,
  SettingsIcon,
  SquarePenIcon,
} from "lucide-react";
import type { BootstrapState, RecentWorkspaceRecord, SessionSummary } from "@pho-code/protocol";
import { DiagnosticsPanel } from "./diagnostics-panel";
import { compactPath } from "./lib/compact-path";
import { cn } from "./lib/cn";
import { isMacDesktop } from "./lib/platform";
import { formatRelativeTime } from "./lib/relative-time";
import { SidebarToggleButton } from "./sidebar-toggle-button";
import { Button } from "./ui/button";

// Desktop sidebar chrome adapted from refs/t3code sidebar layout and denser
// project rows inspired by refs/pi-gui/apps/desktop/src/sidebar.tsx (MIT).
// Multi-project collapse, Cursor-inspired density, and folder DnD are harness-owned.
// Skills, Extensions, worktrees, and branding omitted.

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
  onReorderProjects,
  onOpenSettings,
  onToggleCollapsed,
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
  onReorderProjects: (workspaceIds: string[]) => void;
  onOpenSettings: () => void;
  onToggleCollapsed: () => void;
  busy: boolean;
}) {
  const mac = isMacDesktop();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const canNewSession = Boolean(activeWorkspaceId);
  const projectIds = projects.map((project) => project.id);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
      }
      return { ...current, [workspaceId]: nextOpen };
    });
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = projectIds.indexOf(String(active.id));
    const newIndex = projectIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return;
    }
    onReorderProjects(arrayMove(projectIds, oldIndex, newIndex));
  }

  return (
    <aside
      className="app-sidebar-panel flex h-full w-[var(--sidebar-width)] min-w-0 shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground"
      aria-label="Projects"
      data-testid="app-sidebar"
    >
      <header
        className={cn(
          "workspace-topbar drag-region min-w-0 items-center justify-between gap-2 overflow-hidden px-2",
          mac ? "pl-[var(--workspace-titlebar-inset)]" : undefined,
        )}
      >
        <SidebarToggleButton collapsed={false} onToggle={onToggleCollapsed} />
        <span className="sr-only">Projects</span>
      </header>

      <div className="min-w-0 space-y-0.5 overflow-hidden px-2 pb-2">
        <button
          type="button"
          className="flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left text-[13px] font-medium leading-snug text-sidebar-foreground hover:bg-sidebar-row-hover disabled:opacity-40"
          data-testid="new-session"
          disabled={busy || !canNewSession}
          onClick={() => {
            if (activeWorkspaceId) {
              onNewSession(activeWorkspaceId);
            }
          }}
        >
          <SquarePenIcon className="size-3.5 shrink-0 text-sidebar-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">New session</span>
        </button>
        <button
          type="button"
          className="flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left text-[13px] font-medium leading-snug text-sidebar-foreground hover:bg-sidebar-row-hover disabled:opacity-40"
          data-testid="add-project"
          disabled={busy}
          onClick={onAddProject}
        >
          <FolderPlusIcon className="size-3.5 shrink-0 text-sidebar-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">Open folder</span>
        </button>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
        <div className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-sidebar-muted-foreground">
          Projects
        </div>
        {projects.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={projectIds} strategy={verticalListSortingStrategy}>
              <ul className="m-0 grid list-none gap-1 p-0" data-testid="project-list">
                {projects.map((project) => {
                  const open = expanded[project.id] === true;
                  const sessions = sessionsByWorkspace[project.id] ?? [];
                  const active = project.id === activeWorkspaceId;
                  return (
                    <SortableProjectRow
                      key={project.id}
                      project={project}
                      open={open}
                      active={active}
                      busy={busy}
                      sessions={sessions}
                      selectedSessionId={selectedSessionId}
                      onToggle={() => toggleProject(project.id)}
                      onNewSession={() => onNewSession(project.id)}
                      onOpenSession={(sessionId) => onOpenSession(project.id, sessionId)}
                    />
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="px-2 text-[0.6875rem] text-muted-foreground">Add a project to start.</p>
        )}
      </div>
      <div className="min-w-0 overflow-hidden px-2 py-2">
        <button
          type="button"
          className="mb-1 flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left text-[13px] leading-snug text-sidebar-foreground hover:bg-sidebar-row-hover"
          data-testid="open-settings"
          onClick={onOpenSettings}
        >
          <SettingsIcon className="size-3.5 shrink-0 text-sidebar-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">Settings</span>
        </button>
        <div className="flex min-w-0 items-start gap-2 overflow-hidden rounded-md px-2 py-1 text-sidebar-muted-foreground">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0 opacity-70" aria-hidden="true" />
          <div className="min-w-0 flex-1 overflow-hidden">
            <DiagnosticsPanel state={bootstrap} />
          </div>
        </div>
      </div>
    </aside>
  );
}

function SortableProjectRow({
  project,
  open,
  active,
  busy,
  sessions,
  selectedSessionId,
  onToggle,
  onNewSession,
  onOpenSession,
}: {
  project: RecentWorkspaceRecord;
  open: boolean;
  active: boolean;
  busy: boolean;
  sessions: readonly SessionSummary[];
  selectedSessionId?: string;
  onToggle: () => void;
  onNewSession: () => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });

  return (
    <li
      ref={setNodeRef}
      className={cn("min-w-0 overflow-hidden rounded-md", isDragging && "opacity-40")}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div
        className={cn(
          "grid w-full min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-1 rounded-md px-1 py-1 hover:bg-sidebar-row-hover",
          active && "bg-sidebar-row-selected",
        )}
      >
        <button
          type="button"
          className="mt-0.5 flex size-5 items-center justify-center rounded-sm text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
          data-testid="project-collapse"
          aria-label={open ? `Collapse ${project.displayName}` : `Expand ${project.displayName}`}
          aria-expanded={open}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggle();
          }}
        >
          <ChevronDownIcon
            className={cn(
              "size-3.5 transition-transform motion-reduce:transition-none",
              !open && "-rotate-90",
            )}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          className={cn(
            "grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-1 text-left text-[13px] leading-snug",
            active && "font-medium",
          )}
          data-testid="project-item"
          aria-expanded={open}
          onClick={onToggle}
          {...attributes}
          {...listeners}
        >
          <FolderIcon className="mt-0.5 size-3.5 shrink-0 text-sidebar-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 overflow-hidden">
            <span className="block truncate" title={project.displayName}>
              {project.displayName}
            </span>
            <span
              className="mt-0.5 block truncate text-[0.625rem] leading-snug text-sidebar-muted-foreground"
              title={project.path}
            >
              {compactPath(project.path)}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
          <span className="px-0.5 text-[0.6875rem] tabular-nums text-sidebar-muted-foreground">{sessions.length}</span>
          <Button
            size="icon-sm"
            variant="ghost"
            data-testid="project-new-session"
            disabled={busy}
            aria-label={`New session in ${project.displayName}`}
            className="size-6 text-sidebar-muted-foreground hover:text-sidebar-foreground"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onNewSession();
            }}
          >
            <PlusIcon className="size-3" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {open ? (
        <div className="mt-px min-w-0 space-y-px overflow-hidden pb-0.5">
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
                        "grid w-full min-w-0 grid-cols-[1.25rem_1.25rem_minmax(0,1fr)_auto] items-start gap-1 overflow-hidden rounded-md px-1 py-1.5 text-left hover:bg-sidebar-row-hover disabled:opacity-50",
                        selected && "bg-sidebar-row-selected",
                      )}
                      data-testid="session-item"
                      aria-current={selected}
                      disabled={busy}
                      onClick={() => onOpenSession(session.id)}
                    >
                      <span className="size-5" aria-hidden="true" />
                      <MessageSquareIcon
                        className="mt-0.5 size-3.5 shrink-0 text-sidebar-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 overflow-hidden">
                        <strong className="block truncate text-xs font-medium leading-snug">{session.title}</strong>
                        {session.preview ? (
                          <span className="mt-0.5 block truncate text-[0.625rem] leading-snug text-sidebar-muted-foreground">
                            {session.preview}
                          </span>
                        ) : null}
                      </span>
                      {relative ? (
                        <span className="mt-0.5 shrink-0 text-[0.5625rem] leading-snug tabular-nums text-sidebar-muted-foreground">
                          {relative}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="grid grid-cols-[1.25rem_1.25rem_minmax(0,1fr)] gap-1 px-1 py-1.5 text-[0.6875rem] text-muted-foreground">
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span>No saved sessions yet.</span>
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}
