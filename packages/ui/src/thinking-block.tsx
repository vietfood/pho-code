import { useState, type KeyboardEvent } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "./lib/cn";
import { WorkEntryIcon } from "./work-entry-icon";

// Thinking work-entry row adapted from refs/t3code MessagesTimeline.tsx tone:"thinking"
// PlainWorkEntryRow (MIT, T3 Tools Inc., 6bc6cb6).

export function ThinkingBlock({
  text,
  open,
  live = false,
}: {
  text: string;
  open?: boolean;
  live?: boolean;
}) {
  const [expanded, setExpanded] = useState(open ?? live);
  const preview = text.replace(/\s+/gu, " ").trim();
  const shortPreview = preview.length > 100 ? `${preview.slice(0, 97)}…` : preview;

  return (
    <div
      className={cn(
        "thinking-block flex flex-col rounded-md px-0.5 py-0.5 transition-colors motion-reduce:transition-none",
        "cursor-pointer hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
      )}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      data-testid={live ? "thinking-status" : "thinking-block"}
      onClick={() => setExpanded((value) => !value)}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setExpanded((value) => !value);
        }
      }}
    >
      <div className="flex select-none items-center gap-1.5">
        <span className="flex size-5 shrink-0 items-center justify-center text-foreground">
          <WorkEntryIcon name="bot" className="block size-3.5 shrink-0 stroke-[1.8] opacity-80" />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="flex min-w-0 w-full items-baseline gap-1.5 text-[12px] leading-5">
              <span className="min-w-0 shrink truncate font-medium text-foreground">
                {live ? "Thinking" : "Thought"}
              </span>
              {!expanded && shortPreview ? (
                <span className="min-w-0 flex-1 truncate text-secondary-label">{shortPreview}</span>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-px text-icon-muted">
            <span className="flex size-4 shrink-0 items-center justify-center">
              <ChevronDownIcon
                className={cn(
                  "size-3 shrink-0 opacity-70 transition-transform duration-200 motion-reduce:transition-none",
                  expanded && "rotate-180",
                )}
                aria-hidden="true"
              />
            </span>
            {live ? (
              <span className="flex size-4 items-center justify-center" aria-hidden="true">
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 motion-reduce:animate-none" />
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {expanded ? (
        <div className="thinking-block-body mt-1 ms-7 border-s border-border/45 ps-3 pt-0.5">
          <p className="m-0 whitespace-pre-wrap text-[12px] leading-relaxed text-secondary-label">{text}</p>
        </div>
      ) : null}
    </div>
  );
}
