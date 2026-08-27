import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon, InfoIcon } from "lucide-react";
import type { AgentBackendDescriptor } from "@pho-code/protocol";
import { cn } from "./lib/cn";

export function BackendPicker({
  backends,
  selectedBackendId,
  disabled,
  onBackendChange,
}: {
  backends: readonly AgentBackendDescriptor[];
  selectedBackendId: string;
  disabled: boolean;
  onBackendChange: (backendId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = backends.find((backend) => backend.id === selectedBackendId);

  useEffect(() => {
    if (!open) {
      setInfoOpen(false);
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (backends.length < 2) {
    return null;
  }

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        type="button"
        className="composer-meta-select composer-field-select composer-backend-picker-trigger"
        data-testid="backend-selector"
        disabled={disabled}
        aria-label={`Agent backend: ${selected?.label ?? selectedBackendId}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0 truncate">{selected?.label ?? selectedBackendId}</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-60" aria-hidden="true" />
      </button>
      {open ? (
        <div className="composer-model-picker-panel composer-backend-picker-panel" data-testid="backend-menu">
          <div role="menu" aria-label="Agent backends" className="composer-backend-picker-list">
            {backends.map((backend) => {
              const isSelected = backend.id === selectedBackendId;
              return (
                <button
                  key={backend.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  className={cn("composer-model-picker-option", isSelected && "is-selected")}
                  data-testid={`backend-${backend.id}`}
                  onClick={() => {
                    setOpen(false);
                    if (!isSelected) {
                      onBackendChange(backend.id);
                    }
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="composer-model-picker-option-name">{backend.label}</span>
                    <span className="composer-model-picker-option-meta">
                      {backend.id === "pi" ? "Built in" : "Experimental · starts a new session"}
                    </span>
                  </span>
                  {isSelected ? (
                    <CheckIcon className="composer-model-picker-check" aria-hidden="true" />
                  ) : (
                    <span className="composer-model-picker-check-slot" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="composer-backend-picker-info">
            <button
              type="button"
              className="composer-backend-picker-info-button"
              aria-label="Backend information"
              aria-expanded={infoOpen}
              onClick={() => setInfoOpen((value) => !value)}
            >
              <InfoIcon className="size-3.5" aria-hidden="true" />
            </button>
            {infoOpen ? (
              <p data-testid="backend-disclosure">
                Switching backend starts a separate session. Codex and Claude are separately installed agents with their own accounts, configuration, tools, and process permissions.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
