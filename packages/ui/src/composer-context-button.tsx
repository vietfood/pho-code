import { useEffect, useId, useRef, useState } from "react";
import { BotIcon, ListTreeIcon, PaperclipIcon } from "lucide-react";
import type { SessionAgentMode } from "@pho-code/protocol";
import { cn } from "./lib/cn";

const MODE_OPTIONS = [
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

export function ComposerContextButton({
  mode,
  disabled,
  onModeChange,
  onAttach,
  attachDisabled,
  attachTitle,
}: {
  mode: SessionAgentMode;
  disabled: boolean;
  onModeChange?: (mode: SessionAgentMode) => void;
  onAttach?: () => void;
  attachDisabled: boolean;
  attachTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const showMode = Boolean(onModeChange);
  const showAttach = Boolean(onAttach);

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

  if (!showMode && !showAttach) {
    return null;
  }

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        data-testid="composer-context-button"
        className={cn(
          "composer-context-button",
          mode === "agent" ? "is-agent" : "is-plan",
        )}
        disabled={disabled}
        aria-label={`${mode === "agent" ? "Agent" : "Plan"} mode and attachments`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <SessionModeIcon mode={mode} className="size-3.5" />
      </button>
      {open ? (
        <ul
          id={listId}
          role="menu"
          aria-label="Composer context"
          className="composer-context-menu"
          data-testid="composer-context-menu"
        >
          {showMode ? (
            <li role="presentation" className="composer-context-menu-section">
              <span className="composer-context-menu-heading">Mode</span>
              <ul className="composer-context-menu-items" role="group" aria-label="Mode">
                {MODE_OPTIONS.map((option) => (
                  <li key={option.mode} role="none">
                    <button
                      type="button"
                      role="menuitemradio"
                      data-testid={`composer-context-mode-${option.mode}`}
                      className={cn(
                        "composer-context-menu-option",
                        option.mode === mode && "is-selected",
                        option.mode === "agent" ? "is-agent" : "is-plan",
                      )}
                      aria-checked={option.mode === mode}
                      title={option.description}
                      onClick={() => {
                        setOpen(false);
                        if (option.mode !== mode) {
                          onModeChange?.(option.mode);
                        }
                      }}
                    >
                      <SessionModeIcon mode={option.mode} className="size-3.5 shrink-0" />
                      <span className="composer-context-menu-option-label">{option.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ) : null}
          {showAttach ? (
            <li role="presentation" className="composer-context-menu-section">
              <span className="composer-context-menu-heading">Attach</span>
              <ul className="composer-context-menu-items" role="group" aria-label="Attach">
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="composer-context-attach"
                    className="composer-context-menu-option"
                    disabled={attachDisabled}
                    title={attachTitle}
                    onClick={() => {
                      setOpen(false);
                      if (!attachDisabled) {
                        onAttach?.();
                      }
                    }}
                  >
                    <PaperclipIcon className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="composer-context-menu-option-label">Images…</span>
                  </button>
                </li>
              </ul>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function SessionModeIcon({ mode, className }: { mode: SessionAgentMode; className?: string }) {
  switch (mode) {
    case "agent":
      return <BotIcon className={className} aria-hidden="true" />;
    case "plan":
      return <ListTreeIcon className={className} aria-hidden="true" />;
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}
