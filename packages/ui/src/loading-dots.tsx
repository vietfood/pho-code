import { cn } from "./lib/cn";

// Compact Dots mark adapted from Beautiful UI Loading State
// (MIT, Shane Levine, https://www.beautifului.dev/ retrieved 2026-08-14).
// Pixel-grid, Drive, Orbit, shimmer label, and elapsed timer omitted.

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
      <span className="loading-dots__mark" aria-hidden="true" />
      <span className="loading-dots__mark" aria-hidden="true" />
      <span className="loading-dots__mark" aria-hidden="true" />
    </span>
  );
}
