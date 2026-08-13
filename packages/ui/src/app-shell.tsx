import type { ReactNode } from "react";
import { cn } from "./lib/cn";

export function AppShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="app-shell-root flex h-full min-h-0 overflow-hidden bg-background text-foreground">
      {sidebar}
      <div className="app-shell-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background [box-shadow:-1px_0_0_0_var(--border)]">
        {children}
      </div>
    </div>
  );
}

export function MainColumn({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", className)}>{children}</div>;
}
