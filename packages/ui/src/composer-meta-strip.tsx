import { FolderIcon } from "lucide-react";
import type { ContextUsageSummary, PlanTodoItem, SessionUsageSummary } from "@pho-code/protocol";
import { ComposerUsage } from "./composer-usage";
import { sessionTodoChipLabel } from "./session-todo-list";

export function ComposerMetaStrip({
  metaHint,
  sessionTodos,
  onOpenPlan,
  usage,
  contextUsage,
}: {
  metaHint?: string;
  sessionTodos: readonly PlanTodoItem[];
  onOpenPlan?: () => void;
  usage?: SessionUsageSummary;
  contextUsage?: ContextUsageSummary;
}) {
  const todoLabel = sessionTodoChipLabel(sessionTodos);
  const showTodo = Boolean(todoLabel && onOpenPlan);
  const hasUsage = Boolean(usage || contextUsage);
  const visible = Boolean(metaHint || showTodo || hasUsage);

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
      {showTodo ? (
        <button
          type="button"
          className="composer-meta-strip-todo"
          data-testid="composer-meta-todo"
          title="Open plan todos"
          onClick={onOpenPlan}
        >
          {todoLabel}
        </button>
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
