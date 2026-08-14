import { ShieldIcon } from "lucide-react";
import { Button } from "./ui/button";

export function ProjectTrustBanner({
  sessionTrusted,
  disabled,
  onTrust,
  onDismiss,
}: {
  sessionTrusted: boolean;
  disabled?: boolean;
  onTrust: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="mx-3 mt-2 flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm sm:mx-5"
      role="status"
      data-testid="project-trust-banner"
    >
      <ShieldIcon className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs leading-relaxed">
        {sessionTrusted
          ? "This workspace's permission rules apply for this session. Trust the project so they load again next time."
          : "This project is not trusted. Until you trust it, only the global permission policy applies."}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          data-testid="project-trust-banner-trust"
          onClick={onTrust}
        >
          Trust
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          data-testid="project-trust-banner-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss project trust notice"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
