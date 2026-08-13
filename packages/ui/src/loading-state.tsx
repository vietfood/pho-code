import { cn } from "./lib/cn";

// Pixel-grid loader adapted from Beautiful UI LoadingState.tsx
// (MIT, Shane Levine, https://www.beautifului.dev/ retrieved 2026-08-13).
// Demo autoplay omitted; elapsed is owned by the parent clock; tokens mapped
// onto Pho CSS variables. Drive is the default waiting-for-agent variant.

export type LoadingStateVariant = "drive" | "dots" | "orbit";

const CHEVRON = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3);
  const column = index % 3;
  return (column + Math.abs(row - 1)) * 90;
});

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const ORBIT = Array.from({ length: 9 }, (_, index) => {
  const order = ORBIT_ORDER.indexOf(index);
  return order === -1 ? null : order * 110;
});

const PATTERNS: Record<
  LoadingStateVariant,
  { delays: readonly (number | null)[]; durationMs: number; round: boolean }
> = {
  drive: { delays: CHEVRON, durationMs: 650, round: false },
  dots: { delays: CHEVRON, durationMs: 650, round: true },
  orbit: { delays: ORBIT, durationMs: 950, round: false },
};

export function LoadingState({
  label = "Working",
  elapsed,
  variant = "drive",
  className,
}: {
  label?: string;
  elapsed: string;
  variant?: LoadingStateVariant;
  className?: string;
}) {
  const pattern = PATTERNS[variant];

  return (
    <div
      className={cn("loading-state", className)}
      data-testid="agent-loading"
      data-variant={variant}
      aria-label={`${label} ${elapsed}`}
    >
      <span aria-hidden="true" className="loading-state-grid">
        {pattern.delays.map((delay, index) => (
          <span
            key={index}
            className={cn("loading-state-pixel", pattern.round && "is-round")}
            style={
              delay === null
                ? { opacity: 0.07, animation: "none" }
                : {
                    opacity: 0.15,
                    animation: `pixel-on ${pattern.durationMs}ms ease-in-out ${delay}ms infinite`,
                  }
            }
          />
        ))}
      </span>
      <span className="loading-state-label">{label}</span>
      <span className="loading-state-elapsed">{elapsed}</span>
    </div>
  );
}
