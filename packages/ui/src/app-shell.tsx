import { useEffect, type ReactNode } from "react";

export function AppShell({
  sidebar,
  children,
  onToggleSidebar,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  onToggleSidebar?: () => void;
}) {
  useEffect(() => {
    if (!onToggleSidebar) {
      return;
    }
    const toggle = onToggleSidebar;
    function onKey(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key.toLowerCase() !== "b") {
        return;
      }
      event.preventDefault();
      toggle();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onToggleSidebar]);

  return (
    <div className="app-shell-root flex h-full min-h-0 overflow-hidden bg-background text-foreground">
      {sidebar}
      <div className="app-shell-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background [box-shadow:-1px_0_0_0_var(--border)]">
        {children}
      </div>
    </div>
  );
}
