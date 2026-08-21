import type { ReactNode } from "react";

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
        <div className="empty-session-column relative z-10" data-workspace={workspaceName}>
          {children}
        </div>
      </div>
    </div>
  );
}
