import { describe, expect, test } from "bun:test";
import { TODO_TOOL_NAME } from "@pho-code/protocol";
import {
  reconstructPlanTodos,
  todosFromToolArgs,
  todosFromToolDetails,
  todosFromToolResult,
} from "../src/todo-tool";

const inspect = { id: "1", content: "Inspect", status: "completed" as const };
const verify = { id: "2", content: "Verify", status: "in_progress" as const };
const todos = [inspect, verify];

describe("todo tool live list", () => {
  test("reads a replacement list from tool args and result details", () => {
    expect(todosFromToolArgs({ todos })).toEqual(todos);
    expect(todosFromToolArgs({ todos: [] })).toEqual([]);
    expect(todosFromToolArgs({ todos: [{ id: "a", content: "x", status: "nope" }] })).toBeUndefined();
    expect(todosFromToolDetails({ todos })).toEqual(todos);
    expect(todosFromToolDetails({ error: "invalid_list" })).toBeUndefined();
    expect(todosFromToolResult({ content: [{ type: "text", text: "ok" }], details: { todos } })).toEqual(todos);
    expect(todosFromToolResult({ details: { error: "invalid_list" } })).toBeUndefined();
  });

  test("reconstructs the latest successful todo result on the branch", () => {
    expect(
      reconstructPlanTodos([
        {
          type: "message",
          message: {
            role: "toolResult",
            toolName: TODO_TOOL_NAME,
            details: { todos: [{ id: "1", content: "Inspect", status: "in_progress" }] },
          },
        },
        {
          type: "message",
          message: {
            role: "toolResult",
            toolName: TODO_TOOL_NAME,
            details: { error: "too_many_in_progress" },
          },
        },
        {
          type: "message",
          message: {
            role: "toolResult",
            toolName: TODO_TOOL_NAME,
            details: { todos },
          },
        },
      ]),
    ).toEqual(todos);
  });
});
