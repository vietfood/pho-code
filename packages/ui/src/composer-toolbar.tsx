import type { ReactNode } from "react";
import type { ContextUsageSummary, SessionUsageSummary } from "@pho-code/protocol";
import { ComposerUsage } from "./composer-usage";

// Flat control row under the composer field (Claude Code-inspired layout;
// harness-owned chrome). Mode and run-queue actions lead; model, thinking, and
// the Pi usage meter trail. It replaces the in-field selector row plus the
// separate meta strip so the field itself only holds the prompt.
export function ComposerToolbar({
  leading,
  trailing,
  usage,
  contextUsage,
}: {
  leading?: ReactNode;
  trailing?: ReactNode;
  usage?: SessionUsageSummary;
  contextUsage?: ContextUsageSummary;
}) {
  const hasUsage = Boolean(usage || contextUsage);

  return (
    <div className="composer-toolbar" data-testid="composer-toolbar">
      <div className="composer-toolbar-group">{leading}</div>
      <div className="composer-toolbar-group is-trailing">
        {trailing}
        {hasUsage ? (
          <ComposerUsage
            {...(usage ? { usage } : {})}
            {...(contextUsage ? { contextUsage } : {})}
          />
        ) : null}
      </div>
    </div>
  );
}
