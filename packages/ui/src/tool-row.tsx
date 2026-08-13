import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import type { TranscriptToolBlock } from "@pho-code/protocol";
import { cn } from "./lib/cn";
import {
  buildToolExpandedSections,
  type ToolExpandedSection,
  toolWorkEntryHeading,
  toolWorkEntryIcon,
  toolWorkEntryPreview,
} from "./tool-presentation";
import { WorkEntryIcon } from "./work-entry-icon";

// PlainWorkEntryRow adapted from refs/t3code MessagesTimeline.tsx (MIT, T3 Tools Inc., 6bc6cb6).
// Agent spawn rows, tooltips, and LegendList omitted; Pi tool blocks only.
// Expanded body is harness-owned: labeled Input/Output panels with parsed payloads.

export function ToolRow({ block, open = false }: { block: TranscriptToolBlock; open?: boolean }) {
  const [expanded, setExpanded] = useState(open);
  const heading = toolWorkEntryHeading(block.name, block.status);
  const preview = toolWorkEntryPreview(block.name, block.inputPreview, block.outputPreview);
  const displayPreview =
    preview && preview.toLowerCase() === heading.toLowerCase() ? null : preview;
  const sections = buildToolExpandedSections(block.name, block.inputPreview, block.outputPreview);
  const canExpand = sections.length > 0;
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
      {expanded && canExpand ? (
        <div
          className="tool-detail mt-1 ms-7 cursor-default border-s border-border/45 ps-3 pt-0.5"
          data-testid="tool-detail"
          onClick={stopRowToggle}
          onPointerDown={stopRowToggle}
        >
          <div className="flex flex-col gap-2">
            {sections.map((section) => (
              <ToolDetailSection key={section.id} section={section} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToolDetailSection({ section }: { section: ToolExpandedSection }) {
  const body =
    section.language === "bash" ? formatShellBody(section.text) : section.text;

  return (
    <div className="tool-detail-section min-w-0">
      <div className="tool-detail-label mb-1 select-none text-[10px] font-medium uppercase tracking-wide text-icon-muted">
        {section.label}
      </div>
      <pre
        className={cn(
          "tool-detail-body m-0 max-h-64 cursor-text overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-secondary/70 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-secondary-label select-text dark:bg-input/28",
          section.language === "bash" && "tool-detail-shell",
        )}
        data-language={section.language}
      >
        {body}
      </pre>
    </div>
  );
}

function formatShellBody(command: string): string {
  const trimmed = command.replace(/^\s*\$\s*/u, "");
  return `$ ${trimmed}`;
}

function stopRowToggle(event: MouseEvent<HTMLDivElement>): void {
  event.stopPropagation();
}
