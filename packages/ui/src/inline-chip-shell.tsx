import type { ReactNode } from "react";
import { cn } from "./lib/cn";

// T3 Code composer inline chip shell (refs/t3code ComposerPromptEditor.tsx, MIT).
// The shell carries line-flow alignment; the inner pill keeps chip styling.
export function InlineChipShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("mention-chip-shell", className)}>{children}</span>;
}

export function InlineChip({
  className,
  data,
  title,
  ariaLabel,
  icon,
  label,
}: {
  className?: string;
  data: Record<string, string>;
  title: string;
  ariaLabel: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <InlineChipShell>
      <span className={cn("mention-chip", className)} {...data} title={title} aria-label={ariaLabel}>
        {icon}
        <span className="mention-chip-label">{label}</span>
      </span>
    </InlineChipShell>
  );
}
