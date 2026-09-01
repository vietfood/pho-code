import { describe, expect, test } from "bun:test";
import type {
  AuthorizerLog,
  PermissionQuery,
  PromptPermissionDetails,
} from "@gotgenes/pi-permission-system";
import { authorizePhoOwnedAsk, type CapturedPermissionAsk } from "../src/approval-permission";

const log = { review: () => undefined } as unknown as AuthorizerLog;
const query = {} as PermissionQuery;

describe("approval permission authorizer", () => {
  test("delegates only exact local tool-call asks and captures bounded evidence", () => {
    const captured: CapturedPermissionAsk[] = [];
    const local: PromptPermissionDetails = {
      requestId: "permission-1",
      source: "tool_call",
      agentName: null,
      message: "review",
      toolCallId: "call-1",
      toolName: "bash",
      command: "git push origin main",
    };
    expect(authorizePhoOwnedAsk(local, query, log, (ask) => captured.push(ask))).toEqual({ kind: "allow" });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ toolCallId: "call-1", requestId: "permission-1", toolName: "bash" });

    for (const details of [
      { ...local, toolCallId: undefined },
      { ...local, source: "skill_input" as const },
      { ...local, forwarding: { requesterAgentName: "child", requesterSessionId: "sub-1" } },
    ]) {
      expect(authorizePhoOwnedAsk(details, query, log, (ask) => captured.push(ask))).toEqual({ kind: "defer" });
    }
    expect(captured).toHaveLength(1);
  });
});
