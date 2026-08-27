import { useEffect, useRef, useState } from "react";
import { CheckIcon, InfoIcon } from "lucide-react";
import type { AgentBackendDescriptor } from "@pho-code/protocol";
import { BackendIcon, backendIconKind } from "./backend-icon";
import { cn } from "./lib/cn";
import { useDismissOnOutside } from "./lib/use-dismiss";

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
  const selectedKind = backendIconKind(selectedBackendId);

  useEffect(() => {
    if (!open) {
      setInfoOpen(false);
    }
  }, [open]);

  useDismissOnOutside({ open, ref: rootRef, onDismiss: () => setOpen(false) });

  if (backends.length < 2) {
    return null;
  }

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        type="button"
        className={cn("composer-backend-picker-trigger", `is-${selectedKind}`)}
        data-testid="backend-selector"
        data-backend-kind={selectedKind}
        disabled={disabled}
        aria-label={`Agent backend: ${selected?.label ?? selectedBackendId}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <BackendIcon backendId={selectedBackendId} />
        <span className="composer-backend-picker-label">{selected?.label ?? selectedBackendId}</span>
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
                  <BackendIcon backendId={backend.id} />
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
