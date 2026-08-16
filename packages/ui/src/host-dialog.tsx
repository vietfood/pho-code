import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowUpIcon, ChevronDownIcon, XIcon } from "lucide-react";
import type { HostDialogRequest, ResolveHostDialogInput } from "@pho-code/protocol";
import { handleDialogTab } from "./lib/dialog-focus";
import { hostDialogEnterResolution } from "./lib/host-dialog-keys";
import { cn } from "./lib/cn";
import { AskUserCard } from "./ask-user-card";
import {
  isPermissionDecisionOptions,
  PERMISSION_DENY_WITH_REASON,
  permissionSelectResolution,
  presentPermissionChoices,
  presentPermissionMessage,
  type PermissionChoice,
} from "./permission-prompt";

// Compact composer-dock approval card. Visual density adapted from Beautiful UI
// ApprovalCard.tsx (MIT, Shane Levine, https://www.beautifului.dev/ retrieved 2026-08-13):
// title + dismiss, compact radio rows, footer send arrow. Multi-question pager,
// auto-advance, and demo “answers sent” omitted — one Pi host prompt at a time.
// Focus loop, Escape, digit shortcuts, and Enter confirm remain harness-owned.
// Permission-prompt summary + collapsed raw request is harness-owned.
// Earlier T3 ComposerPendingApprovalPanel chrome (MIT) is retained as provenance.

export function HostDialog({
  request,
  onResolve,
}: {
  request: HostDialogRequest;
  onResolve: (resolution: Omit<ResolveHostDialogInput, "requestId">) => void;
}) {
  if (request.kind === "questionnaire") {
    return <AskUserCard request={request} onResolve={onResolve} />;
  }
  return <PermissionApprovalCard request={request} onResolve={onResolve} />;
}

function PermissionApprovalCard({
  request,
  onResolve,
}: {
  request: HostDialogRequest;
  onResolve: (resolution: Omit<ResolveHostDialogInput, "requestId">) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const onResolveRef = useRef(onResolve);
  const selectedRef = useRef(request.options?.[0] ?? "");
  const draftRef = useRef("");
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState(request.options?.[0] ?? "");
  const choices = presentPermissionChoices(request.options ?? []);
  const permissionDock = isPermissionDecisionOptions(request.options ?? []);
  const presented = request.message ? presentPermissionMessage(request.message) : null;
  const title =
    permissionDock && presented?.showRaw && presented.summary
      ? headingFromSummary(presented.summary)
      : request.title;

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

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (permissionDock && selected === PERMISSION_DENY_WITH_REASON) {
      reasonRef.current?.focus();
    }
  }, [permissionDock, selected]);

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
          const option = presentPermissionChoices(request.options ?? [])[digit - 1]?.value;
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
        if (request.kind === "select") {
          const resolution = permissionSelectResolution(selectedRef.current, draftRef.current);
          if (resolution.selected.length > 0) {
            event.preventDefault();
            onResolveRef.current(resolution);
          }
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

  const cancel = () => {
    if (request.kind === "confirm") {
      onResolve({ cancelled: true, confirmed: false });
      return;
    }
    onResolve({ cancelled: true });
  };

  const eyebrow = request.kind === "input" ? "Input required" : "Pending approval";
  const confirmLabel = request.kind === "confirm" ? "Approve" : "Continue";
  const declineLabel = request.kind === "confirm" ? "Decline" : "Cancel";
  const canSubmit = request.kind !== "select" || selected.length > 0;
  const showEyebrow = !permissionDock;
  const showMessage =
    Boolean(request.message) &&
    (!permissionDock ||
      Boolean(presented?.caution) ||
      Boolean(presented?.target) ||
      Boolean(presented?.showRaw));

  return (
    <div
      ref={panelRef}
      className="approval-card mb-2 text-card-foreground"
      role="dialog"
      aria-labelledby="host-dialog-title"
      data-testid="extension-dialog"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          switch (request.kind) {
            case "confirm":
              onResolve({ confirmed: true });
              return;
            case "select":
              if (selected.length === 0) {
                return;
              }
              onResolve(permissionSelectResolution(selected, draft));
              return;
            case "input":
              onResolve({ value: draft });
              return;
            case "questionnaire":
              return;
            default: {
              const exhaustive: never = request.kind;
              return exhaustive;
            }
          }
        }}
      >
        <div className="approval-card-body">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {showEyebrow ? <p className="approval-card-eyebrow m-0">{eyebrow}</p> : null}
              <h2 id="host-dialog-title" className="approval-card-title m-0">
                {title}
              </h2>
            </div>
            <button
              type="button"
              className="approval-card-icon-button"
              aria-label="Dismiss"
              onClick={cancel}
            >
              <XIcon className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          {showMessage && request.message ? (
            <HostDialogMessage
              key={request.requestId}
              message={request.message}
              compact={permissionDock}
            />
          ) : null}
          {request.kind === "select" ? (
            <SelectFields
              request={request}
              choices={choices}
              selected={selected}
              onSelectedChange={setSelected}
              inputRef={inputRef}
              showReason={permissionDock && selected === PERMISSION_DENY_WITH_REASON}
              reason={draft}
              onReasonChange={setDraft}
              reasonRef={reasonRef}
              showShortcuts={!permissionDock}
            />
          ) : null}
          {request.kind === "input" ? (
            <InputField
              request={request}
              draft={draft}
              onDraftChange={setDraft}
              inputRef={inputRef}
            />
          ) : null}
        </div>
        <div className="approval-card-footer">
          <button type="button" className="approval-card-text-action" onClick={cancel}>
            {declineLabel}
          </button>
          <button
            ref={confirmRef}
            type="submit"
            className="approval-card-send"
            data-testid="extension-dialog-confirm"
            aria-label={confirmLabel}
            disabled={!canSubmit}
          >
            <ArrowUpIcon className="size-3.5 stroke-[2.4]" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}

