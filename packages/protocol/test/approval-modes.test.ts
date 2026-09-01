import { describe, expect, test } from "bun:test";
import {
  PROTOCOL_VERSION,
  RUNTIME_EVENT_TYPES,
  applyRuntimeEvent,
  defaultSessionApprovalSnapshot,
  emptyConversationState,
  isApprovalMode,
  isDurableApprovalMode,
  isJsonSafeValue,
} from "../src";

describe("approval modes protocol", () => {
  test("uses shared agent modes and never accepts Full as a durable default", () => {
    expect(isApprovalMode("full")).toBe(true);
    expect(isDurableApprovalMode("auto")).toBe(true);
    expect(isDurableApprovalMode("full")).toBe(false);
    expect(isJsonSafeValue(defaultSessionApprovalSnapshot())).toBe(true);
  });

  test("keeps typed approval requests separate from generic host dialogs", () => {
    const request = {
      backendId: "pi",
      workspaceId: "workspace",
      sessionId: "session",
      requestId: "request-1",
      source: "automatic-review" as const,
      action: { title: "Connect to example.com?", summary: "Send a bounded public request." },
    };
    const requested = applyRuntimeEvent(emptyConversationState(), {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 1,
      type: RUNTIME_EVENT_TYPES.approvalRequest,
      occurredAt: "2026-09-01T00:00:00.000Z",
      payload: request,
    });
    expect(requested.approvalRequest).toEqual(request);
    expect(requested.dialog).toBeNull();

    const settled = applyRuntimeEvent(requested, {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 2,
      type: RUNTIME_EVENT_TYPES.approvalRequestSettled,
      occurredAt: "2026-09-01T00:00:01.000Z",
      payload: { workspaceId: "workspace", sessionId: "session", requestId: "request-1" },
    });
    expect(settled.approvalRequest).toBeNull();
  });
});
