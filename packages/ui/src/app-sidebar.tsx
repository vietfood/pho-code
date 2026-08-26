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
  FolderPlusIcon,
  HouseIcon,
  InfoIcon,
  PlusIcon,
  SettingsIcon,
  SquareIcon,
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
//
// The quiet muted project-group headers, the raised primary action, and the
// dot-marked session rows are harness-owned chrome described in
// docs/ui/logs/2026-08-21-change-sidebar-claude-layout.md. No third-party code
// was copied for that pass.

// One row shape for the primary actions, kept compact: 28px tall, 13px label
// with the slight negative tracking SF wants there, 10px icon gutter. Emphasis
// comes from weight and the raised pill, not from height or from every row
// shouting at medium weight.
const sidebarActionClass =
  "flex h-7 w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-lg px-2 text-left text-[13px] leading-5 tracking-[-0.01em] text-sidebar-foreground disabled:opacity-40";

// Thin glyphs: at 15px the lucide default stroke of 2 sits heavier than SF at
// 13px next to it.
const sidebarActionIconClass = "size-[0.9375rem] shrink-0";

export function AppSidebar({
  projects,
  activeWorkspaceId,
  selectedSessionId,
  selectedBackendId,
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
  stopAllCount = 0,
  onStopAll,
}: {
  projects: readonly RecentWorkspaceRecord[];
  activeWorkspaceId?: string;
  selectedSessionId?: string;
  selectedBackendId?: string;
  sessionsByWorkspace: Readonly<Record<string, readonly SessionCatalogEntry[]>>;
  bootstrap: BootstrapState;
  collapsed?: boolean;
  onAddProject: () => void;
  onNewSession: (workspaceId: string, backendId?: string) => void;
  onOpenSession: (workspaceId: string, sessionId: string, backendId?: string) => void;
  onArchiveSession: (workspaceId: string, sessionId: string, backendId?: string) => void;
  onRemoveSession: (workspaceId: string, sessionId: string, backendId?: string) => void;
  onRemoveProject: (workspaceId: string) => void;
  onExpandProject: (workspaceId: string) => void;
  onReorderProjects: (workspaceIds: string[]) => void;
  onOpenSettings: () => void;
  onGoHome: () => void;
  homeActive?: boolean;
  overlay?: boolean;
  onToggleCollapsed: () => void;
  busy: boolean;
  stopAllCount?: number;
  onStopAll?: () => void;
}) {
  const { width, resizing, handle: resizeHandle } = useSidebarResize();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    activeWorkspaceId ? { [activeWorkspaceId]: true } : {},
  );
  const [menu, setMenu] = useState<
    | { kind: "session"; workspaceId: string; sessionId: string; backendId?: string; x: number; y: number }
    | { kind: "project"; workspaceId: string; x: number; y: number }
    | null
  >(null);
  const [backendMenuOpen, setBackendMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const agentBackends = bootstrap.agentBackends ?? [];
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
        onNewSession(activeWorkspaceId, "pi");
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

      <div className="relative min-w-0 space-y-px px-2 pb-2.5">
        <button
          type="button"
          className={cn(sidebarActionClass, "bg-sidebar-row-hover pr-8 font-medium hover:bg-sidebar-row-selected")}
          data-testid="new-session"
          disabled={busy || !canNewSession}
          onClick={handleNewSession}
        >
          <PlusIcon className={sidebarActionIconClass} strokeWidth={1.75} aria-hidden="true" />
          <span className="min-w-0 truncate">New session</span>
        </button>
        {agentBackends.length > 1 ? (
          <button
            type="button"
            className="absolute top-0 right-2 flex size-7 items-center justify-center rounded-lg text-[11px] text-sidebar-muted-foreground hover:bg-sidebar-row-selected hover:text-sidebar-foreground"
            data-testid="backend-selector"
            aria-label="Choose agent backend"
            aria-haspopup="menu"
            aria-expanded={backendMenuOpen}
            disabled={busy || !canNewSession}
            onClick={() => setBackendMenuOpen((open) => !open)}
          >
            ▾
          </button>
        ) : null}
        {backendMenuOpen && activeWorkspaceId ? (
          <div
            className="absolute top-8 right-2 left-2 z-30 rounded-lg border border-sidebar-border bg-popover p-1 shadow-lg"
            role="menu"
            aria-label="Choose agent backend"
            data-testid="backend-menu"
          >
            {agentBackends.map((backend) => (
              <button
                key={backend.id}
                type="button"
                role="menuitem"
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-sidebar-row-hover"
                data-testid={`backend-${backend.id}`}
                onClick={() => {
                  setBackendMenuOpen(false);
                  onNewSession(activeWorkspaceId, backend.id);
                }}
              >
                <span>{backend.label}</span>
                {backend.id !== "pi" ? <span className="text-[10px] text-muted-foreground">Experimental</span> : null}
              </button>
            ))}
            <details className="mt-1 border-t border-sidebar-border px-2 pt-1 text-[11px] text-muted-foreground">
              <summary className="cursor-pointer list-none" aria-label="Backend information">ⓘ</summary>
              <p className="mt-1 leading-4">
                Codex and Claude use separately installed agents with their own accounts, configuration, tools, and process permissions.
              </p>
            </details>
          </div>
        ) : null}
        <button
          type="button"
          className={cn(
            sidebarActionClass,
            "hover:bg-sidebar-row-hover",
            homeActive ? "bg-sidebar-row-selected font-medium" : "font-normal",
          )}
          data-testid="go-home"
          aria-current={homeActive ? "page" : undefined}
          onClick={onGoHome}
        >
          <HouseIcon
            className={cn(sidebarActionIconClass, "text-sidebar-muted-foreground")}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate">Home</span>
        </button>
        <button
          type="button"
          className={cn(sidebarActionClass, "font-normal hover:bg-sidebar-row-hover")}
          data-testid="add-project"
          disabled={busy}
          onClick={onAddProject}
        >
          <FolderPlusIcon
            className={cn(sidebarActionIconClass, "text-sidebar-muted-foreground")}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate">Open folder</span>
        </button>
        {stopAllCount > 0 && onStopAll ? (
          <button
            type="button"
            className={cn(sidebarActionClass, "font-normal text-destructive hover:bg-sidebar-row-hover")}
            data-testid="stop-all"
            onClick={onStopAll}
          >
            <SquareIcon className="size-3 shrink-0 fill-current" aria-hidden="true" />
            <span className="min-w-0 truncate">
              {stopAllCount > 1 ? `Stop all (${stopAllCount})` : "Stop all"}
            </span>
          </button>
        ) : null}
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
        {projects.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={projectIds} strategy={verticalListSortingStrategy}>
              <ul className="m-0 grid list-none gap-1.5 p-0" data-testid="project-list">
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
                      selectedBackendId={selectedBackendId}
                      onToggle={() => toggleProject(project.id)}
                      onNewSession={() => onNewSession(project.id, "pi")}
                      onOpenSession={(sessionId, backendId) => onOpenSession(project.id, sessionId, backendId)}
                      onOpenMenu={(sessionId, backendId, point) => {
                        setMenu({
                          kind: "session",
                          workspaceId: project.id,
                          sessionId,
                          ...(backendId ? { backendId } : {}),
                          x: point.x,
                          y: point.y,
                        });
                      }}
                      onArchive={(sessionId, backendId) => onArchiveSession(project.id, sessionId, backendId)}
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
          <p className="px-2 text-[12px] leading-5 text-sidebar-muted-foreground">Add a project to start.</p>
        )}
      </div>
      <div className="flex min-w-0 justify-start gap-1 overflow-hidden border-t border-sidebar-border px-2 py-2">
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
          onArchive={() => onArchiveSession(menu.workspaceId, menu.sessionId, menu.backendId)}
          onRemove={() => onRemoveSession(menu.workspaceId, menu.sessionId, menu.backendId)}
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
  selectedBackendId,
  onToggle,
  onNewSession,
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
  selectedBackendId?: string;
  onToggle: () => void;
  onNewSession: () => void;
  onOpenSession: (sessionId: string, backendId?: string) => void;
  onOpenMenu: (sessionId: string, backendId: string | undefined, point: { x: number; y: number }) => void;
  onArchive: (sessionId: string, backendId?: string) => void;
  onOpenProjectMenu: (point: { x: number; y: number }) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });
  const ordinary = sessions.filter((session) => !session.archived);

  return (
    <li
      ref={setNodeRef}
      className={cn("group/project min-w-0 overflow-hidden", isDragging && "opacity-40")}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div
        className="grid h-6 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md px-2"
        {...contextMenuHandlers(onOpenProjectMenu)}
      >
        <button
          type="button"
          className={cn(
            "flex min-w-0 items-center text-left text-[12px] font-medium leading-5 tracking-[-0.005em]",
            active
              ? "text-sidebar-foreground"
              : "text-sidebar-muted-foreground hover:text-sidebar-foreground",
          )}
          data-testid="project-item"
          aria-label={open ? `Collapse ${project.displayName}` : `Expand ${project.displayName}`}
          aria-expanded={open}
          title={project.displayName}
          onClick={onToggle}
          {...attributes}
          {...listeners}
        >
          <span className="min-w-0 truncate" title={project.displayName}>
            {project.displayName}
          </span>
        </button>
        <div className="relative flex h-5 min-w-5 shrink-0 items-center justify-end">
          <span
            className="pr-0.5 text-[11px] leading-none tabular-nums text-sidebar-muted-foreground group-hover/project:opacity-0 group-focus-within/project:opacity-0"
            data-testid="project-session-count"
          >
            {ordinary.length > 0 ? ordinary.length : ""}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            data-testid="project-new-session-inline"
            disabled={busy}
            aria-label={`New session in ${project.displayName}`}
            title="New session"
            className="absolute inset-y-0 right-0 size-5 text-sidebar-muted-foreground opacity-0 hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/project:opacity-100 group-focus-within/project:opacity-100"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onNewSession();
            }}
          >
            <PlusIcon className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {open ? (
        <div className="project-sessions-enter mt-0.5 min-w-0 overflow-hidden">
          {ordinary.length > 0 ? (
            <ul className="m-0 grid min-w-0 list-none gap-px p-0">
              {ordinary.map((session) => (
                <SessionRow
                  key={`${session.backendId ?? "pi"}:${session.sessionId}`}
                  session={session}
                  selected={
                    session.sessionId === selectedSessionId &&
                    (session.backendId ?? "pi") === (selectedBackendId ?? "pi") &&
                    active
                  }
                  busy={busy}
                  onOpen={() => onOpenSession(session.sessionId, session.backendId)}
                  onArchive={() => onArchive(session.sessionId, session.backendId)}
                  onOpenMenu={(point) => onOpenMenu(session.sessionId, session.backendId, point)}
                />
              ))}
            </ul>
          ) : (
            <p className="px-2 py-0.5 text-[12px] leading-5 text-sidebar-muted-foreground">
              No saved sessions yet.
            </p>
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
          "flex h-7 w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-lg py-0 pr-1 pl-2",
          selected
            ? "bg-sidebar-row-selected text-sidebar-foreground"
            : "text-sidebar-foreground/90 hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
        )}
        {...contextMenuHandlers(onOpenMenu)}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:opacity-50"
          data-testid="session-item"
          aria-current={selected}
          disabled={busy}
          title={sessionRowTooltip(session)}
          onClick={onOpen}
        >
          <SessionLeadingMark activity={session.activity} selected={selected} />
          {session.backendId && session.backendId !== "pi" ? (
            <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-sidebar-muted-foreground">
              {session.backendId}
            </span>
          ) : null}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px] leading-5 tracking-[-0.01em]",
              selected && "font-medium",
            )}
          >
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
