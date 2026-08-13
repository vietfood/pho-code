import { mkdir, realpath, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  collectWorkspaceReferenceTokens,
  extractAtMentions,
  isSensitiveWorkspaceRelative,
  serializeWorkspaceReferences,
  validateWorkspaceReference,
} from "../src/workspace-reference";

describe("workspace references", () => {
  test("rejects absolute, parent, and sensitive renderer paths", () => {
    expect(isSensitiveWorkspaceRelative(".env")).toBe(true);
    expect(isSensitiveWorkspaceRelative(".env.example")).toBe(false);
    expect(isSensitiveWorkspaceRelative("id_ed25519")).toBe(true);
  });

  test("re-resolves a workspace-relative file and serializes without absolute paths", async () => {
    const workspace = await realpath(await mkdtemp(path.join(tmpdir(), "pho-code-ref-")));
    await mkdir(path.join(workspace, "src"));
    await writeFile(path.join(workspace, "src", "main.ts"), "export {}\n");
    const validated = await validateWorkspaceReference({ path: "src/main.ts", kind: "file" }, workspace);
    expect(validated.path).toBe("src/main.ts");
    expect(validated.canonicalPath.startsWith(workspace)).toBe(true);
    const serialized = serializeWorkspaceReferences("read @src/main.ts", [validated]);
    expect(serialized).toContain("read @src/main.ts");
    expect(serialized).toContain("`src/main.ts`");
    expect(serialized).not.toContain(workspace);
  });

  test("extracts inline @ paths and ignores emails", () => {
    expect(extractAtMentions("read @src/main.ts and @packages/ui")).toEqual(["src/main.ts", "packages/ui"]);
    expect(extractAtMentions("email a@b.com then @file.ts")).toEqual(["file.ts"]);
    expect(collectWorkspaceReferenceTokens("read @src/main.ts", [{ path: "src/main.ts", kind: "file" }])).toEqual([
      { path: "src/main.ts" },
    ]);
  });
});
