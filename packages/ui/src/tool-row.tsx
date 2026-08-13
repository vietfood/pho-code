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

// Collapsed chrome adapted from Beautiful UI ToolChips.tsx (MIT, Shane Levine,
// https://www.beautifului.dev/ retrieved 2026-08-13): icon + label + preview chip.
// Demo autoplay, fake diffs, and ice-cream copy omitted. Expanded body remains
// harness-owned labeled Input/Output panels. T3 work-entry headings/icons retained.

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
        "tool-chip-row flex flex-col rounded-md px-0.5 py-0.5 transition-colors motion-reduce:transition-none",
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
      <div className="group/row flex h-7 min-w-0 select-none items-center gap-2">
        <span
          className={cn(
            "relative flex size-4 shrink-0 items-center justify-center",
            failed ? "text-destructive" : "text-icon-muted",
          )}
        >
          <WorkEntryIcon
            name={iconName}
            className={cn(
              "block size-3.5 shrink-0 stroke-[1.8] opacity-80 transition-opacity duration-100",
              canExpand && "group-hover/row:opacity-0",
              expanded && "opacity-0",
            )}
          />
          {canExpand ? (
            <ChevronDownIcon
              className={cn(
                "absolute size-3 shrink-0 opacity-0 transition-[opacity,transform] duration-150 motion-reduce:transition-none",
                "group-hover/row:opacity-70",
                expanded ? "rotate-0 opacity-70" : "-rotate-90",
              )}
              aria-hidden="true"
            />
          ) : null}
        </span>
        <span
          className={cn(
            "shrink-0 text-[12.5px] font-medium",
            failed ? "text-destructive" : "text-foreground",
          )}
        >
          {heading}
        </span>
        {displayPreview ? (
          <span className="tool-chip min-w-0 flex-1 truncate font-mono" data-testid="tool-chip">
            {displayPreview}
          </span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
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
      {expanded && canExpand ? (
        <div
          className="tool-detail mt-1 ms-6 cursor-default border-s border-border/45 ps-3 pt-0.5"
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
