import { useEffect, type ReactNode } from "react";
import { isPrimaryModShortcut } from "./lib/shell-shortcut";

export function AppShell({
  sidebar,
  children,
  onToggleSidebar,
  onToggleRightSidebar,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  onToggleSidebar?: () => void;
  onToggleRightSidebar?: () => void;
}) {
  useEffect(() => {
    if (!onToggleSidebar && !onToggleRightSidebar) {
      return;
    }
    const toggleLeft = onToggleSidebar;
    const toggleRight = onToggleRightSidebar;
    function onKey(event: KeyboardEvent): void {
      if (toggleLeft && isPrimaryModShortcut(event, "b")) {
        event.preventDefault();
        toggleLeft();
        return;
      }
      if (toggleRight && isPrimaryModShortcut(event, "r")) {
        event.preventDefault();
        toggleRight();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onToggleSidebar, onToggleRightSidebar]);

  return (
    <div className="app-shell-root relative flex h-full min-h-0 overflow-hidden bg-background text-foreground">
      {sidebar}
      <div className="app-shell-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {children}
      </div>
    </div>
  );
}
