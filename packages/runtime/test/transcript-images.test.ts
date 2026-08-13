import { describe, expect, test } from "bun:test";
import { projectUserContentBlocks } from "../src/transcript";

describe("user transcript projection", () => {
  test("keeps text and replaces image bytes with a placeholder", () => {
    const projected = projectUserContentBlocks([
      { type: "text", text: "look at this" },
      { type: "image", mimeType: "image/png", data: "SECRET_BYTES" },
    ] as Array<{ type: string; text?: string; mimeType?: string }>);
    expect(projected).toEqual([
      { type: "text", text: "look at this" },
      { type: "image", name: "image-1", mimeType: "image/png" },
    ]);
    expect(JSON.stringify(projected)).not.toContain("SECRET_BYTES");
  });
});
