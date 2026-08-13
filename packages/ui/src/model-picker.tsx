import { useEffect, useId, useRef, useState } from "react";
import type { ModelSummary } from "@pho-code/protocol";
import { formatRatePerMillion, formatTokenCount } from "./lib/format-tokens";
import { cn } from "./lib/cn";
import { ProviderIcon } from "./provider-icon";

export function ModelPicker({
  models,
  selectedModel,
  disabled,
  onModelChange,
}: {
  models: readonly ModelSummary[];
  selectedModel?: ModelSummary;
  disabled: boolean;
  onModelChange: (model: ModelSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectedKey = selectedModel ? modelKey(selectedModel) : "";
  const label = selectedModel
    ? selectedModel.name || `${selectedModel.provider}/${selectedModel.id}`
    : models.length === 0
      ? "No model"
      : "Choose model";

  useEffect(() => {
    if (!open) {
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

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        type="button"
        id="model-selector"
        data-testid="model-selector"
        className="composer-meta-select composer-field-select composer-model-picker-trigger"
        disabled={disabled || models.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        {selectedModel ? <ProviderIcon provider={selectedModel.provider} /> : null}
        <span className="min-w-0 truncate">{label}</span>
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          data-testid="model-picker-list"
          className="composer-model-picker-list"
          aria-label="Models"
        >
          {models.map((model) => {
            const key = modelKey(model);
            const selected = key === selectedKey;
            return (
              <li key={key} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-testid="model-picker-option"
                  className={cn("composer-model-picker-option", selected && "is-selected")}
                  onClick={() => {
                    onModelChange(model);
                    setOpen(false);
                  }}
                >
                  <ProviderIcon provider={model.provider} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {model.name || `${model.provider}/${model.id}`}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                      {formatRatePerMillion(model.cost.input)}/{formatRatePerMillion(model.cost.output)} per 1M
                      {" · "}
                      {formatTokenCount(model.contextWindow)} ctx
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function modelKey(model: ModelSummary): string {
  return `${model.provider}/${model.id}`;
}
