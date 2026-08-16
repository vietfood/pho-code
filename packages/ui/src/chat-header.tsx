import type { ReactNode } from "react";
import { cn } from "./lib/cn";
import { workspaceTopbarClass } from "./lib/workspace-topbar";
import { SidebarToggleButton } from "./sidebar-toggle-button";
import { Button } from "./ui/button";

export function ChatHeader({
  title,
  modelError,
  yoloMode,
  sidebarCollapsed,
  paneFill = false,
  headerActions,
  onToggleSidebar,
  onTrustProject,
}: {
  title?: string;
  modelError?: string;
  yoloMode?: boolean;
  sidebarCollapsed?: boolean;
  paneFill?: boolean;
  headerActions?: ReactNode;
  onToggleSidebar?: () => void;
  onTrustProject?: () => void;
}) {
  const showToggle = Boolean(sidebarCollapsed && onToggleSidebar);

  return (
    <header
      className={workspaceTopbarClass({
        leadingInset: showToggle,
        className: cn("gap-2", paneFill && "border-border/50 border-b"),
      })}
    >
      {showToggle && onToggleSidebar ? (
        <SidebarToggleButton
          collapsed
          onToggle={onToggleSidebar}
          className="text-muted-foreground hover:text-foreground"
        />
      ) : null}
      {headerActions}
      {title ? (
        <p
          className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
          data-testid="chat-title"
          title={title}
        >
          {title}
        </p>
      ) : (
        <div className="min-w-0 flex-1" aria-hidden="true" />
      )}
      {onTrustProject ? (
        <Button
          size="sm"
          variant="outline"
          className="no-drag shrink-0"
          data-testid="trust-project-header"
          onClick={onTrustProject}
        >
          Trust project
        </Button>
      ) : null}
      {yoloMode ? (
        <p
          className="shrink-0 rounded-full bg-warning/20 px-2 py-0.5 text-[11px] font-medium text-warning"
          role="status"
          data-testid="yolo-indicator"
        >
          Great power mode
        </p>
      ) : null}
      {modelError ? (
        <p className="max-w-[16rem] truncate text-sm text-destructive-foreground" role="alert" title={modelError}>
          {modelError}
        </p>
      ) : null}
    </header>
  );
}
