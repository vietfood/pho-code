import { describe, expect, test } from "bun:test";
import type { TranscriptMessage } from "@pho-code/protocol";
import {
  applyRewriteOverlays,
  ASSISTANT_REWRITE_CUSTOM_TYPE,
  collectRewriteOverlays,
} from "../src/assistant-rewrite";

const assistant: TranscriptMessage = {
  id: "assistant:1:0",
  role: "assistant",
  blocks: [
    { type: "thinking", text: "plan" },
    { type: "text", text: "broken $latex$" },
  ],
};

describe("assistant rewrite overlays", () => {
  test("applies the latest custom entry per message and restores on null", () => {
    const overlays = collectRewriteOverlays([
      {
        type: "custom",
        customType: ASSISTANT_REWRITE_CUSTOM_TYPE,
        data: { messageId: assistant.id, text: "first" },
      },
      {
        type: "custom",
        customType: ASSISTANT_REWRITE_CUSTOM_TYPE,
        data: { messageId: assistant.id, text: "$$fixed$$" },
      },
    ]);
    const rewritten = applyRewriteOverlays([assistant], overlays);
    expect(rewritten[0]?.blocks).toEqual([
      { type: "thinking", text: "plan" },
      { type: "text", text: "$$fixed$$", originalText: "broken $latex$" },
    ]);

    const restored = applyRewriteOverlays(
      [assistant],
      collectRewriteOverlays([
        {
          type: "custom",
          customType: ASSISTANT_REWRITE_CUSTOM_TYPE,
          data: { messageId: assistant.id, text: "$$fixed$$" },
        },
        {
          type: "custom",
          customType: ASSISTANT_REWRITE_CUSTOM_TYPE,
          data: { messageId: assistant.id, text: null },
        },
      ]),
    );
    expect(restored).toEqual([assistant]);
  });

  test("ignores user messages and unknown custom entries", () => {
    const user: TranscriptMessage = {
      id: "user:1:0",
      role: "user",
      blocks: [{ type: "text", text: "hello" }],
    };
    const overlays = collectRewriteOverlays([
      { type: "message", data: { messageId: user.id, text: "nope" } },
      {
        type: "custom",
        customType: "other",
        data: { messageId: assistant.id, text: "nope" },
      },
      {
        type: "custom",
        customType: ASSISTANT_REWRITE_CUSTOM_TYPE,
        data: { messageId: user.id, text: "should not apply" },
      },
    ]);
    expect(applyRewriteOverlays([user, assistant], overlays)).toEqual([user, assistant]);
  });
});
