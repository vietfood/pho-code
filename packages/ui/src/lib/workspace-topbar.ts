import { cn } from "./cn";
import { isMacDesktop } from "./platform";

/** Horizontal padding for the window drag strip. Never combine `px-*` with the
 *  traffic-light `pl-[var(--workspace-titlebar-inset)]` — Tailwind treats those
 *  as conflicting utilities and `px` can win, sliding chrome under the lights. */
export function workspaceTopbarClass({
  leadingInset,
  className,
}: {
  leadingInset: boolean;
  className?: string;
}): string {
  const mac = isMacDesktop();
  const macInset = leadingInset && mac;
  return cn(
    "workspace-topbar drag-region",
    mac && "workspace-topbar-mac",
    macInset ? "pl-[var(--workspace-titlebar-inset)] pr-5" : "px-5",
    className,
  );
}
