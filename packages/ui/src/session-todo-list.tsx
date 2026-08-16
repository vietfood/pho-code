import {
  completedPlanTodoCount,
  type PlanTodoItem,
  type PlanTodoStatus,
} from "@pho-code/protocol";
import { cn } from "./lib/cn";

export function sessionTodoChipLabel(todos: readonly PlanTodoItem[]): string | null {
  if (todos.length === 0) {
    return null;
  }
  const completed = completedPlanTodoCount(todos);
  const inProgress = todos.find((item) => item.status === "in_progress");
  if (inProgress) {
    return `${completed}/${todos.length} · ${inProgress.content}`;
  }
  return `${completed}/${todos.length}`;
}

export function SessionTodoList({
  todos,
  compact = false,
}: {
  todos: readonly PlanTodoItem[];
  compact?: boolean;
}) {
  if (todos.length === 0) {
    return null;
  }
  return (
    <ul
      className={cn("session-todo-list", compact && "is-compact")}
      data-testid="session-todo-list"
    >
      {todos.map((item) => (
        <li key={item.id} className="session-todo-item" data-status={item.status}>
          <span className="session-todo-mark" aria-hidden="true">
            {todoMark(item.status)}
          </span>
          <span className={cn("session-todo-content", item.status === "completed" && "is-done")}>
            {item.content}
          </span>
        </li>
      ))}
    </ul>
  );
}

function todoMark(status: PlanTodoStatus): string {
  switch (status) {
    case "completed":
      return "✓";
    case "in_progress":
      return "●";
    case "pending":
      return "○";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
