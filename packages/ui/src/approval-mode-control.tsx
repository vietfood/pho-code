import { useId, useRef, useState } from "react";
import { ShieldAlertIcon, ShieldCheckIcon, ShieldIcon } from "lucide-react";
import type { ApprovalMode, SessionApprovalSnapshot } from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { useDismissOnOutside } from "./lib/use-dismiss";

const MODE_COPY: Record<ApprovalMode, { label: string; compact: string; description: string }> = {
  ask: {
    label: "Ask for approval",
    compact: "Ask",
    description: "Routine contained work runs directly. You decide requests for additional access.",
  },
  auto: {
    label: "Approve for me",
    compact: "Auto",
    description: "Use the same boundary and let an isolated reviewer decide eligible requests.",
  },
  full: {
    label: "Full access",
    compact: "Full",
    description: "Bypass ordinary containment and approval routing for this chat.",
  },
};

export function ApprovalModeControl({
  approval,
  disabled,
  onChange,
  onRevokeAll,
}: {
  approval: SessionApprovalSnapshot;
  disabled: boolean;
  onChange: (mode: ApprovalMode) => void;
  onRevokeAll?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const active = approval.effectiveMode;
  const full = active === "full";
  useDismissOnOutside({ open, ref: rootRef, onDismiss: () => setOpen(false), preventDefaultOnEscape: true });

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        data-testid="approval-mode-control"
        className={cn("composer-context-button", full && "border-destructive/60 bg-destructive/10 text-destructive")}
        disabled={disabled}
        aria-label={`Approval mode: ${MODE_COPY[active].label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <ModeIcon mode={active} className="size-3.5 shrink-0" />
        <span className="composer-context-button-label">{MODE_COPY[active].compact}</span>
      </button>
      {open ? (
        <ul id={menuId} role="menu" aria-label="Approval mode" className="composer-context-menu" data-testid="approval-mode-menu">
          {approval.supportedModes.map(({ mode, reason }) => {
            const copy = MODE_COPY[mode];
            return (
              <li key={mode} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  data-testid={`approval-mode-${mode}`}
                  className={cn("composer-context-menu-option", mode === active && "is-selected", mode === "full" && "text-destructive")}
                  aria-checked={mode === active}
                  title={reason ?? copy.description}
                  onClick={() => {
                    setOpen(false);
                    if (mode !== active) onChange(mode);
                  }}
                >
                  <ModeIcon mode={mode} className="size-3.5 shrink-0" />
                  <span className="grid min-w-0 gap-0.5 text-left">
                    <span className="composer-context-menu-option-label">{copy.label}</span>
                    <span className="text-[10px] leading-snug text-muted-foreground">{reason ?? copy.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {approval.activeSessionGrants > 0 && onRevokeAll ? (
            <li role="none" className="border-t border-border/70 pt-1">
              <button
                type="button"
                role="menuitem"
                data-testid="approval-revoke-session-grants"
                className="composer-context-menu-option text-warning"
                onClick={() => {
                  setOpen(false);
                  onRevokeAll();
                }}
              >
                <ShieldAlertIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="grid min-w-0 gap-0.5 text-left">
                  <span className="composer-context-menu-option-label">Revoke session approvals</span>
                  <span className="text-[10px] leading-snug text-muted-foreground">
                    Clear {approval.activeSessionGrants} memory-only {approval.activeSessionGrants === 1 ? "grant" : "grants"}.
                  </span>
                </span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function ModeIcon({ mode, className }: { mode: ApprovalMode; className?: string }) {
  const Icon = mode === "full" ? ShieldAlertIcon : mode === "auto" ? ShieldCheckIcon : ShieldIcon;
  return <Icon className={className} aria-hidden="true" />;
}
