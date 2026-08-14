import { afterEach, describe, expect, mock, test } from "bun:test";
import { copyText } from "../src/lib/clipboard";
import {
  clipboardLooksLikeImage,
  collectPastedImageFiles,
  pasteFingerprint,
  pastedImageDisplayName,
  shouldIgnoreDuplicatePaste,
} from "../src/lib/clipboard-images";
import { turnTextOutput } from "../src/lib/work-log";

describe("copyText", () => {
  afterEach(() => {
    mock.restore();
  });

  test("uses navigator.clipboard.writeText when available", async () => {
    const writeText = mock(() => Promise.resolve());
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText } },
    });
    await copyText("hello");
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  test("rejects when writeText fails and document is unavailable", async () => {
    const writeText = mock(() => Promise.reject(new Error("denied")));
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText } },
    });
    await expect(copyText("fallback")).rejects.toThrow("Clipboard unavailable");
    expect(writeText).toHaveBeenCalledWith("fallback");
  });
});

describe("turnTextOutput", () => {
  test("keeps only text after the last tool", () => {
    const text = turnTextOutput([
      { type: "thinking", text: "scratch" },
      { type: "text", text: "First." },
      {
        type: "tool",
        callId: "t1",
        name: "bash",
        status: "completed",
        inputPreview: "{}",
        outputPreview: "ok",
      },
      { type: "text", text: "Second." },
    ]);
    expect(text).toBe("Second.");
  });

  test("joins post-tool text blocks and skips thinking/tools", () => {
    const text = turnTextOutput([
      { type: "thinking", text: "scratch" },
      {
        type: "tool",
        callId: "t1",
        name: "bash",
        status: "completed",
        inputPreview: "{}",
        outputPreview: "ok",
      },
      { type: "text", text: "First." },
      { type: "text", text: "Second." },
    ]);
    expect(text).toBe("First.\n\nSecond.");
  });

  test("returns empty string when there is no text output", () => {
    expect(turnTextOutput([{ type: "thinking", text: "only" }])).toBe("");
  });
});

describe("pasted images", () => {
  test("prefers DataTransfer files over item-list clones", () => {
    const fromFiles = new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png", lastModified: 1 });
    const fromItems = new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png", lastModified: 99 });
    expect(
      collectPastedImageFiles({
        files: [fromFiles],
        items: [{ kind: "file", type: "image/png", getAsFile: () => fromItems }],
      }),
    ).toEqual([fromFiles]);
  });

  test("dedupes the same image when lastModified differs", () => {
    const first = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png", lastModified: 1 });
    const second = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png", lastModified: 2 });
    expect(collectPastedImageFiles({ files: [first, second] })).toEqual([first]);
  });

  test("keeps one PNG when a screenshot also exposes TIFF", () => {
    const png = new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" });
    const tiff = new File([new Uint8Array([4, 5, 6, 7])], "image.tiff", { type: "image/tiff" });
    expect(collectPastedImageFiles({ files: [png, tiff] })).toEqual([png]);
  });

  test("keeps distinctly named images from Finder", () => {
    const a = new File([new Uint8Array([1])], "cat.png", { type: "image/png" });
    const b = new File([new Uint8Array([1, 2])], "dog.png", { type: "image/png" });
    expect(collectPastedImageFiles({ files: [a, b] })).toEqual([a, b]);
  });

  test("ignores non-image files", () => {
    const text = new File(["hello"], "notes.txt", { type: "text/plain" });
    expect(collectPastedImageFiles({ files: [text] })).toEqual([]);
  });

  test("treats screenshot clipboard types as image-like", () => {
    expect(clipboardLooksLikeImage(["image/png"])).toBe(true);
    expect(clipboardLooksLikeImage(["Files"])).toBe(false);
    expect(clipboardLooksLikeImage(["text/plain"])).toBe(false);
  });

  test("ignores a second paste event with the same fingerprint", () => {
    const png = new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" });
    const fingerprint = pasteFingerprint([png], ["image/png"]);
    expect(shouldIgnoreDuplicatePaste(null, fingerprint, 1_000)).toBe(false);
    expect(shouldIgnoreDuplicatePaste({ fingerprint, at: 1_000 }, fingerprint, 1_080)).toBe(true);
    expect(shouldIgnoreDuplicatePaste({ fingerprint, at: 1_000 }, fingerprint, 1_400)).toBe(false);
  });

  test("uses a basename-only pasted name", () => {
    expect(pastedImageDisplayName("/tmp/secret.png", 0)).toBe("secret.png");
    expect(pastedImageDisplayName("", 1)).toBe("pasted-image-2.png");
  });
});
