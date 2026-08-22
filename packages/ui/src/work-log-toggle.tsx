import { useEffect, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "./lib/cn";
import { workedForLabel } from "./lib/work-log";
import { WorkingLabel } from "./working-label";

// Codex-inspired single disclosure for an entire assistant turn.
// Visual reference only (no Codex source). Collapses all thinking/tool steps at once.
// Settled labels are activity summaries; live labels still use wall-clock “Working for …”.
// Live chrome: Beautiful UI sparkle + shimmer-text (MIT, Shane Levine).

export function WorkLogToggle({
  label,
  expanded,
  onToggle,
  live = false,
  startedAt,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  live?: boolean;
  startedAt?: string;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!live) {
      return;
    }
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);

  const text = live
    ? workedForLabel({
        live: true,
        ...(startedAt ? { startedAt } : {}),
        nowMs,
      })
    : label;

  return (
    <button
      type="button"
      className={cn(
        "flex w-fit max-w-full cursor-pointer items-center gap-1 rounded-md px-0.5 py-0.5 text-left text-[12px] leading-5",
        "text-secondary-label transition-colors motion-reduce:transition-none hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
      )}
      aria-expanded={expanded}
      data-testid="work-log-toggle"
      onClick={onToggle}
    >
      <WorkingLabel text={text} live={live} />
      <ChevronRightIcon
        className={cn(
          "size-3.5 shrink-0 opacity-70 transition-transform duration-200 motion-reduce:transition-none",
          expanded && "rotate-90",
        )}
        aria-hidden="true"
      />
    </button>
  );
}
