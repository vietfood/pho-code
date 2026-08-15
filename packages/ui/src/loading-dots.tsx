import { cn } from "./lib/cn";

// Compact 3×3 running mark inspired by Cursor's agent-list indicator
// (screenshot reference only; original CSS). Beautiful UI Dots omitted.

const MARK_COUNT = 9;

export function LoadingDots({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn("loading-dots", className)}
      title={label}
      role="img"
      aria-label={label}
    >
      {Array.from({ length: MARK_COUNT }, (_, index) => (
        <span key={index} className="loading-dots__mark" aria-hidden="true" />
      ))}
    </span>
  );
}
