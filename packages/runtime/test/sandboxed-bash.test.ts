import { describe, expect, test } from "bun:test";
import type { TranscriptMessage } from "@pho-code/protocol";
import {
  applySandboxedBashOverlay,
  collectSandboxedBashCallIds,
  SANDBOXED_BASH_CUSTOM_TYPE,
} from "../src/sandboxed-bash";

const assistant: TranscriptMessage = {
  id: "assistant:1:0",
  role: "assistant",
  blocks: [
    {
      type: "tool",
      callId: "bash-1",
      name: "bash",
      status: "completed",
      inputPreview: '{"command":"pwd"}',
      outputPreview: "/tmp",
    },
    {
      type: "tool",
      callId: "write-1",
      name: "write",
      status: "completed",
      inputPreview: '{"path":"a.txt"}',
      outputPreview: "ok",
    },
  ],
};

describe("sandboxed bash overlay", () => {
  test("stamps only bash call ids from custom entries", () => {
    const callIds = collectSandboxedBashCallIds([
      { type: "custom", customType: SANDBOXED_BASH_CUSTOM_TYPE, data: { callId: "bash-1" } },
      { type: "custom", customType: SANDBOXED_BASH_CUSTOM_TYPE, data: { callId: "write-1" } },
      { type: "custom", customType: "other", data: { callId: "bash-2" } },
      { type: "message", data: { callId: "bash-3" } },
    ]);
    const stamped = applySandboxedBashOverlay([assistant], callIds);
    expect(stamped[0]?.blocks).toEqual([
      { ...assistant.blocks[0], sandboxed: true },
      assistant.blocks[1],
    ]);
  });

  test("stamps leftover display-named bash rows so a shield is not dropped", () => {
    const leftover: TranscriptMessage = {
      ...assistant,
      blocks: [{ ...(assistant.blocks[0] as Extract<(typeof assistant.blocks)[number], { type: "tool" }>), name: "Run" }],
    };
    const stamped = applySandboxedBashOverlay([leftover], new Set(["bash-1"]));
    expect(stamped[0]?.blocks[0]).toMatchObject({ name: "Run", sandboxed: true });
  });

  test("ignores empty overlays and non-bash names", () => {
    expect(applySandboxedBashOverlay([assistant], new Set())).toEqual([assistant]);
    expect(applySandboxedBashOverlay([assistant], new Set(["write-1"]))[0]?.blocks[1]).toEqual(assistant.blocks[1]);
  });
});
