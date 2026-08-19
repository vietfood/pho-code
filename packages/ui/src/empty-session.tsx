import type { ReactNode } from "react";
import { FolderIcon, LaptopIcon } from "lucide-react";
import { localMachineLabel } from "./lib/platform";

export function EmptySessionStage({
  workspaceName,
  children,
  leftOverlay = false,
  rightOverlay = false,
}: {
  workspaceName: string;
  children: ReactNode;
  leftOverlay?: boolean;
  rightOverlay?: boolean;
}) {
  return (
    <div
      className="empty-session relative flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="empty-session"
      {...(leftOverlay ? { "data-left-overlay": "true" } : {})}
      {...(rightOverlay ? { "data-right-overlay": "true" } : {})}
    >
      <div className="empty-session-glow" aria-hidden="true" />
      <div className="empty-session-center flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="empty-session-column relative z-10">
          <SessionContext workspaceName={workspaceName} />
          {children}
        </div>
      </div>
    </div>
  );
}

function SessionContext({ workspaceName }: { workspaceName: string }) {
  return (
    <div
      className="mb-3 flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground"
      data-testid="session-context"
      aria-label="Session context"
    >
      <span className="inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5">
        <FolderIcon className="size-3 shrink-0 opacity-70" aria-hidden="true" />
        <span className="min-w-0 truncate font-medium text-foreground/80">{workspaceName}</span>
      </span>
      <span className="text-muted-foreground/35" aria-hidden="true">
        /
      </span>
      <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5">
        <LaptopIcon className="size-3 shrink-0 opacity-70" aria-hidden="true" />
        <span>{localMachineLabel()}</span>
      </span>
    </div>
  );
}
