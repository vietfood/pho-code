import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { cn } from "./lib/cn";
import type { ChatTabs } from "./lib/chat-tabs";
import { LoadingDots } from "./loading-dots";
import { Button } from "./ui/button";

// Claude-desktop-style flat tab strip living in the region topbar row: plain
// text tabs with a hover close control, no boxes, and a flat edge-to-edge
// content area (no floating window card).

export interface ChatTabHostProps {
  tabs: ChatTabs;
  /** Region topbar chrome; the host injects the tab strip into its middle slot. */
  renderTopbar: (tabStrip: ReactNode) => ReactNode;
  tabTitle: (key: string) => string;
  tabRunning?: (key: string) => boolean;
  renderTab: (key: string) => ReactNode;
  onSelectTab: (key: string) => void;
  onCloseTab: (key: string) => void;
  /** New-session affordance at the strip's leading edge (active workspace). */
  onNewTab?: () => void;
}

export function ChatTabHost({
  tabs,
  renderTopbar,
  tabTitle,
  tabRunning,
  renderTab,
  onSelectTab,
  onCloseTab,
  onNewTab,
}: ChatTabHostProps) {
  const active = tabs.active && tabs.tabs.includes(tabs.active) ? tabs.active : (tabs.tabs[0] ?? null);

  function onStripKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    if (!active) {
      return;
    }
    event.preventDefault();
    const index = tabs.tabs.indexOf(active);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs.tabs[(index + delta + tabs.tabs.length) % tabs.tabs.length];
    if (next) {
      onSelectTab(next);
    }
  }

  const tabStrip = (
    <div
      role="tablist"
      aria-label="Open chats"
      className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
      data-testid="chat-tab-strip"
      onKeyDown={onStripKeyDown}
    >
      {onNewTab ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New session"
          data-testid="chat-tab-new"
          className="no-drag size-5 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onNewTab}
        >
          <PlusIcon className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}
      {tabs.tabs.map((key) => {
        const title = tabTitle(key);
        const selected = key === active;
        return (
          <span
            key={key}
            className={cn(
              "group flex min-w-0 max-w-44 shrink-0 items-center rounded-md",
              selected ? "bg-foreground/8" : "hover:bg-foreground/5",
            )}
            data-testid="chat-tab"
            data-session-key={key}
            data-active={selected ? "true" : "false"}
          >
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              title={title}
              className={cn(
                "no-drag flex min-w-0 items-center gap-1.5 py-1 ps-2 pe-1 text-xs",
                selected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground/80",
              )}
              data-testid="chat-tab-select"
              onClick={() => onSelectTab(key)}
            >
              {tabRunning?.(key) ? <LoadingDots label="Running" className="shrink-0" /> : null}
              <span className="min-w-0 truncate">{title}</span>
            </button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Close ${title}`}
              data-testid="chat-tab-close"
              data-session-key={key}
              className={cn(
                "no-drag me-0.5 size-4 shrink-0",
                selected ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
              onClick={() => onCloseTab(key)}
            >
              <XIcon className="size-2.5" aria-hidden="true" />
            </Button>
          </span>
        );
      })}
    </div>
  );

  return (
    <div
      className="chat-tab-host flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-testid="chat-tab-host"
    >
      {renderTopbar(tabStrip)}
      {active ? (
        <section
          key={active}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          data-testid="chat-window"
          data-session-key={active}
          aria-label={tabTitle(active)}
        >
          {renderTab(active)}
        </section>
      ) : null}
    </div>
  );
}
