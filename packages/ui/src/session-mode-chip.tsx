import { useEffect, useId, useRef, useState } from "react";
import { BotIcon, ListTreeIcon } from "lucide-react";
import type { SessionAgentMode } from "@pho-code/protocol";
import { cn } from "./lib/cn";

const SESSION_MODE_OPTIONS = [
  {
    mode: "agent" as const,
    label: "Agent",
    description: "Act on the workspace. File writes stay on.",
  },
  {
    mode: "plan" as const,
    label: "Plan",
    description: "Explore and write a plan. File writes are off. Shell is not sandboxed.",
  },
] as const;

export function SessionModeChip({
  mode,
  disabled,
  onChange,
}: {
  mode: SessionAgentMode;
  disabled: boolean;
  onChange: (mode: SessionAgentMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = SESSION_MODE_OPTIONS.find((option) => option.mode === mode) ?? SESSION_MODE_OPTIONS[0];

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        type="button"
        id="session-mode-selector"
        data-testid="session-mode-selector"
        className={cn(
          "composer-meta-select composer-mode-chip",
          selected.mode === "plan" && "is-plan",
        )}
        disabled={disabled}
        title={selected.description}
        aria-label={selected.label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <SessionModeIcon mode={selected.mode} />
        <span>{selected.label}</span>
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Plan or Agent"
          className="composer-mode-menu"
          data-testid="session-mode-menu"
        >
          {SESSION_MODE_OPTIONS.map((option) => (
            <li key={option.mode} role="none">
              <button
                type="button"
                role="option"
                data-testid={`session-mode-option-${option.mode}`}
                className={cn("composer-mode-option", option.mode === selected.mode && "is-selected")}
                aria-selected={option.mode === selected.mode}
                title={option.description}
                onClick={() => {
                  setOpen(false);
                  if (option.mode !== selected.mode) {
                    onChange(option.mode);
                  }
                }}
              >
                <SessionModeIcon mode={option.mode} />
                <span className="composer-mode-option-label">{option.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SessionModeIcon({ mode }: { mode: SessionAgentMode }) {
  switch (mode) {
    case "agent":
      return <BotIcon className="size-3.5 shrink-0" aria-hidden="true" />;
    case "plan":
      return <ListTreeIcon className="size-3.5 shrink-0" aria-hidden="true" />;
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}
