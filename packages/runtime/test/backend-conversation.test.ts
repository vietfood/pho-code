import { describe, expect, test } from "bun:test";
import type { AgentSessionSnapshot } from "@pho-code/protocol";
import { projectBackendConversation } from "../src/backend-conversation";

function snapshot(status: AgentSessionSnapshot["run"]["status"]): AgentSessionSnapshot {
  return {
    key: { scopeId: "/workspace", sessionId: "session-1" },
    run: { status, runId: "run-1" },
    messages: [
      { id: "user-1", role: "user", blocks: [{ type: "text", text: "Inspect this" }] },
      {
        id: "assistant-1",
        role: "assistant",
        blocks: [
          { type: "text", id: "text-1", text: "Checking" },
          {
            type: "tool",
            id: "tool-1",
            name: "shell",
            title: "Run command",
            kind: "command",
            status: status === "running" ? "running" : "completed",
            input: "pwd",
            output: "/workspace",
          },
        ],
      },
    ],
  };
}

describe("backend conversation projection", () => {
  test("commits pre-tool assistant text as narration work, matching the Pi reducer", () => {
    expect(projectBackendConversation(snapshot("running"))).toEqual({
      messages: [
        { id: "user-1", role: "user", blocks: [{ type: "text", text: "Inspect this" }] },
      ],
      run: {
        runId: "run-1",
        status: "streaming",
        streamingText: "",
        work: [
          { type: "text", text: "Checking" },
          {
            type: "tool",
            callId: "tool-1",
            name: "Run command",
            kind: "command",
            status: "running",
            inputPreview: "pwd",
            outputPreview: "/workspace",
          },
        ],
      },
    });
  });

  test("keeps text after the last tool in the streaming tail", () => {
    const running = snapshot("running");
    const assistant = running.messages[1];
    if (assistant) {
      assistant.blocks.push({ type: "text", id: "text-2", text: "Still writing" });
    }
    const projection = projectBackendConversation(running);
    expect(projection.run.streamingText).toBe("Still writing");
    expect(projection.run.work.map((entry) => entry.type)).toEqual(["text", "tool"]);
  });

  test("settles backend-native tools into ordinary transcript rows", () => {
    const projection = projectBackendConversation(snapshot("settled"));
    expect(projection.run.status).toBe("idle");
    expect(projection.messages[1]?.blocks[1]).toEqual({
      type: "tool",
      callId: "tool-1",
      name: "Run command",
      kind: "command",
      status: "completed",
      inputPreview: "pwd",
      outputPreview: "/workspace",
    });
  });

  test("projects backend failures through the accepted run error shape", () => {
    const failed = snapshot("failed");
    failed.run.error = "Command failed";
    const projection = projectBackendConversation(failed);
    expect(projection.run.status).toBe("failed");
    expect(projection.run.error?.message).toBe("Command failed");
  });
});
