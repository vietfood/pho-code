import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckIcon, SearchIcon } from "lucide-react";
import type { ModelSummary } from "@pho-code/protocol";
import { formatRatePerMillion, formatTokenCount } from "./lib/format-tokens";
import { filterModels, groupModelsByProvider } from "./lib/model-picker-groups";
import { cn } from "./lib/cn";
import { ProviderIcon } from "./provider-icon";
import { useDismissOnOutside } from "./lib/use-dismiss";

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
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const filterId = useId();
  const selectedKey = selectedModel ? modelKey(selectedModel) : "";
  const label = selectedModel
    ? selectedModel.name || `${selectedModel.provider}/${selectedModel.id}`
    : models.length === 0
      ? "No model"
      : "Choose model";

  const groups = useMemo(
    () => groupModelsByProvider(filterModels(models, filter)),
    [models, filter],
  );
  const hasQuery = filter.trim().length > 0;
  const noMatches = hasQuery && groups.length === 0;

  useEffect(() => {
    if (!open) {
      setFilter("");
    }
  }, [open]);

  useDismissOnOutside({
    open,
    ref: rootRef,
    onDismiss: () => setOpen(false),
    onKeyDown: (event) => {
      // Type-to-filter without stealing focus on open.
      if (
        event.key.length === 1 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        document.activeElement !== filterRef.current
      ) {
        event.preventDefault();
        setFilter((value) => value + event.key);
        filterRef.current?.focus();
      }
    },
  });

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
        <div className="composer-model-picker-panel" data-testid="model-picker-panel">
          <div className="composer-model-picker-toolbar">
            <div className="composer-model-picker-filter">
              <label className="sr-only" htmlFor={filterId}>
                Filter models
              </label>
              <SearchIcon className="composer-model-picker-filter-icon" aria-hidden="true" />
              <input
                ref={filterRef}
                id={filterId}
                type="search"
                data-testid="model-picker-filter"
                className="composer-model-picker-filter-input"
                placeholder="Search models"
                value={filter}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setFilter(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                }}
              />
            </div>
          </div>
          <ul
            id={listId}
            role="listbox"
            data-testid="model-picker-list"
            className="composer-model-picker-list"
            aria-label="Models"
          >
            {groups.map((group) => (
              <li key={group.provider} role="presentation" className="composer-model-picker-group">
                <div className="composer-model-picker-group-title" role="presentation">
                  <ProviderIcon provider={group.provider} />
                  <span className="truncate">{group.provider}</span>
                </div>
                <ul className="composer-model-picker-group-items" role="group" aria-label={group.provider}>
                  {group.models.map((model) => {
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
                          <span className="min-w-0 flex-1">
                            <span className="composer-model-picker-option-name">
                              {model.name || `${model.provider}/${model.id}`}
                            </span>
                            {model.contextWindow > 0 ? (
                              <span className="composer-model-picker-option-meta">
                                {formatRatePerMillion(model.cost.input)}/
                                {formatRatePerMillion(model.cost.output)}
                                <span className="composer-model-picker-option-sep" aria-hidden="true">
                                  ·
                                </span>
                                {formatTokenCount(model.contextWindow)} ctx
                              </span>
                            ) : null}
                          </span>
                          {selected ? (
                            <CheckIcon className="composer-model-picker-check" aria-hidden="true" />
                          ) : (
                            <span className="composer-model-picker-check-slot" aria-hidden="true" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {noMatches ? (
              <li
                role="presentation"
                className="composer-model-picker-empty"
                data-testid="model-picker-empty"
              >
                No matching models
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function modelKey(model: ModelSummary): string {
  return `${model.provider}/${model.id}`;
}
