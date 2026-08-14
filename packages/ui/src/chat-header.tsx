import { workspaceTopbarClass } from "./lib/workspace-topbar";
import { SidebarToggleButton } from "./sidebar-toggle-button";
import { Button } from "./ui/button";

export function ChatHeader({
  modelError,
  yoloMode,
  sidebarCollapsed,
  onToggleSidebar,
  onTrustProject,
  onOpenContextPrompt,
  contextPromptCustomized,
}: {
  modelError?: string;
  yoloMode?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onTrustProject?: () => void;
  onOpenContextPrompt?: () => void;
  contextPromptCustomized?: boolean;
}) {
  const showToggle = Boolean(sidebarCollapsed && onToggleSidebar);

  return (
    <header className={workspaceTopbarClass({ leadingInset: showToggle, className: "gap-3" })}>
      {showToggle && onToggleSidebar ? (
        <SidebarToggleButton
          collapsed
          onToggle={onToggleSidebar}
          className="text-muted-foreground hover:text-foreground"
        />
      ) : null}
      <div className="min-w-0 flex-1" aria-hidden="true" />
      {onOpenContextPrompt ? (
        <Button
          size="sm"
          variant="outline"
          className="no-drag shrink-0"
          data-testid="context-prompt-header"
          onClick={onOpenContextPrompt}
        >
          Context prompt
          {contextPromptCustomized ? <span className="text-muted-foreground">· Custom</span> : null}
        </Button>
      ) : null}
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
