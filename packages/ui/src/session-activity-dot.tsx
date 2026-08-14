import type { SessionActivitySummary } from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { sessionRowActivity } from "./lib/session-activity";

export function SessionActivityDot({
  activity,
}: {
  activity: SessionActivitySummary | undefined;
}) {
  const visible = sessionRowActivity(activity);
  if (!visible) {
    return <span className="size-5" aria-hidden="true" />;
  }
  return (
    <span className="flex size-5 items-center justify-center" data-testid="session-activity" data-activity={visible.phase}>
      <span
        className={cn("session-activity-dot", `session-activity-dot-${visible.phase}`)}
        title={visible.label}
      >
        <span className="sr-only">{visible.label}</span>
      </span>
    </span>
  );
}
