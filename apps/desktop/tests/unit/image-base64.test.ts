import { describe, expect, test } from "bun:test";
import {
  decodePastedImageBase64,
  MAX_SOURCE_IMAGE_BASE64_CHARS,
} from "../../electron/image-base64";

describe("pasted image base64 admission", () => {
  test("decodes a canonical payload", () => {
    expect(decodePastedImageBase64(Buffer.from("image").toString("base64"))).toEqual(Buffer.from("image"));
  });

  test("rejects malformed input before decode", () => {
    expect(() => decodePastedImageBase64("not base64"))
      .toThrow("That pasted image is invalid or larger than 10 MiB.");
  });

  test("rejects an oversized encoded payload before decode", () => {
    const oversized = "A".repeat(MAX_SOURCE_IMAGE_BASE64_CHARS + 4);
    expect(() => decodePastedImageBase64(oversized))
      .toThrow("That pasted image is invalid or larger than 10 MiB.");
  });
});
