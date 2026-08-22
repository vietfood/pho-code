import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { CheckIcon, ChevronDownIcon, ShieldCheckIcon, XIcon } from "lucide-react";
import { formatChangedFileCount, parsePlanTodoList, type TranscriptToolBlock } from "@pho-code/protocol";
import { cn } from "./lib/cn";
import {
  parseWebFetchSource,
  parseWebSearchQuery,
  parseWebSearchResults,
  webToolKind,
  type WebSourceRow,
} from "./lib/web-source";
import { WebSiteIcon } from "./web-site-icon";
import {
  buildToolExpandedSections,
  type ToolExpandedSection,
  toolWorkEntryChip,
  toolWorkEntryHeading,
  toolWorkEntryIcon,
} from "./tool-presentation";
import { SessionTodoList } from "./session-todo-list";
import { WebFetchSource, WebHostStack, WebSearchResultList } from "./web-tool-detail";
import { WorkEntryIcon } from "./work-entry-icon";

const SANDBOX_BASH_SHIELD_LABEL = "Ran in the agent sandbox";

// Collapsed chrome adapted from Beautiful UI ToolChips.tsx (MIT, Shane Levine,
// https://www.beautifului.dev/ retrieved 2026-08-13): icon + label + hover chevron.
// Demo autoplay, fake diffs, and ice-cream copy omitted. Preview after the heading
// is harness-owned quiet text; web search/fetch omit it. Expanded body remains
// harness-owned labeled Input/Output panels. T3 work-entry headings/icons retained.

export function ToolRow({
  block,
  open = false,
  reviewCount,
  onOpenReview,
}: {
  block: TranscriptToolBlock;
  open?: boolean;
  reviewCount?: number;
  onOpenReview?: () => void;
}) {
  const [expanded, setExpanded] = useState(open);
  const heading = toolWorkEntryHeading(block.name, block.status);
  const chip = toolWorkEntryChip(block.name, block.inputPreview, block.outputPreview);
  const webKind = webToolKind(block.name);
  const { searchQuery, searchResults, fetchSource } = webToolChrome(block);
  const allSections = buildToolExpandedSections(block.name, block.inputPreview, block.outputPreview);
  const sections =
    searchQuery || searchResults.length > 0
      ? []
      : fetchSource
        ? allSections.filter((section) => section.id !== "input")
        : allSections;
  const todos = parseTodosFromToolBlock(block);
  const showTodoList = todos !== null && todos.length > 0;
  const canExpand =
    (sections.length > 0 || Boolean(searchQuery) || searchResults.length > 0 || Boolean(fetchSource)) &&
    !showTodoList;
  const failed = block.status === "failed";
  const completed = block.status === "completed";
  const running = block.status === "running";
  const iconName = toolWorkEntryIcon(block.name);
  const rowLabel = [heading, chip?.text, block.sandboxed ? SANDBOX_BASH_SHIELD_LABEL : undefined]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

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
            "aria-label": rowLabel,
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
          {fetchSource ? (
            <span
              className={cn(
                "flex transition-opacity duration-100",
                canExpand && "group-hover/row:opacity-0",
                expanded && "opacity-0",
              )}
            >
              <WebSiteIcon host={fetchSource.host} size="sm" />
            </span>
          ) : (
            <WorkEntryIcon
              name={iconName}
              className={cn(
                "block size-3.5 shrink-0 stroke-[1.8] opacity-80 transition-opacity duration-100",
                canExpand && "group-hover/row:opacity-0",
                expanded && "opacity-0",
              )}
            />
          )}
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
        {block.sandboxed ? (
          <span
            className="flex size-4 shrink-0 items-center justify-center text-icon-muted"
            data-testid="tool-sandbox-shield"
            title={SANDBOX_BASH_SHIELD_LABEL}
            aria-label={SANDBOX_BASH_SHIELD_LABEL}
          >
            <ShieldCheckIcon className="block size-3 shrink-0" aria-hidden="true" />
          </span>
        ) : null}
        {searchResults.length > 0 ? <WebHostStack rows={searchResults} /> : null}
        {chip && webKind === null ? (
          <span
            className="min-w-0 max-w-[14rem] shrink truncate text-[11px] text-muted-foreground"
            data-testid="tool-chip"
            title={chip.title}
          >
            {chip.text}
          </span>
        ) : null}
        <span className="min-w-0 flex-1" />
        {reviewCount !== undefined && reviewCount > 0 ? (
          onOpenReview ? (
            <button
              type="button"
              className="tool-change-count shrink-0 rounded-sm px-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="tool-open-review"
              onClick={(event) => {
                event.stopPropagation();
                onOpenReview();
              }}
              onPointerDown={stopRowToggle}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {formatChangedFileCount(reviewCount)}
            </button>
          ) : (
            <span className="shrink-0 px-1 text-[11px] text-muted-foreground" data-testid="tool-change-count">
              {formatChangedFileCount(reviewCount)}
            </span>
          )
        ) : null}
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
      {todos && todos.length > 0 ? (
        <div className="ms-6 pb-1" data-testid="tool-todo-list" onClick={stopRowToggle} onPointerDown={stopRowToggle}>
          <SessionTodoList todos={todos} compact />
        </div>
      ) : null}
      {expanded && canExpand && !showTodoList ? (
        <div
          className="tool-detail mt-1 ms-6 cursor-default border-s border-border/45 ps-3 pt-0.5"
          data-testid="tool-detail"
          onClick={stopRowToggle}
          onPointerDown={stopRowToggle}
        >
          <div className="flex flex-col gap-2">
            {searchQuery || searchResults.length > 0 ? (
              <WebSearchResultList query={searchQuery} results={searchResults} />
            ) : null}
            {fetchSource ? <WebFetchSource source={fetchSource} /> : null}
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

function stopRowToggle(event: MouseEvent<HTMLElement>): void {
  event.stopPropagation();
}

function webToolChrome(block: TranscriptToolBlock): {
  searchQuery: string | null;
  searchResults: WebSourceRow[];
  fetchSource: WebSourceRow | null;
} {
  const kind = webToolKind(block.name);
  switch (kind) {
    case "search":
      return {
        searchQuery: parseWebSearchQuery(block.inputPreview),
        searchResults: parseWebSearchResults(block.outputPreview),
        fetchSource: null,
      };
    case "fetch":
      return {
        searchQuery: null,
        searchResults: [],
        fetchSource: parseWebFetchSource(block.inputPreview, block.outputPreview),
      };
    case null:
      return { searchQuery: null, searchResults: [], fetchSource: null };
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function parseTodosFromToolBlock(block: TranscriptToolBlock) {
  const trimmed = block.inputPreview.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as { todos?: unknown };
    const result = parsePlanTodoList(parsed.todos);
    return result.ok ? result.todos : null;
  } catch {
    return null;
  }
}
