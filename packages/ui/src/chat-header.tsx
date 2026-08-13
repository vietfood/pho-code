import { isMacDesktop } from "./lib/platform";
import { cn } from "./lib/cn";
import { SidebarToggleButton } from "./sidebar-toggle-button";

export function ChatHeader({
  modelError,
  yoloMode,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  modelError?: string;
  yoloMode?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}) {
  const mac = isMacDesktop();
  const showToggle = Boolean(sidebarCollapsed && onToggleSidebar);

  return (
    <header
      className={cn(
        "workspace-topbar drag-region gap-3 px-3 sm:px-5",
        showToggle && mac ? "pl-[var(--workspace-titlebar-inset)]" : undefined,
      )}
    >
      {showToggle && onToggleSidebar ? (
        <SidebarToggleButton
          collapsed
          onToggle={onToggleSidebar}
          className="text-muted-foreground hover:text-foreground"
        />
      ) : null}
      <div className="min-w-0 flex-1" aria-hidden="true" />
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
