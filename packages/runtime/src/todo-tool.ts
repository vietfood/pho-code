/**
 * Session todo list: Cursor-style merge-replace, persisted in tool-result details.
 * Branch reconstruction follows Pi `examples/extensions/todo.ts` (MIT, earendil-works/pi
 * 0.84.1): scan `sessionManager.getBranch()` for this tool's result details so resume
 * and a later fork see the list at that point. Do not copy the TUI `/todos` overlay.
 */
import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import {
  PLAN_TODO_MAX_CONTENT_CHARS,
  PLAN_TODO_MAX_ITEMS,
  TODO_TOOL_NAME,
  parsePlanTodoList,
  remainingPlanTodoCount,
  type PlanTodoItem,
} from "@pho-code/protocol";

export interface TodoToolDetails {
  todos?: PlanTodoItem[];
  error?: string;
}

export interface TodoBranchEntry {
  type?: string;
  message?: {
    role?: string;
    toolName?: string;
    details?: unknown;
  };
}

const TODO_PROMPT_SNIPPET =
  "Replace the session todo list (pending / in_progress / completed). At most one item in progress.";

const TODO_PROMPT_GUIDELINES: string[] = [
  "Call todo with the full replacement list whenever you start multi-step work, change progress, or finish items. Empty todos: [] clears the list.",
  `At most ${PLAN_TODO_MAX_ITEMS} items, ${PLAN_TODO_MAX_CONTENT_CHARS} characters per content, and at most one in_progress item.`,
  "This list is session-scoped and works in Agent and Plan. Do not treat [DONE:n] in assistant prose as todo state.",
];

export function remainingPlanTodos(todos: readonly PlanTodoItem[]): PlanTodoItem[] {
  return todos.filter((item) => item.status === "pending" || item.status === "in_progress");
}

export function formatTodoList(todos: readonly PlanTodoItem[]): string {
  if (todos.length === 0) {
    return "Cleared the todo list.";
  }
  const remaining = remainingPlanTodoCount(todos);
  const lines = todos.map((item) => {
    const mark = item.status === "completed" ? "x" : item.status === "in_progress" ? "/" : " ";
    return `- [${mark}] ${item.id}: ${item.content}`;
  });
  return `${todos.length - remaining}/${todos.length} completed\n${lines.join("\n")}`;
}

export function reconstructPlanTodos(entries: readonly unknown[]): PlanTodoItem[] {
  let current: PlanTodoItem[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as TodoBranchEntry;
    if (record.type !== "message") {
      continue;
    }
    const message = record.message;
    if (!message || message.role !== "toolResult" || message.toolName !== TODO_TOOL_NAME) {
      continue;
    }
    const details = message.details as TodoToolDetails | undefined;
    if (!details || details.error !== undefined) {
      continue;
    }
    const parsed = parsePlanTodoList(details.todos);
    if (parsed.ok) {
      current = parsed.todos;
    }
  }
  return current;
}

export function createTodoTool() {
  return defineTool({
    name: TODO_TOOL_NAME,
    label: "Todo",
    description: `Replace the session todo list. Use this to track work in Agent and Plan.
The call replaces the whole list (Cursor merge-replace). Empty todos: [] clears it.
Rules: at most one in_progress item; at most ${PLAN_TODO_MAX_ITEMS} items; ${PLAN_TODO_MAX_CONTENT_CHARS} characters per content.
Do not encode progress as [DONE:n] in chat — only this tool changes the list.`,
    promptSnippet: TODO_PROMPT_SNIPPET,
    promptGuidelines: TODO_PROMPT_GUIDELINES,
    parameters: Type.Object({
      todos: Type.Array(
        Type.Object({
          id: Type.String({ description: "Stable id for this item within the list." }),
          content: Type.String({
            description: `What to do (max ${PLAN_TODO_MAX_CONTENT_CHARS} characters).`,
          }),
          status: Type.String({
            description: 'One of "pending", "in_progress", or "completed". At most one in_progress.',
          }),
        }),
        {
          description: `Full replacement list (0-${PLAN_TODO_MAX_ITEMS}). Empty array clears.`,
        },
      ),
    }),
            async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const parsed = parsePlanTodoList(params.todos);
      if (!parsed.ok) {
        return {
          content: [{ type: "text" as const, text: parsed.message }],
          details: { error: parsed.error } satisfies TodoToolDetails,
        };
      }
      return {
        content: [{ type: "text" as const, text: formatTodoList(parsed.todos) }],
        details: { todos: parsed.todos } satisfies TodoToolDetails,
      };
    },
  });
}
