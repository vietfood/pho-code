// Collapsed overlay pill and expanded icon rail adapted from refs/t3code
// RightPanelTabs (MIT, T3 Tools Inc., 6bc6cb6). Globe, terminal, files, and
// extra launcher surfaces are omitted; Context prompt is a Pho Code surface.
import { useEffect, type ReactNode } from "react";
import { BookOpenIcon, FileDiffIcon, ScrollTextIcon } from "lucide-react";
import { cn } from "./lib/cn";
import {
  clampReviewSidebarWidth,
  DEFAULT_REVIEW_SIDEBAR_WIDTH_PX,
  MAX_REVIEW_SIDEBAR_WIDTH_PX,
  MIN_REVIEW_SIDEBAR_WIDTH_PX,
  readReviewSidebarWidth,
  REVIEW_SIDEBAR_RAIL_WIDTH_PX,
  REVIEW_SIDEBAR_RESIZE_STEP_PX,
  writeReviewSidebarWidth,
} from "./lib/review-sidebar-width";
import { Button } from "./ui/button";
import { SidebarResizeHandle, useSidebarResize } from "./sidebar-resize-handle";

export type RightSidebarSurface = "changes" | "context-prompt" | "plan";

export type RightSidebarSurfaceAction = "collapse" | "select";

export function rightSidebarSurfaceAction(
  collapsed: boolean,
  current: RightSidebarSurface,
  clicked: RightSidebarSurface,
): RightSidebarSurfaceAction {
  return !collapsed && current === clicked ? "collapse" : "select";
}

const REVIEW_SIDEBAR_STORAGE = {
  read: readReviewSidebarWidth,
  write: writeReviewSidebarWidth,
  clamp: clampReviewSidebarWidth,
  defaultWidth: DEFAULT_REVIEW_SIDEBAR_WIDTH_PX,
  minWidth: MIN_REVIEW_SIDEBAR_WIDTH_PX,
  maxWidth: MAX_REVIEW_SIDEBAR_WIDTH_PX,
  step: REVIEW_SIDEBAR_RESIZE_STEP_PX,
};

export function RightSidebar({
  collapsed,
  surface,
  contextPromptCustomized = false,
  planDocumentPresent = false,
  onToggleCollapsed,
  onSelectSurface,
  children,
}: {
  collapsed: boolean;
  surface: RightSidebarSurface;
  contextPromptCustomized?: boolean;
  planDocumentPresent?: boolean;
  onToggleCollapsed: () => void;
  onSelectSurface: (surface: RightSidebarSurface) => void;
  children?: ReactNode;
}) {
  const { width, resizing, handle: resizeHandle } = useSidebarResize({
    edge: "start",
    storage: REVIEW_SIDEBAR_STORAGE,
    testId: "right-sidebar-resize",
    label: "Resize right sidebar",
  });

  useEffect(() => {
    if (collapsed) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      if (document.querySelector('[aria-modal="true"]')) {
        return;
      }
      event.preventDefault();
      onToggleCollapsed();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [collapsed, onToggleCollapsed]);

  const icons = (
    <RightSidebarIcons
      collapsed={collapsed}
      surface={surface}
      contextPromptCustomized={contextPromptCustomized}
      planDocumentPresent={planDocumentPresent}
      onToggleCollapsed={onToggleCollapsed}
      onSelectSurface={onSelectSurface}
    />
  );

  if (collapsed) {
    return (
      <div className="pointer-events-none absolute inset-0 z-20" data-testid="right-sidebar" data-collapsed="true">
        <nav
          className="pointer-events-auto absolute end-2 top-14 flex flex-col items-center gap-0.5 rounded-2xl border border-border bg-sidebar p-1 shadow-sm"
          aria-label="Right sidebar"
          data-testid="right-sidebar-pill"
        >
          {icons}
        </nav>
      </div>
    );
  }

  return (
    <aside
      className={cn(
        "right-sidebar-host relative flex h-full min-h-0 shrink-0 overflow-hidden bg-background motion-reduce:transition-none",
        resizing && "select-none",
      )}
      style={{ width: `${REVIEW_SIDEBAR_RAIL_WIDTH_PX + width}px` }}
      data-testid="right-sidebar"
      data-collapsed="false"
      aria-label="Right sidebar"
    >
      <SidebarResizeHandle {...resizeHandle} />
      <nav
        className="flex w-10 shrink-0 flex-col items-center gap-1 border-e border-border/60 bg-sidebar py-2"
        aria-label="Right sidebar surfaces"
      >
        {icons}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </aside>
  );
}

function RightSidebarIcons({
  collapsed,
  surface,
  contextPromptCustomized,
  planDocumentPresent,
  onToggleCollapsed,
  onSelectSurface,
}: {
  collapsed: boolean;
  surface: RightSidebarSurface;
  contextPromptCustomized: boolean;
  planDocumentPresent: boolean;
  onToggleCollapsed: () => void;
  onSelectSurface: (surface: RightSidebarSurface) => void;
}) {
  function activate(next: RightSidebarSurface): void {
    const action = rightSidebarSurfaceAction(collapsed, surface, next);
    switch (action) {
      case "collapse":
        onToggleCollapsed();
        return;
      case "select":
        onSelectSurface(next);
        return;
      default: {
        const exhaustive: never = action;
        return exhaustive;
      }
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Changes"
        aria-pressed={!collapsed && surface === "changes"}
        data-testid="right-sidebar-surface-diff"
        className={cn(
          "no-drag size-6",
          !collapsed && surface === "changes"
            ? "bg-accent text-foreground"
            : "text-sidebar-muted-foreground hover:text-sidebar-foreground",
        )}
        onClick={() => activate("changes")}
      >
        <FileDiffIcon className="size-3.5" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Context prompt"
        aria-pressed={!collapsed && surface === "context-prompt"}
        data-testid="right-sidebar-surface-context"
        data-customized={contextPromptCustomized ? "true" : "false"}
        className={cn(
          "no-drag size-6",
          !collapsed && surface === "context-prompt"
            ? "bg-accent text-foreground"
            : "text-sidebar-muted-foreground hover:text-sidebar-foreground",
        )}
        onClick={() => activate("context-prompt")}
      >
        <BookOpenIcon className="size-3.5" aria-hidden="true" />
        {contextPromptCustomized ? (
          <span
            className="absolute end-0.5 top-0.5 size-1.5 rounded-full bg-primary"
            data-testid="right-sidebar-context-custom"
          />
        ) : null}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Plan"
        aria-pressed={!collapsed && surface === "plan"}
        data-testid="right-sidebar-surface-plan"
        data-document={planDocumentPresent ? "true" : "false"}
        className={cn(
          "no-drag size-6",
          !collapsed && surface === "plan"
            ? "bg-accent text-foreground"
            : "text-sidebar-muted-foreground hover:text-sidebar-foreground",
        )}
        onClick={() => activate("plan")}
      >
        <ScrollTextIcon className="size-3.5" aria-hidden="true" />
        {planDocumentPresent ? (
          <span
            className="absolute end-0.5 top-0.5 size-1.5 rounded-full bg-primary"
            data-testid="right-sidebar-plan-document"
          />
        ) : null}
      </Button>
    </>
  );
}
