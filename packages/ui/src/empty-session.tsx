import type { ReactNode } from "react";
import { FolderIcon, LaptopIcon } from "lucide-react";
import { localMachineLabel } from "./lib/platform";

export function EmptySessionStage({
  workspaceName,
  children,
}: {
  workspaceName: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="empty-session">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4">
        <div className="relative z-10 w-full max-w-2xl">
          <SessionContext workspaceName={workspaceName} />
          {children}
        </div>
      </div>
      <p className="shrink-0 px-4 pb-5 text-center text-[11px] text-muted-foreground/70">
        Send a message to start chatting in this workspace.
      </p>
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