function headingFromSummary(summary: string): string {
  return summary.endsWith(".") ? summary.slice(0, -1) : summary;
}

function HostDialogMessage({
  message,
  compact = false,
}: {
  message: string;
  compact?: boolean;
}) {
  const presented = presentPermissionMessage(message);
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="approval-card-explain">
      {presented.summary && !compact ? (
        <p className="approval-card-summary" data-testid="extension-dialog-summary">
          {presented.summary}
        </p>
      ) : null}
      {presented.caution ? <p className="approval-card-caution">{presented.caution}</p> : null}
      {presented.target ? (
        <div className={cn("approval-card-target", compact && "is-bare")}>
          {compact ? null : (
            <span className="approval-card-target-label">{presented.target.label}</span>
          )}
          <span className="approval-card-target-value">{presented.target.value}</span>
        </div>
      ) : null}
      {presented.showRaw ? (
        <div className="approval-card-raw">
          <button
            type="button"
            className="approval-card-raw-toggle"
            aria-expanded={showRaw}
            data-testid="extension-dialog-view-request"
            onClick={() => setShowRaw((value) => !value)}
          >
            <ChevronDownIcon
              className={cn(
                "size-3 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
                showRaw ? "rotate-0" : "-rotate-90",
              )}
              aria-hidden="true"
            />
            {showRaw ? "Hide request" : "View request"}
          </button>
          {showRaw ? (
            <pre className="approval-card-message" data-testid="extension-dialog-raw-request">
              {presented.rawDetail}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SelectFields({
  request,
  choices,
  selected,
  onSelectedChange,
  inputRef,
  showReason,
  reason,
  onReasonChange,
  reasonRef,
  showShortcuts,
}: {
  request: HostDialogRequest;
  choices: PermissionChoice[];
  selected: string;
  onSelectedChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  showReason: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  reasonRef: RefObject<HTMLInputElement | null>;
  showShortcuts: boolean;
}) {
  return (
    <>
      <div role="radiogroup" aria-labelledby="host-dialog-title" className="approval-card-options">
        {choices.map((choice, index) => {
          const isSelected = selected === choice.value;
          const shortcut = index < 9 ? index + 1 : null;
          return (
            <label
              key={choice.value}
              className={cn("approval-option", isSelected && "is-selected")}
            >
              <input
                ref={index === 0 ? inputRef : undefined}
                type="radio"
                className="sr-only"
                name={`host-dialog-${request.requestId}`}
                value={choice.value}
                checked={isSelected}
                onChange={() => onSelectedChange(choice.value)}
              />
              <span className="approval-radio" aria-hidden="true">
                <span className="approval-radio-dot" />
              </span>
              <span className="approval-option-label">{choice.label}</span>
              {showShortcuts && shortcut !== null && !isSelected ? (
                <kbd className="approval-option-key" aria-hidden="true">
                  {shortcut}
                </kbd>
              ) : null}
            </label>
          );
        })}
      </div>
      {showReason ? (
        <label className="approval-input-row">
          <span aria-hidden="true" className="approval-radio is-spacer" />
          <input
            ref={reasonRef}
            className="approval-input"
            data-testid="extension-dialog-reason"
            aria-label="Optional reason"
            placeholder="Optional reason"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
          />
        </label>
      ) : null}
    </>
  );
}

function InputField({
  request,
  draft,
  onDraftChange,
  inputRef,
}: {
  request: HostDialogRequest;
  draft: string;
  onDraftChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className="approval-input-row">
      <span aria-hidden="true" className="approval-radio is-spacer" />
      <input
        ref={inputRef}
        className="approval-input"
        data-testid="extension-dialog-input"
        placeholder={request.placeholder ?? "Type something…"}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
      />
    </label>
  );
}
