import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import type { TranscriptToolBlock } from "@pho-code/protocol";
import { cn } from "./lib/cn";
import {
  buildToolExpandedBody,
  toolWorkEntryHeading,
  toolWorkEntryIcon,
  toolWorkEntryPreview,
} from "./tool-presentation";
import { WorkEntryIcon } from "./work-entry-icon";

// PlainWorkEntryRow adapted from refs/t3code MessagesTimeline.tsx (MIT, T3 Tools Inc., 6bc6cb6).
// Agent spawn rows, tooltips, and LegendList omitted; Pi tool blocks only.

export function ToolRow({ block }: { block: TranscriptToolBlock }) {
  const [expanded, setExpanded] = useState(false);
  const heading = toolWorkEntryHeading(block.name, block.status);
  const preview = toolWorkEntryPreview(block.name, block.inputPreview, block.outputPreview);
  const displayPreview =
    preview && preview.toLowerCase() === heading.toLowerCase() ? null : preview;
  const expandedBody = buildToolExpandedBody(block.inputPreview, block.outputPreview);
  const canExpand = expandedBody !== null;
  const failed = block.status === "failed";
  const completed = block.status === "completed";
  const running = block.status === "running";
  const iconName = toolWorkEntryIcon(block.name);

  return (
    <div
      className={cn(
        "flex flex-col rounded-md px-0.5 py-0.5 transition-colors motion-reduce:transition-none",
        canExpand &&
          "cursor-pointer hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
      )}
      data-testid="tool-card"
      {...(canExpand
        ? {
            role: "button" as const,
            tabIndex: 0,
            "aria-expanded": expanded,
            "aria-label": displayPreview ? `${heading} - ${displayPreview}` : heading,
            onClick: () => setExpanded((value) => !value),
            onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setExpanded((value) => !value);
              }
            },
          }
        : {})}
    >
      <div className="flex select-none items-center gap-1.5">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center",
            failed ? "text-destructive" : "text-icon-muted",
          )}
        >
          <WorkEntryIcon name={iconName} className="block size-3.5 shrink-0 stroke-[1.8] opacity-80" />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="flex min-w-0 w-full items-baseline gap-1.5 text-[12px] leading-5">
              <span
                className={cn(
                  "min-w-0 shrink truncate font-medium",
                  failed ? "text-destructive" : "text-foreground",
                )}
              >
                {heading}
              </span>
              {displayPreview ? (
                <span className="min-w-0 flex-1 truncate text-secondary-label">{displayPreview}</span>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-px text-icon-muted">
            <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden={!canExpand}>
              {canExpand ? (
                <ChevronDownIcon
                  className={cn(
                    "size-3 shrink-0 opacity-70 transition-transform duration-200 motion-reduce:transition-none",
                    expanded && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              ) : null}
            </span>
            <span className="flex size-4 shrink-0 items-center justify-center">
              {failed ? (
                <XIcon className="block size-3 shrink-0 text-destructive" aria-label="Failed" />
              ) : completed ? (
                <CheckIcon className="block size-3 shrink-0 stroke-current" aria-label="Completed" />
              ) : running ? (
                <span className="size-1.5 rounded-full bg-muted-foreground/50" aria-label="Running" />
              ) : null}
            </span>
          </div>
        </div>
      </div>
      {expanded && canExpand && expandedBody ? (
        <div
          className="mt-1 ms-7 cursor-default border-s border-border/45 ps-3 pt-0.5"
          onClick={stopRowToggle}
          onPointerDown={stopRowToggle}
        >
          <pre className="m-0 max-h-64 cursor-text overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-secondary-label select-text">
            {expandedBody}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function stopRowToggle(event: MouseEvent<HTMLDivElement>): void {
  event.stopPropagation();
}
