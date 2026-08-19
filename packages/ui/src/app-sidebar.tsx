import {
  useEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
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
  ArchiveIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  HouseIcon,
  InfoIcon,
  SettingsIcon,
  SquarePenIcon,
} from "lucide-react";
import type { BootstrapState, RecentWorkspaceRecord, SessionCatalogEntry } from "@pho-code/protocol";
import { AboutDialog } from "./about-dialog";
import { cn } from "./lib/cn";
import { formatRelativeTime } from "./lib/relative-time";
import { sessionRowTooltip } from "./lib/session-row-tooltip";
import { workspaceTopbarClass } from "./lib/workspace-topbar";
import { ProjectContextMenu } from "./project-context-menu";
import { SidebarResizeHandle, useSidebarResize } from "./sidebar-resize-handle";
import { SessionContextMenu } from "./session-context-menu";
import { SessionLeadingMark } from "./session-leading-mark";
import { SidebarToggleButton } from "./sidebar-toggle-button";
import { Button } from "./ui/button";

// Desktop sidebar chrome adapted from refs/t3code sidebar layout and denser
// project rows inspired by refs/pi-gui/apps/desktop/src/sidebar.tsx (MIT).
// Collapsed overlay pill reuses the right-sidebar pill chrome from
// refs/t3code RightPanelTabs. Multi-project collapse, single-line
// Cursor-inspired density, and folder DnD are harness-owned. Skills,
// Extensions, worktrees, and branding omitted.

