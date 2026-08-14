import type { SessionActivitySummary } from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { sessionRowActivity } from "./lib/session-activity";

export function SessionActivityDot({
  activity,
  className,
}: {
  activity: SessionActivitySummary | undefined;
  className?: string;
}) {
  const visible = sessionRowActivity(activity);
  if (!visible) {
    return <span className={cn("size-2 shrink-0", className)} aria-hidden="true" />;
  }
  return (
    <span
      className={cn("flex size-2 shrink-0 items-center justify-center", className)}
      data-testid="session-activity"
      data-activity={visible.phase}
    >
      <span
        className={cn("session-activity-dot", `session-activity-dot-${visible.phase}`)}
        title={visible.label}
      >
        <span className="sr-only">{visible.label}</span>
      </span>
    </span>
  );
}
