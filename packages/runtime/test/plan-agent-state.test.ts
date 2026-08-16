import { describe, expect, test } from "bun:test";
import { ASK_USER_QUESTION_TOOL_NAME, EXECUTE_PLAN_TOOL_NAME, TODO_TOOL_NAME, UPDATE_PLAN_DOCUMENT_TOOL_NAME } from "@pho-code/protocol";
import {
  collectPlanAgentRecord,
  emptyPlanAgentRecord,
  intersectPlanActiveTools,
  isCursorSdkToolName,
  isPlanForbiddenTool,
  PLAN_AGENT_CUSTOM_TYPE,
  planExecuteFinishedByTodos,
  planExecuteRefusal,
  planExecuteRefusalMessage,
  projectSessionPlan,
  writesOffInPlan,
} from "../src/plan-agent-state";
import { TRASH_TOOL_NAME } from "../src/trash-target";

const registered = [
  "read",
  "bash",
  "write",
  "edit",
  TRASH_TOOL_NAME,
  ASK_USER_QUESTION_TOOL_NAME,
  UPDATE_PLAN_DOCUMENT_TOOL_NAME,
  TODO_TOOL_NAME,
  EXECUTE_PLAN_TOOL_NAME,
  "web_search",
  "cursor_ask_question",
];

describe("plan-agent tool intersection", () => {
  test("Plan drops write tools and Cursor SDK tools even when context prompt left them on", () => {
    const names = intersectPlanActiveTools({
      registeredNames: registered,
      contextEnabledNames: registered,
      mode: "plan",
      executing: false,
    });
    expect(names).toContain("read");
    expect(names).toContain("bash");
    expect(names).toContain("web_search");
    expect(names).toContain(ASK_USER_QUESTION_TOOL_NAME);
    expect(names).toContain(UPDATE_PLAN_DOCUMENT_TOOL_NAME);
    expect(names).toContain(TODO_TOOL_NAME);
    expect(names).toContain(EXECUTE_PLAN_TOOL_NAME);
    expect(names).not.toContain("write");
    expect(names).not.toContain("edit");
    expect(names).not.toContain(TRASH_TOOL_NAME);
    expect(names).not.toContain("cursor_ask_question");
  });

  test("does not restore write tools when the owner disabled bash in context prompt", () => {
    const names = intersectPlanActiveTools({
      registeredNames: registered,
      contextEnabledNames: ["read", "write", ASK_USER_QUESTION_TOOL_NAME],
      mode: "plan",
      executing: false,
    });
    expect(names).toEqual([
      "read",
      ASK_USER_QUESTION_TOOL_NAME,
      TODO_TOOL_NAME,
      UPDATE_PLAN_DOCUMENT_TOOL_NAME,
      EXECUTE_PLAN_TOOL_NAME,
    ]);
  });

  test("Execute restores the context-enabled set including writes", () => {
    const names = intersectPlanActiveTools({
      registeredNames: registered,
      contextEnabledNames: ["read", "write", "bash"],
      mode: "agent",
      executing: true,
    });
    expect(names).toEqual(["read", "bash", "write", ASK_USER_QUESTION_TOOL_NAME, TODO_TOOL_NAME]);
    expect(names).not.toContain(EXECUTE_PLAN_TOOL_NAME);
  });

  test("Agent idle does not expose execute_plan", () => {
    const names = intersectPlanActiveTools({
      registeredNames: registered,
      contextEnabledNames: registered,
      mode: "agent",
      executing: false,
    });
    expect(names).not.toContain(EXECUTE_PLAN_TOOL_NAME);
    expect(names).toContain("write");
  });

  test("treats cursor_* tools as forbidden in Plan", () => {
    expect(isCursorSdkToolName("cursor")).toBe(true);
    expect(isCursorSdkToolName("cursor_activate_skill")).toBe(true);
    expect(isCursorSdkToolName("bash")).toBe(false);
    expect(isPlanForbiddenTool("write")).toBe(true);
    expect(writesOffInPlan({ mode: "plan", executing: false, documentMarkdown: "" })).toBe(true);
    expect(writesOffInPlan({ mode: "agent", executing: true, documentMarkdown: "" })).toBe(false);
  });

  test("clears Execute when the reconstructed todo list has no remaining items", () => {
    expect(
      planExecuteFinishedByTodos({ mode: "agent", executing: true, documentMarkdown: "# Plan" }, []),
    ).toBe(true);
    expect(
      planExecuteFinishedByTodos(
        { mode: "agent", executing: true, documentMarkdown: "# Plan" },
        [{ id: "a", content: "Left", status: "pending" }],
      ),
    ).toBe(false);
    expect(planExecuteFinishedByTodos(emptyPlanAgentRecord(), [])).toBe(false);
  });

  test("Execute from the button and execute_plan share the same Plan-mode gate", () => {
    expect(planExecuteRefusal({ mode: "plan", executing: false, documentMarkdown: "# Plan" })).toBeUndefined();
    expect(planExecuteRefusal({ mode: "plan", executing: true, documentMarkdown: "# Plan" })).toBe("already_executing");
    expect(planExecuteRefusal({ mode: "agent", executing: false, documentMarkdown: "# Plan" })).toBe("not_in_plan");
    expect(planExecuteRefusalMessage("not_in_plan")).toContain("Plan mode only");
  });

  test("projects JSONL custom entries onto the session snapshot", () => {
    const record = collectPlanAgentRecord([
      { type: "custom", customType: PLAN_AGENT_CUSTOM_TYPE, data: { ...emptyPlanAgentRecord(), mode: "plan" } },
      {
        type: "custom",
        customType: PLAN_AGENT_CUSTOM_TYPE,
        data: { mode: "plan", executing: false, documentMarkdown: "# Steps" },
      },
    ]);
    expect(projectSessionPlan(record)).toMatchObject({
      mode: "plan",
      documentMarkdown: "# Steps",
      todos: [],
    });
  });
});
