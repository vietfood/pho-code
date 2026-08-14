import { MessageSquareIcon } from "lucide-react";
import type { SessionActivitySummary } from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { sessionRowActivity } from "./lib/session-activity";
import { LoadingDots } from "./loading-dots";

export function SessionLeadingMark({
  activity,
}: {
  activity: SessionActivitySummary | undefined;
}) {
  const visible = sessionRowActivity(activity);
  if (visible?.phase === "working") {
    return (
      <span data-testid="session-activity" data-activity="working">
        <LoadingDots label={visible.label} />
      </span>
    );
  }
  return (
    <span
      className="flex size-3.5 shrink-0 items-center justify-center"
      {...(visible
        ? { "data-testid": "session-activity", "data-activity": visible.phase }
        : {})}
    >
      <MessageSquareIcon
        className={cn(
          "size-3.5",
          visible?.phase === "attention" && "text-warning",
          visible?.phase === "failed" && "text-destructive",
          visible?.phase === "completed" && "text-success",
          !visible && "text-sidebar-muted-foreground",
        )}
        aria-hidden="true"
      />
      {visible ? <span className="sr-only">{visible.label}</span> : null}
    </span>
  );
}
