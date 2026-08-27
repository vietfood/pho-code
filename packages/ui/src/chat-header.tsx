import type { ReactNode } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { workspaceTopbarClass } from "./lib/workspace-topbar";
import { SidebarToggleButton } from "./sidebar-toggle-button";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";

export function ChatHeader({
  title,
  modelError,
  yoloMode,
  sidebarCollapsed,
  headerActions,
  headerTrailing,
  headerTabs,
  onToggleSidebar,
  onTrustProject,
}: {
  title?: string;
  modelError?: string;
  yoloMode?: boolean;
  sidebarCollapsed?: boolean;
  headerActions?: ReactNode;
  /** Trailing cluster pinned to the top-right edge of the chat. */
  headerTrailing?: ReactNode;
  /** Tab strip occupying the flexible middle slot (replaces title/spacer). */
  headerTabs?: ReactNode;
  onToggleSidebar?: () => void;
  onTrustProject?: () => void;
}) {
  const showToggle = Boolean(sidebarCollapsed && onToggleSidebar);

  return (
    <header
      className={workspaceTopbarClass({
        leadingInset: showToggle,
        className: "gap-2 border-border/50 border-b",
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
      {headerTabs ? (
        <div className="flex min-w-0 flex-1 items-center">{headerTabs}</div>
      ) : title ? (
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
        <Alert
          variant="destructive"
          className="w-auto max-w-[16rem] shrink-0 px-2 py-1 text-xs"
          role="alert"
          title={modelError}
        >
          <TriangleAlertIcon />
          <AlertDescription className="min-w-0 truncate text-xs">{modelError}</AlertDescription>
        </Alert>
      ) : null}
      {headerTrailing}
    </header>
  );
}
