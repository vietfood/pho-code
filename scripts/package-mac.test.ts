import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { collectProductionPackages } from "./package-mac.ts";
import { DESKTOP_DIR } from "./stage-app-resources.ts";

describe("production package collection", () => {
  test("walks bun isolated Pi SDK dependencies from the declaring package", () => {
    const packages = collectProductionPackages(path.join(DESKTOP_DIR, "package.json"));
    const names = new Set(packages.map((entry) => entry.name));

    expect(names.has("@earendil-works/pi-coding-agent")).toBe(true);
    expect(names.has("@earendil-works/pi-ai")).toBe(true);
    expect(names.has("@anthropic-ai/sdk")).toBe(true);
    expect(names.has("openai")).toBe(true);
    expect(names.has("@gotgenes/pi-permission-system")).toBe(false);
    expect(names.has("@pho-code/runtime")).toBe(false);
    expect(names.has("react")).toBe(false);
    expect(packages.every((entry) => !entry.name.startsWith("@pho-code/"))).toBe(true);

    const anthropic = packages.find((entry) => entry.name === "@anthropic-ai/sdk");
    expect(anthropic).toBeDefined();
    expect(existsSync(path.join(anthropic!.root, "package.json"))).toBe(true);
  });
});