export function AppSidebar({
  projects,
  activeWorkspaceId,
  selectedSessionId,
  sessionsByWorkspace,
  bootstrap,
  collapsed = false,
  onAddProject,
  onNewSession,
  onOpenSession,
  onArchiveSession,
  onRemoveSession,
  onRemoveProject,
  onExpandProject,
  onReorderProjects,
  onOpenSettings,
  onGoHome,
  homeActive = false,
  overlay = true,
  onToggleCollapsed,
  busy,
}: {
  projects: readonly RecentWorkspaceRecord[];
  activeWorkspaceId?: string;
  selectedSessionId?: string;
  sessionsByWorkspace: Readonly<Record<string, readonly SessionCatalogEntry[]>>;
  bootstrap: BootstrapState;
  collapsed?: boolean;
  onAddProject: () => void;
  onNewSession: (workspaceId: string) => void;
  onOpenSession: (workspaceId: string, sessionId: string) => void;
  onArchiveSession: (workspaceId: string, sessionId: string) => void;
  onRemoveSession: (workspaceId: string, sessionId: string) => void;
  onRemoveProject: (workspaceId: string) => void;
  onExpandProject: (workspaceId: string) => void;
  onReorderProjects: (workspaceIds: string[]) => void;
  onOpenSettings: () => void;
  onGoHome: () => void;
  homeActive?: boolean;
  overlay?: boolean;
  onToggleCollapsed: () => void;
  busy: boolean;
}) {
  const { width, resizing, handle: resizeHandle } = useSidebarResize();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    activeWorkspaceId ? { [activeWorkspaceId]: true } : {},
  );
  const [menu, setMenu] = useState<
    | { kind: "session"; workspaceId: string; sessionId: string; x: number; y: number }
    | { kind: "project"; workspaceId: string; x: number; y: number }
    | null
  >(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const canNewSession = Boolean(activeWorkspaceId);
  const projectIds = projects.map((project) => project.id);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    setExpanded((current) => (current[activeWorkspaceId] ? current : { ...current, [activeWorkspaceId]: true }));
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (collapsed) {
      setMenu(null);
    }
  }, [collapsed]);

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

  function handleNewSession(): void {
    if (activeWorkspaceId) {
      onNewSession(activeWorkspaceId);
    }
  }

  const aboutLabel = `About · ${bootstrap.appVersion}`;
  const aboutDialog = aboutOpen ? <AboutDialog state={bootstrap} onClose={() => setAboutOpen(false)} /> : null;

  if (collapsed) {
    if (!overlay) {
      return (
        <>
          <div data-testid="app-sidebar" data-collapsed="true" data-overlay="false" hidden />
          {aboutDialog}
        </>
      );
    }
    return (
      <>
        <div className="pointer-events-none absolute inset-0 z-20" data-testid="app-sidebar" data-collapsed="true">
          <CollapsedSidebarActions
            layout="pill"
            busy={busy}
            canNewSession={canNewSession}
            homeActive={homeActive}
            onGoHome={onGoHome}
            onAddProject={onAddProject}
            onNewSession={handleNewSession}
            onOpenSettings={onOpenSettings}
          />
        </div>
        {aboutDialog}
      </>
    );
  }

  return (
    <aside
      className={cn(
        "app-sidebar-panel relative flex h-full min-w-0 shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground",
        resizing && "select-none",
      )}
      style={{ width: `${width}px` }}
      aria-label="Projects"
      data-testid="app-sidebar"
      data-collapsed="false"
    >
      <header
        className={workspaceTopbarClass({
          leadingInset: true,
          density: "sidebar",
          className: "min-w-0 items-center gap-2 overflow-hidden",
        })}
      >
        <SidebarToggleButton collapsed={false} onToggle={onToggleCollapsed} />
        <span className="sr-only">Projects</span>
      </header>

      <div className="min-w-0 space-y-0.5 overflow-hidden px-2 pb-2">
        <button
          type="button"
          className={cn(
            "flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-[13px] font-medium leading-5 text-sidebar-foreground hover:bg-sidebar-row-hover",
            homeActive && "bg-sidebar-row-selected",
          )}
          data-testid="go-home"
          aria-current={homeActive ? "page" : undefined}
          onClick={onGoHome}
        >
          <HouseIcon className="size-3.5 shrink-0 text-sidebar-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">Home</span>
        </button>
        <button
          type="button"
          className="flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-[13px] font-medium leading-5 text-sidebar-foreground hover:bg-sidebar-row-hover disabled:opacity-40"
          data-testid="new-session"
          disabled={busy || !canNewSession}
          onClick={handleNewSession}
        >
          <SquarePenIcon className="size-3.5 shrink-0 text-sidebar-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">New session</span>
        </button>
        <button
          type="button"
          className="flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-[13px] font-medium leading-5 text-sidebar-foreground hover:bg-sidebar-row-hover disabled:opacity-40"
          data-testid="add-project"
          disabled={busy}
          onClick={onAddProject}
        >
          <FolderPlusIcon className="size-3.5 shrink-0 text-sidebar-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">Open folder</span>
        </button>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
        <h2
          className="mb-1 flex h-8 items-center px-2 text-sm font-medium leading-5 text-sidebar-muted-foreground"
          data-testid="projects-heading"
        >
          Projects
        </h2>
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
                      onOpenSession={(sessionId) => onOpenSession(project.id, sessionId)}
                      onOpenMenu={(sessionId, point) => {
                        setMenu({ kind: "session", workspaceId: project.id, sessionId, x: point.x, y: point.y });
                      }}
                      onArchive={(sessionId) => onArchiveSession(project.id, sessionId)}
                      onOpenProjectMenu={(point) => {
                        setMenu({ kind: "project", workspaceId: project.id, x: point.x, y: point.y });
                      }}
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
      <div className="flex min-w-0 justify-start gap-1 overflow-hidden px-2 py-2">
        <SidebarGlyphButton size="md" label="Settings" testId="open-settings" onClick={onOpenSettings}>
          <SettingsIcon className="size-4" aria-hidden="true" />
        </SidebarGlyphButton>
        <SidebarGlyphButton size="md" label={aboutLabel} testId="bootstrap-state" onClick={() => setAboutOpen(true)}>
          <InfoIcon className="size-4" aria-hidden="true" />
        </SidebarGlyphButton>
      </div>
      <SidebarResizeHandle {...resizeHandle} />
      {aboutDialog}
      {menu?.kind === "session" ? (
        <SessionContextMenu
          x={menu.x}
          y={menu.y}
          archived={false}
          onArchive={() => onArchiveSession(menu.workspaceId, menu.sessionId)}
          onRemove={() => onRemoveSession(menu.workspaceId, menu.sessionId)}
          onClose={() => setMenu(null)}
        />
      ) : null}
      {menu?.kind === "project" ? (
        <ProjectContextMenu
          x={menu.x}
          y={menu.y}
          path={projects.find((project) => project.id === menu.workspaceId)?.path ?? menu.workspaceId}
          busy={busy}
          onNewSession={() => onNewSession(menu.workspaceId)}
          onRemove={() => onRemoveProject(menu.workspaceId)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </aside>
  );
}

export function CollapsedSidebarActions({
  layout,
  busy,
  canNewSession,
  homeActive,
  onGoHome,
  onAddProject,
  onNewSession,
  onOpenSettings,
}: {
  layout: "pill" | "header";
  busy: boolean;
  canNewSession: boolean;
  homeActive: boolean;
  onGoHome: () => void;
  onAddProject: () => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
}) {
  const buttons = (
    <>
      <SidebarGlyphButton label="Home" testId="go-home" current={homeActive} onClick={onGoHome}>
        <HouseIcon className="size-3.5" aria-hidden="true" />
      </SidebarGlyphButton>
      <SidebarGlyphButton label="Open folder" testId="add-project" disabled={busy} onClick={onAddProject}>
        <FolderPlusIcon className="size-3.5" aria-hidden="true" />
      </SidebarGlyphButton>
      <SidebarGlyphButton
        label="New session"
        testId="new-session"
        disabled={busy || !canNewSession}
        onClick={onNewSession}
      >
        <SquarePenIcon className="size-3.5" aria-hidden="true" />
      </SidebarGlyphButton>
      <SidebarGlyphButton label="Settings" testId="open-settings" onClick={onOpenSettings}>
        <SettingsIcon className="size-3.5" aria-hidden="true" />
      </SidebarGlyphButton>
    </>
  );

  const pill = layout === "pill";
  return (
    <nav
      className={
        pill
          ? "pointer-events-auto absolute start-2 top-14 flex flex-col items-center gap-0.5 rounded-2xl border border-border bg-sidebar p-1 shadow-sm"
          : "flex shrink-0 items-center gap-0.5"
      }
      aria-label="Projects"
      data-testid={pill ? "app-sidebar-pill" : "app-sidebar-header-actions"}
    >
      {buttons}
    </nav>
  );
}

function contextMenuHandlers(onOpenMenu: (point: { x: number; y: number }) => void) {
  return {
    onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      onOpenMenu({ x: event.clientX, y: event.clientY });
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        onOpenMenu({ x: rect.left, y: rect.bottom });
      }
    },
  };
}

