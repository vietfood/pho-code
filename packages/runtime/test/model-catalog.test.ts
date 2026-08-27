import { describe, expect, test } from "bun:test";
import { advertisedCatalogModel, catalogHasModel } from "../src/model-catalog";

describe("model catalog membership", () => {
  const models = [
    { provider: "openai", id: "gpt-4.1" },
    { provider: "anthropic", id: "claude-sonnet" },
  ];

  test("keeps a bound model that is still advertised", () => {
    expect(catalogHasModel(models, { provider: "openai", id: "gpt-4.1" })).toBe(true);
    expect(
      advertisedCatalogModel({ provider: "openai", id: "gpt-4.1" }, models, (model) => ({
        ...model,
        name: "projected",
      })),
    ).toEqual({ provider: "openai", id: "gpt-4.1", name: "projected" });
  });

  test("falls back to the first advertised model when the bound model is missing", () => {
    expect(catalogHasModel(models, { provider: "cursor", id: "composer-1.5" })).toBe(false);
    expect(
      advertisedCatalogModel({ provider: "cursor", id: "composer-1.5" }, models, (model) => ({
        ...model,
        name: "projected",
      })),
    ).toEqual(models[0]);
  });
});
