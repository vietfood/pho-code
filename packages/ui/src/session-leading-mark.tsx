import type { SessionActivitySummary } from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { sessionRowActivity } from "./lib/session-activity";
import { LoadingDots } from "./loading-dots";

// A session row leads with a small dot rather than a chat glyph: filled when the
// row carries state (selected, needs attention, failed, completed) and a hollow
// ring when it is merely idle, so a scanned list reads as one quiet column.

export function SessionLeadingMark({
  activity,
  selected = false,
}: {
  activity: SessionActivitySummary | undefined;
  selected?: boolean;
}) {
  const visible = sessionRowActivity(activity);
  if (visible?.phase === "working") {
    return (
      <span
        className="flex size-3.5 shrink-0 items-center justify-center"
        data-testid="session-activity"
        data-activity="working"
      >
        <LoadingDots label={visible.label} />
      </span>
    );
  }
  const filled = selected || Boolean(visible);
  const tone =
    visible?.phase === "attention"
      ? "text-warning"
      : visible?.phase === "failed"
        ? "text-destructive"
        : visible?.phase === "completed"
          ? "text-success"
          : filled
            ? "text-sidebar-foreground"
            : "text-sidebar-muted-foreground";
  return (
    <span
      className="flex size-3.5 shrink-0 items-center justify-center"
      {...(visible
        ? { "data-testid": "session-activity", "data-activity": visible.phase }
        : {})}
    >
      <span
        data-testid="session-dot"
        data-filled={filled ? "true" : "false"}
        className={cn("block size-1.5 rounded-full border border-current", tone, filled ? "bg-current" : "bg-transparent")}
        aria-hidden="true"
      />
      {visible ? <span className="sr-only">{visible.label}</span> : null}
    </span>
  );
}
