import { describe, expect, test } from "bun:test";
import { projectUserContentBlocks } from "../src/transcript";

describe("user transcript projection", () => {
  test("keeps text, strips reference appendix, and projects a data preview without a raw data field", () => {
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const projected = projectUserContentBlocks([
      {
        type: "text",
        text: "look at this\n\nReferenced workspace paths:\n- file `notes.md`",
      },
      { type: "image", mimeType: "image/png", data: png },
    ] as Array<{ type: string; text?: string; mimeType?: string; data?: string }>);
    expect(projected).toEqual([
      { type: "text", text: "look at this" },
      {
        type: "image",
        name: "image-1",
        mimeType: "image/png",
        previewDataUrl: `data:image/png;base64,${png}`,
      },
    ]);
    expect(JSON.stringify(projected)).not.toContain('"data":');
  });

  test("falls back to a name-only placeholder when image bytes are missing", () => {
    const projected = projectUserContentBlocks([
      { type: "image", mimeType: "image/png" },
    ] as Array<{ type: string; text?: string; mimeType?: string; data?: string }>);
    expect(projected).toEqual([{ type: "image", name: "image-1", mimeType: "image/png" }]);
  });
});
