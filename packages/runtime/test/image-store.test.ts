import { describe, expect, test } from "bun:test";
import { decodeBase64Bytes, sniffImageMime } from "../src/image-bytes";
import { createPreparedImageStore } from "../src/image-store";
import { HARNESS_ERROR_CODES, MAX_PREPARED_IMAGES } from "@pho-code/protocol";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF = Buffer.from("GIF89a", "ascii");
const WEBP = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP", "ascii")]);

describe("image magic bytes", () => {
  test("sniffs PNG, JPEG, GIF, and WebP", () => {
    expect(sniffImageMime(PNG_1X1)).toBe("image/png");
    expect(sniffImageMime(JPEG_SIGNATURE)).toBe("image/jpeg");
    expect(sniffImageMime(GIF)).toBe("image/gif");
    expect(sniffImageMime(WEBP)).toBe("image/webp");
    expect(sniffImageMime(Buffer.from("not-an-image"))).toBeUndefined();
  });
});

describe("prepared image store", () => {
  test("admits a PNG and rejects a path-bearing name", () => {
    const store = createPreparedImageStore();
    const summary = store.add(pngInput("shot.png"), "prepareImage");
    expect(summary.name).toBe("shot.png");
    expect(summary.mimeType).toBe("image/png");
    expect(summary.byteLength).toBe(PNG_1X1.byteLength);
    expect(summary.name.includes("/")).toBe(false);
    expect(caughtCode(() => store.add(pngInput("/tmp/secret.png"), "prepareImage"))).toBe(
      HARNESS_ERROR_CODES.invalidImage,
    );
  });

  test("rejects non-image bytes even when labeled PNG", () => {
    const store = createPreparedImageStore();
    expect(
      caughtCode(() =>
        store.add(
          {
            name: "fake.png",
            mimeType: "image/png",
            data: Buffer.from("hello").toString("base64"),
            width: 1,
            height: 1,
            previewDataUrl: "data:image/png;base64,aGVsbG8=",
          },
          "prepareImage",
        ),
      ),
    ).toBe(HARNESS_ERROR_CODES.invalidImage);
  });

  test("keeps records until forget after a successful lookup", () => {
    const store = createPreparedImageStore();
    const first = store.add(pngInput("a.png"), "prepareImage");
    expect(store.lookup([first.id], "sendPrompt")[0]?.summary.id).toBe(first.id);
    expect(store.size()).toBe(1);
    store.forget([first.id]);
    expect(store.size()).toBe(0);
    expect(caughtCode(() => store.lookup([first.id], "sendPrompt"))).toBe(HARNESS_ERROR_CODES.invalidImage);
  });

  test(`caps prepared images at ${MAX_PREPARED_IMAGES}`, () => {
    const store = createPreparedImageStore();
    for (let index = 0; index < MAX_PREPARED_IMAGES; index += 1) {
      store.add(pngInput(`n${index}.png`), "prepareImage");
    }
    expect(caughtCode(() => store.add(pngInput("overflow.png"), "prepareImage"))).toBe(HARNESS_ERROR_CODES.invalidImage);
  });
});

describe("base64 decode", () => {
  test("round-trips PNG bytes", () => {
    expect(Buffer.from(decodeBase64Bytes(PNG_1X1.toString("base64")))).toEqual(PNG_1X1);
  });
});

function pngInput(name: string) {
  return {
    name,
    mimeType: "image/png" as const,
    data: PNG_1X1.toString("base64"),
    width: 1,
    height: 1,
    previewDataUrl: `data:image/png;base64,${PNG_1X1.toString("base64")}`,
  };
}

function caughtCode(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
  }
}
