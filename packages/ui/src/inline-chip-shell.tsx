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
