import { FolderIcon } from "lucide-react";
import type { ContextUsageSummary, SessionUsageSummary } from "@pho-code/protocol";
import { ComposerUsage } from "./composer-usage";

export function ComposerMetaStrip({
  metaHint,
  usage,
  contextUsage,
}: {
  metaHint?: string;
  usage?: SessionUsageSummary;
  contextUsage?: ContextUsageSummary;
}) {
  const hasUsage = Boolean(usage || contextUsage);
  const visible = Boolean(metaHint || hasUsage);

  if (!visible) {
    return null;
  }

  return (
    <div
      className="composer-meta-strip"
      data-testid="composer-meta-strip"
    >
      {metaHint ? (
        <div className="composer-meta-strip-folder">
          <FolderIcon className="size-3 shrink-0 opacity-70" aria-hidden="true" />
          <span className="min-w-0 truncate">{metaHint}</span>
        </div>
      ) : null}
      {hasUsage ? (
        <div className="composer-meta-strip-usage">
          <ComposerUsage
            {...(usage ? { usage } : {})}
            {...(contextUsage ? { contextUsage } : {})}
          />
        </div>
      ) : null}
    </div>
  );
}
