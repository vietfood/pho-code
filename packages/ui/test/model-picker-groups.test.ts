import { describe, expect, test } from "bun:test";
import type { ModelSummary } from "@pho-code/protocol";
import { filterModels, groupModelsByProvider } from "../src/lib/model-picker-groups";

function model(partial: Pick<ModelSummary, "provider" | "id" | "name">): ModelSummary {
  return {
    ...partial,
    contextWindow: 128_000,
    cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
  };
}

const catalog: readonly ModelSummary[] = [
  model({ provider: "deepseek", id: "v4-flash", name: "DeepSeek V4 Flash" }),
  model({ provider: "deepseek", id: "v4-pro", name: "DeepSeek V4 Pro" }),
  model({ provider: "anthropic", id: "claude-sonnet", name: "Claude Sonnet" }),
  model({ provider: "openrouter", id: "ai21/jamba", name: "AI21: Jamba Large 1.7" }),
];

describe("filterModels", () => {
  test("empty or whitespace query returns all models", () => {
    expect(filterModels(catalog, "")).toEqual(catalog);
    expect(filterModels(catalog, "   ")).toEqual(catalog);
  });

  test("matches name, id, and provider case-insensitively", () => {
    expect(filterModels(catalog, "SONNET").map((entry) => entry.id)).toEqual(["claude-sonnet"]);
    expect(filterModels(catalog, "v4-pro").map((entry) => entry.id)).toEqual(["v4-pro"]);
    expect(filterModels(catalog, "OpenRouter").map((entry) => entry.id)).toEqual(["ai21/jamba"]);
  });

  test("returns empty when nothing matches", () => {
    expect(filterModels(catalog, "nope")).toEqual([]);
  });
});

describe("groupModelsByProvider", () => {
  test("groups by provider and preserves first-seen order", () => {
    const groups = groupModelsByProvider(catalog);
    expect(groups.map((group) => group.provider)).toEqual([
      "deepseek",
      "anthropic",
      "openrouter",
    ]);
    expect(groups[0]?.models.map((entry) => entry.id)).toEqual(["v4-flash", "v4-pro"]);
    expect(groups[1]?.models.map((entry) => entry.id)).toEqual(["claude-sonnet"]);
  });

  test("groups filtered results without inventing empty providers", () => {
    const filtered = filterModels(catalog, "deepseek");
    const groups = groupModelsByProvider(filtered);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.provider).toBe("deepseek");
    expect(groups[0]?.models).toHaveLength(2);
  });
});
