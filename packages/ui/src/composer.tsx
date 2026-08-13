import { useLayoutEffect, useRef } from "react";
import { ArrowUpIcon, FolderIcon, SquareIcon } from "lucide-react";
import type {
  ContextUsageSummary,
  ModelSummary,
  SessionUsageSummary,
  ThinkingLevel,
} from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { ComposerUsage } from "./composer-usage";
import { isMaxThinkingLevel, thinkingLevelLabel } from "./lib/thinking-labels";
import { ModelPicker } from "./model-picker";

// Docked composer chrome adapted from refs/t3code ChatView composer dock and
// ComposerPrimaryActions.tsx (MIT, T3 Tools Inc., 6bc6cb6). In-field model/thinking
// controls and empty-session hero layout are harness-owned Cursor-inspired chrome.
// Slash menus, attachments, and stash omitted.
// Usage strip inspired by Pi TUI footer / AI Elements Context (bar, not ring).

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  disabled,
  running,
  models,
  selectedModel,
  thinkingLevel,
  availableThinkingLevels,
  supportsThinking,
  selectorsDisabled,
  onModelChange,
  onThinkingChange,
  metaHint,
  usage,
  contextUsage,
  variant = "docked",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  disabled: boolean;
  running: boolean;
  models: readonly ModelSummary[];
  selectedModel?: ModelSummary;
  thinkingLevel: ThinkingLevel;
  availableThinkingLevels: readonly ThinkingLevel[];
  supportsThinking: boolean;
  selectorsDisabled: boolean;
  onModelChange: (model: ModelSummary) => void;
  onThinkingChange: (level: ThinkingLevel) => void;
  metaHint?: string;
  usage?: SessionUsageSummary;
  contextUsage?: ContextUsageSummary;
  variant?: "docked" | "hero";
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const showThinking = supportsThinking || availableThinkingLevels.length > 1;
  const hero = variant === "hero";

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, hero ? 240 : 200)}px`;
  }, [hero, value]);

  const selectors = (
    <>
      <label className="sr-only" htmlFor="model-selector">
        Model
      </label>
      <ModelPicker
        models={models}
        disabled={selectorsDisabled || models.length === 0}
        onModelChange={onModelChange}
        {...(selectedModel ? { selectedModel } : {})}
      />
      {showThinking ? (
        <>
          <label className="sr-only" htmlFor="thinking-selector">
            Thinking level
          </label>
          <select
            id="thinking-selector"
            data-testid="thinking-selector"
            className={cn(
              "composer-meta-select composer-thinking-select",
              isMaxThinkingLevel(thinkingLevel, availableThinkingLevels) && "is-max",
            )}
            value={thinkingLevel}
            disabled={selectorsDisabled || availableThinkingLevels.length === 0}
            onChange={(event) => onThinkingChange(event.target.value as ThinkingLevel)}
          >
            {availableThinkingLevels.map((level) => (
              <option key={level} value={level}>
                {thinkingLevelLabel(level)}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </>
  );

  const submit = running ? (
    <button
      type="button"
      className="relative isolate flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive enabled:cursor-pointer hover:bg-destructive/25 disabled:opacity-30"
      data-testid="stop-button"
      aria-label="Stop"
      onClick={onStop}
    >
      <SquareIcon className="size-3 fill-current" aria-hidden="true" />
    </button>
  ) : (
    <button
      type="submit"
      className={cn(
        "relative isolate flex size-7 shrink-0 items-center justify-center rounded-full bg-message-action text-message-action-foreground enabled:cursor-pointer hover:opacity-90 disabled:pointer-events-none disabled:opacity-30",
      )}
      disabled={disabled || value.trim() === ""}
      aria-label="Send"
    >
      <ArrowUpIcon className="size-3.5 stroke-[2.2]" aria-hidden="true" />
    </button>
  );

  const usageStrip =
    usage || contextUsage ? (
      <ComposerUsage
        {...(usage ? { usage } : {})}
        {...(contextUsage ? { contextUsage } : {})}
      />
    ) : null;

  return (
    <form
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        if (!running) {
          onSubmit();
        }
      }}
    >
      <label className="sr-only" htmlFor="composer-input">
        Message
      </label>
      <div className="chat-composer-shell">
        <div className={cn("chat-composer-host", hero ? "px-3.5 pt-3 pb-2.5" : "px-3 pt-2.5 pb-2")}>
          <div className={cn("relative z-10", hero ? "flex flex-col" : "flex items-end gap-1.5")}>
            <textarea
              ref={textareaRef}
              id="composer-input"
              data-testid="composer"
              className={cn(
                "min-w-0 resize-none bg-transparent py-1.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground",
                hero ? "max-h-[240px] min-h-[4.5rem] w-full" : "max-h-[200px] min-h-7 flex-1",
              )}
              value={value}
              disabled={disabled && !running}
              placeholder={running ? "Agent is working…" : hero ? "Ask anything" : "Send follow-up"}
              rows={hero ? 3 : 1}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!running && !disabled) {
                    onSubmit();
                  }
                }
              }}
            />
            <div
              className={cn(
                "flex shrink-0 items-center",
                hero ? "mt-1.5 justify-between gap-2" : "gap-0.5 pb-0.5",
              )}
            >
              {hero ? (
                <>
                  <div className="flex min-w-0 items-center gap-0.5">{selectors}</div>
                  {submit}
                </>
              ) : (
                <>
                  {selectors}
                  {submit}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {usageStrip || (!hero && metaHint) ? (
        <div className="mt-1.5 flex min-w-0 items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground">
          <div className="min-w-0">{usageStrip}</div>
          {!hero && metaHint ? (
            <div className="flex min-w-0 items-center gap-1">
              <FolderIcon className="size-3 shrink-0 opacity-70" aria-hidden="true" />
              <span className="min-w-0 truncate">{metaHint}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
