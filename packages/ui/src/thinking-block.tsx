import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "./lib/cn";
import { ConservativeMarkdown } from "./markdown";
import { thoughtWorkEntryChip } from "./tool-presentation";
import { WorkEntryIcon } from "./work-entry-icon";

// Thinking work-entry row adapted from refs/t3code MessagesTimeline.tsx tone:"thinking"
// PlainWorkEntryRow (MIT, T3 Tools Inc., 6bc6cb6). Settled expanded body uses harness
// markdown; live thinking stays plaintext so deltas do not re-parse.

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
  const heading = live ? "Thinking" : "Thought";
  const chip = expanded ? null : thoughtWorkEntryChip(text);

  useEffect(() => {
    if (live) {
      setExpanded(true);
      return;
    }
    if (open === false) {
      setExpanded(false);
    }
  }, [live, open]);

  return (
    <div className="thinking-block flex flex-col rounded-md px-0.5 py-0.5">
      <div
        className={cn(
          "flex cursor-pointer select-none items-center gap-1.5 rounded-md transition-colors motion-reduce:transition-none",
          "hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
        )}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={[heading, chip?.text].filter(Boolean).join(" · ")}
        data-testid={live ? "thinking-status" : "thinking-block"}
        onClick={() => setExpanded((value) => !value)}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((value) => !value);
          }
        }}
      >
        <span className="flex size-5 shrink-0 items-center justify-center text-foreground">
          <WorkEntryIcon name="bot" className="block size-3.5 shrink-0 stroke-[1.8] opacity-80" />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <p className="shrink-0 text-[12px] leading-5 font-medium text-foreground">{heading}</p>
          {chip ? (
            <span className="tool-chip min-w-0 shrink truncate" data-testid="thought-chip" title={chip.title}>
              {chip.text}
            </span>
          ) : null}
          <span className="min-w-0 flex-1" />
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
        <div
          className="thinking-block-body mt-1 ms-7 border-s border-border/45 ps-3 pt-0.5"
          onClick={stopRowToggle}
          onPointerDown={stopRowToggle}
        >
          {live ? (
            <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-secondary-label">
              {text}
            </p>
          ) : (
            <ConservativeMarkdown
              text={text}
              className="chat-markdown-dense text-[12px] leading-relaxed text-secondary-label"
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function stopRowToggle(event: MouseEvent<HTMLDivElement>): void {
  event.stopPropagation();
}