function SidebarGlyphButton({
  label,
  testId,
  disabled,
  current = false,
  size = "sm",
  onClick,
  children,
}: {
  label: string;
  testId: string;
  disabled?: boolean;
  current?: boolean;
  size?: "sm" | "md";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-current={current ? "page" : undefined}
      title={label}
      data-testid={testId}
      disabled={disabled}
      className={cn(
        "no-drag text-sidebar-muted-foreground hover:text-sidebar-foreground disabled:opacity-40",
        size === "md" ? "size-7" : "size-6",
        current && "bg-accent text-foreground",
      )}
      onClick={onClick}
    >
      {children}
    </Button>
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
  onOpenSession,
  onOpenMenu,
  onArchive,
  onOpenProjectMenu,
}: {
  project: RecentWorkspaceRecord;
  open: boolean;
  active: boolean;
  busy: boolean;
  sessions: readonly SessionCatalogEntry[];
  selectedSessionId?: string;
  onToggle: () => void;
  onOpenSession: (sessionId: string) => void;
  onOpenMenu: (sessionId: string, point: { x: number; y: number }) => void;
  onArchive: (sessionId: string) => void;
  onOpenProjectMenu: (point: { x: number; y: number }) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });
  const ordinary = sessions.filter((session) => !session.archived);

  return (
    <li
      ref={setNodeRef}
      className={cn("min-w-0 overflow-hidden", open && "mb-1", isDragging && "opacity-40")}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div
        className={cn(
          "grid h-8 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md px-2 hover:bg-sidebar-row-hover",
          active ? "text-sidebar-foreground" : "text-sidebar-foreground/80",
        )}
        {...contextMenuHandlers(onOpenProjectMenu)}
      >
        <button
          type="button"
          className={cn(
            "flex min-w-0 items-center gap-2 text-left text-sm leading-5",
            active ? "font-medium" : "font-normal",
          )}
          data-testid="project-item"
          aria-label={open ? `Collapse ${project.displayName}` : `Expand ${project.displayName}`}
          aria-expanded={open}
          title={project.displayName}
          onClick={onToggle}
          {...attributes}
          {...listeners}
        >
          <span data-testid="project-collapse" className="flex size-4 shrink-0 items-center justify-center">
            {open ? (
              <FolderOpenIcon className="size-4 text-sidebar-muted-foreground" aria-hidden="true" />
            ) : (
              <FolderIcon className="size-4 text-sidebar-muted-foreground" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 truncate" title={project.displayName}>
            {project.displayName}
          </span>
        </button>
        <span className="px-1 text-xs tabular-nums text-sidebar-muted-foreground">
          {ordinary.length}
        </span>
      </div>
      {open ? (
        <div className="project-sessions-enter mt-px min-w-0 overflow-hidden pl-[1.875rem]">
          {ordinary.length > 0 ? (
            <ul className="m-0 grid min-w-0 list-none p-0">
              {ordinary.map((session) => (
                <SessionRow
                  key={session.sessionId}
                  session={session}
                  selected={session.sessionId === selectedSessionId && active}
                  busy={busy}
                  onOpen={() => onOpenSession(session.sessionId)}
                  onArchive={() => onArchive(session.sessionId)}
                  onOpenMenu={(point) => onOpenMenu(session.sessionId, point)}
                />
              ))}
            </ul>
          ) : (
            <p className="px-1.5 py-1 text-[11px] leading-5 text-muted-foreground">No saved sessions yet.</p>
          )}
        </div>
      ) : null}
    </li>
  );
}

function SessionRow({
  session,
  selected,
  busy,
  onOpen,
  onArchive,
  onOpenMenu,
}: {
  session: SessionCatalogEntry;
  selected: boolean;
  busy: boolean;
  onOpen: () => void;
  onArchive: () => void;
  onOpenMenu: (point: { x: number; y: number }) => void;
}) {
  const relative = formatRelativeTime(session.updatedAt);
  return (
    <li className="group/session min-w-0 overflow-hidden">
      <div
        className={cn(
          "flex h-7 w-full min-w-0 items-center gap-1 overflow-hidden rounded-md py-0 pr-0.5 pl-1.5",
          selected
            ? "bg-sidebar-row-selected text-sidebar-foreground"
            : "text-sidebar-foreground/90 hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
        )}
        {...contextMenuHandlers(onOpenMenu)}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left disabled:opacity-50"
          data-testid="session-item"
          aria-current={selected}
          disabled={busy}
          title={sessionRowTooltip(session)}
          onClick={onOpen}
        >
          <SessionLeadingMark activity={session.activity} />
          <span className={cn("min-w-0 flex-1 truncate text-[13px] leading-5", selected && "font-medium")}>
            {session.title}
          </span>
        </button>
        <div className="relative flex h-5 min-w-7 shrink-0 items-center justify-end">
          {relative ? (
            <span className="pr-1 text-[10px] leading-none tabular-nums text-sidebar-muted-foreground group-hover/session:opacity-0 group-focus-within/session:opacity-0">
              {relative}
            </span>
          ) : null}
          <Button
            size="icon-sm"
            variant="ghost"
            data-testid="session-archive"
            disabled={busy}
            aria-label={`Archive ${session.title}`}
            title="Archive chat"
            className="absolute inset-y-0 right-0 size-5 text-sidebar-muted-foreground opacity-0 hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/session:opacity-100 group-focus-within/session:opacity-100"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onArchive();
            }}
          >
            <ArchiveIcon className="size-3" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </li>
  );
}
