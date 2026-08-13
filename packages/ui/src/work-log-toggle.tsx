import { ChevronRightIcon } from "lucide-react";
import { cn } from "./lib/cn";

// Codex-inspired single “Worked for …” disclosure for an entire assistant turn.
// Visual reference only (no Codex source). Collapses all thinking/tool steps at once.

export function WorkLogToggle({
  label,
  expanded,
  onToggle,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) {
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
      <span className="min-w-0 truncate font-medium">{label}</span>
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
