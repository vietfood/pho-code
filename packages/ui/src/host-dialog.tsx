import { useEffect, useRef, useState, type RefObject } from "react";
import { CheckIcon } from "lucide-react";
import type { HostDialogRequest, ResolveHostDialogInput } from "@pho-code/protocol";
import { handleDialogTab } from "./lib/dialog-focus";
import { hostDialogEnterResolution } from "./lib/host-dialog-keys";
import { cn } from "./lib/cn";
import { Button } from "./ui/button";

// Inline pending-approval card adapted from refs/t3code ComposerPendingApprovalPanel.tsx
// and ComposerPendingUserInputPanel.tsx (MIT, T3 Tools Inc., 6bc6cb6). Centered modal
// overlay removed; sits in the composer dock like Cursor / Claude Desktop.

export function HostDialog({
  request,
  onResolve,
}: {
  request: HostDialogRequest;
  onResolve: (resolution: Omit<ResolveHostDialogInput, "requestId">) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onResolveRef = useRef(onResolve);
  const selectedRef = useRef(request.options?.[0] ?? "");
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState(request.options?.[0] ?? "");

  useEffect(() => {
    onResolveRef.current = onResolve;
  }, [onResolve]);

  useEffect(() => {
    setDraft("");
    const initial = request.options?.[0] ?? "";
    setSelected(initial);
    selectedRef.current = initial;
  }, [request.options, request.requestId]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Focus and key handlers bind once per request. Do not depend on `onResolve`
  // identity — parent re-renders on every stream tick and would steal focus /
  // interrupt clicks while the permission dialog is open.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (request.kind === "input" || request.kind === "select") {
      inputRef.current?.focus();
    } else {
      confirmRef.current?.focus();
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onResolveRef.current({ cancelled: true });
        return;
      }
      const plain =
        !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.isComposing;
      if (request.kind === "select" && plain) {
        const digit = Number.parseInt(event.key, 10);
        if (!Number.isNaN(digit) && digit >= 1 && digit <= 9) {
          const option = request.options?.[digit - 1];
          if (option) {
            event.preventDefault();
            setSelected(option);
            return;
          }
        }
      }
      if (event.key === "Enter" && plain) {
        // Buttons already activate on Enter; avoid double-resolve.
        if (event.target instanceof HTMLElement && event.target.closest("button")) {
          return;
        }
        const resolution = hostDialogEnterResolution(request.kind, selectedRef.current);
        if (resolution) {
          event.preventDefault();
          onResolveRef.current(resolution);
          return;
        }
      }
      const panel = panelRef.current;
      if (panel) {
        handleDialogTab(event, panel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [request.kind, request.options, request.requestId]);

  return (
    <div
      ref={panelRef}
      className="mb-2 overflow-hidden rounded-[22px] border border-border/70 bg-card/95 text-card-foreground shadow-sm"
      role="dialog"
      aria-labelledby="host-dialog-title"
      data-testid="extension-dialog"
    >
      <div className="px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold tracking-[0.18em] text-secondary-label uppercase">
            {request.kind === "input" ? "Input required" : "Pending approval"}
          </span>
        </div>
        <h2 id="host-dialog-title" className="m-0 text-sm font-medium text-foreground">
          {request.title}
        </h2>
        {request.message ? (
          <div className="mt-3 rounded-lg border border-border/65 bg-background/70 p-3">
            <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
              {request.message}
            </pre>
          </div>
        ) : null}
        {request.kind === "select" ? (
          <SelectFields
            request={request}
            selected={selected}
            onSelectedChange={setSelected}
            inputRef={inputRef}
            onResolve={onResolve}
          />
        ) : null}
        {request.kind === "input" ? (
          <InputFields
            request={request}
            draft={draft}
            onDraftChange={setDraft}
            inputRef={inputRef}
            onResolve={onResolve}
          />
        ) : null}
        {request.kind === "confirm" ? (
          <form
            className="mt-4 flex flex-wrap items-center justify-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onResolve({ confirmed: true });
            }}
          >
            <Button type="button" variant="outline" size="sm" onClick={() => onResolve({ cancelled: true, confirmed: false })}>
              Decline
            </Button>
            <Button ref={confirmRef} size="sm" data-testid="extension-dialog-confirm" type="submit">
              Approve
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function SelectFields({
  request,
  selected,
  onSelectedChange,
  inputRef,
  onResolve,
}: {
  request: HostDialogRequest;
  selected: string;
  onSelectedChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onResolve: (resolution: Omit<ResolveHostDialogInput, "requestId">) => void;
}) {
  const options = request.options ?? [];
  return (
    <form
      className="mt-3 grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (selected.length === 0) {
          return;
        }
        onResolve({ selected });
      }}
    >
      <div role="radiogroup" aria-labelledby="host-dialog-title" className="grid gap-1.5">
        {options.map((option, index) => {
          const isSelected = selected === option;
          const shortcut = index < 9 ? index + 1 : null;
          return (
            <label
              key={option}
              className={cn(
                "group flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left outline-none transition-colors motion-reduce:transition-none",
                isSelected
                  ? "border-primary/30 bg-primary/8 text-foreground"
                  : "border-transparent bg-muted/22 text-foreground/85 hover:border-border/45 hover:bg-muted/34",
              )}
            >
              <input
                ref={index === 0 ? inputRef : undefined}
                type="radio"
                className="sr-only"
                name={`host-dialog-${request.requestId}`}
                value={option}
                checked={isSelected}
                onChange={() => onSelectedChange(option)}
              />
              <span className="min-w-0 flex-1 text-sm font-medium">{option}</span>
              {isSelected ? (
                <CheckIcon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              ) : shortcut !== null ? (
                <kbd className="rounded border border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-secondary-label">
                  {shortcut}
                </kbd>
              ) : null}
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onResolve({ cancelled: true })}>
          Cancel
        </Button>
        <Button size="sm" data-testid="extension-dialog-confirm" disabled={options.length === 0} type="submit">
          Continue
        </Button>
      </div>
    </form>
  );
}

function InputFields({
  request,
  draft,
  onDraftChange,
  inputRef,
  onResolve,
}: {
  request: HostDialogRequest;
  draft: string;
  onDraftChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onResolve: (resolution: Omit<ResolveHostDialogInput, "requestId">) => void;
}) {
  return (
    <form
      className="mt-3 grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onResolve({ value: draft });
      }}
    >
      <input
        ref={inputRef}
        className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="extension-dialog-input"
        placeholder={request.placeholder ?? ""}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onResolve({ cancelled: true })}>
          Cancel
        </Button>
        <Button data-testid="extension-dialog-confirm" size="sm" type="submit">
          Continue
        </Button>
      </div>
    </form>
  );
}
