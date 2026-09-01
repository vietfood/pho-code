import { CircleAlertIcon, CircleCheckIcon, LoaderCircleIcon, ShieldXIcon } from "lucide-react";
import type { ApprovalReviewActivity } from "@pho-code/protocol";

const COPY = {
  approved: { label: "Approved automatically", Icon: CircleCheckIcon, tone: "text-success" },
  blocked: { label: "Blocked automatically", Icon: ShieldXIcon, tone: "text-destructive" },
  "owner-required": { label: "Owner decision needed", Icon: CircleAlertIcon, tone: "text-warning" },
  unavailable: { label: "Reviewer unavailable", Icon: CircleAlertIcon, tone: "text-warning" },
} as const;

export function ApprovalReviewActivityView({
  activity,
  onRetry,
}: {
  activity?: ApprovalReviewActivity;
  onRetry?: (requestId: string) => void;
}) {
  if (!activity) return null;
  if (activity.state === "reviewing") {
    return (
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs" data-testid="approval-review-activity" role="status">
        <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Reviewing access…
      </div>
    );
  }
  if (!activity.outcome) return null;
  const { label, Icon, tone } = COPY[activity.outcome];
  const effectiveLabel = activity.retryArmed ? "Exact retry ready" : label;
  return (
    <div className="mb-2 flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs" data-testid="approval-review-activity" role="status">
      <Icon className={`mt-0.5 size-3.5 shrink-0 ${tone}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{effectiveLabel}</span>
        {activity.rationale ? <span className="mt-0.5 block text-muted-foreground">{activity.rationale}</span> : null}
        {activity.outcome === "blocked" && !activity.retryArmed && onRetry ? (
          <button
            type="button"
            className="mt-1.5 rounded-md border border-border bg-background px-2 py-1 font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onRetry(activity.requestId)}
          >
            Review exact retry
          </button>
        ) : null}
      </span>
    </div>
  );
}
