import { cn } from "./cn";
import { isMacDesktop } from "./platform";

/** Horizontal padding for the window drag strip. Never combine `px-*` with the
 *  traffic-light `pl-[var(--workspace-titlebar-inset)]` — Tailwind treats those
 *  as conflicting utilities and `px` can win, sliding chrome under the lights. */
export function workspaceTopbarClass({
  leadingInset,
  density = "chat",
  className,
}: {
  leadingInset: boolean;
  density?: "chat" | "sidebar";
  className?: string;
}): string {
  const mac = isMacDesktop();
  const macInset = leadingInset && mac;
  const sidebar = density === "sidebar";
  return cn(
    "workspace-topbar drag-region",
    mac && "workspace-topbar-mac",
    sidebar && (mac ? "justify-end" : "justify-start"),
    macInset
      ? sidebar
        ? "pl-[var(--workspace-titlebar-inset)] pr-2"
        : "pl-[var(--workspace-titlebar-inset)] pr-5"
      : sidebar
        ? "px-2"
        : "px-5",
    className,
  );
}
