import { useId, useRef, useState } from "react";
import type { ThinkingLevel } from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { useDismissOnOutside } from "./lib/use-dismiss";
import { isMaxThinkingLevel, thinkingLevelLabel } from "./lib/thinking-labels";

export function ThinkingLevelChip({
  level,
  availableLevels,
  disabled,
  onChange,
}: {
  level: ThinkingLevel;
  availableLevels: readonly ThinkingLevel[];
  disabled: boolean;
  onChange: (level: ThinkingLevel) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const label = thinkingLevelLabel(level);
  const isMax = isMaxThinkingLevel(level, availableLevels);

  useDismissOnOutside({ open, ref: rootRef, onDismiss: () => setOpen(false), preventDefaultOnEscape: true });

  return (
    <div className="relative w-fit max-w-full min-w-0 shrink-0" ref={rootRef}>
      <button
        type="button"
        id="thinking-selector"
        data-testid="thinking-selector"
        className={cn("composer-meta-select composer-thinking-select", isMax && "is-max")}
        disabled={disabled || availableLevels.length === 0}
        aria-label={`Thinking level: ${label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Thinking level"
          className="composer-mode-menu composer-thinking-menu"
          data-testid="thinking-level-menu"
        >
          {availableLevels.map((option) => {
            const optionLabel = thinkingLevelLabel(option);
            const selected = option === level;
            return (
              <li key={option} role="none">
                <button
                  type="button"
                  role="option"
                  data-testid={`thinking-level-option-${option}`}
                  className={cn(
                    "composer-mode-option composer-thinking-option",
                    selected && "is-selected",
                    isMaxThinkingLevel(option, availableLevels) && "is-max",
                  )}
                  aria-selected={selected}
                  onClick={() => {
                    setOpen(false);
                    if (option !== level) {
                      onChange(option);
                    }
                  }}
                >
                  <span className="composer-mode-option-label">{optionLabel}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
