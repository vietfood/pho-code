import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function readDesktop(relativePath: string): Promise<string> {
  return readFile(path.join(desktopRoot, relativePath), "utf8");
}

describe("window-first eager module boundary", () => {
  test("loads the broad runtime only through the background dynamic import", async () => {
    const main = await readDesktop("electron/main.ts");
    const runtimeLines = main.split("\n").filter((line) => line.includes('"@pho-code/runtime"'));

    expect(runtimeLines).toEqual([
      'import type { HarnessRuntime } from "@pho-code/runtime";',
      '    const runtimeModule = await import("@pho-code/runtime");',
    ]);
  });

  test("keeps image sniffing on the narrow pure runtime subpath", async () => {
    const [ingest, vite] = await Promise.all([
      readDesktop("electron/image-ingest.ts"),
      readDesktop("electron.vite.config.ts"),
    ]);

    expect(ingest).toContain('from "@pho-code/runtime/image-bytes"');
    expect(ingest).not.toContain('from "@pho-code/runtime"');
    expect(vite).toContain('"@pho-code/runtime/image-bytes"');
  });
});
