import { describe, expect, test } from "bun:test";
import { HARNESS_ERROR_CODES } from "@pho-code/protocol";
import { advertisedCatalogModel, assertModelAdmissible, catalogHasModel } from "../src/model-catalog";

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

describe("turn admission against the catalog", () => {
  const models = [{ provider: "anthropic", id: "claude-opus-5" }];

  test("admits a bound model the catalog still advertises", () => {
    expect(() =>
      assertModelAdmissible({ models, boundModel: models[0], modelError: undefined, operation: "sendPrompt" }),
    ).not.toThrow();
  });

  test("admits an unbound session while the catalog has something to pick", () => {
    expect(() =>
      assertModelAdmissible({ models, boundModel: undefined, modelError: undefined, operation: "sendPrompt" }),
    ).not.toThrow();
  });

  test("refuses a binding the catalog no longer advertises", () => {
    expect(() =>
      assertModelAdmissible({
        models,
        boundModel: { provider: "cursor", id: "composer-1.5" },
        modelError: undefined,
        operation: "sendPrompt",
      }),
    ).toThrow(expect.objectContaining({ code: HARNESS_ERROR_CODES.noAuthenticatedModel }));
  });

  test("refuses an empty catalog and prefers the catalog's own explanation", () => {
    expect(() =>
      assertModelAdmissible({ models: [], boundModel: undefined, modelError: undefined, operation: "sendPrompt" }),
    ).toThrow(expect.objectContaining({ message: "Sign in to a provider account in Settings before using this model." }));

    expect(() =>
      assertModelAdmissible({
        models: [],
        boundModel: undefined,
        modelError: "Provider request failed.",
        operation: "sendPrompt",
      }),
    ).toThrow(expect.objectContaining({ message: "Provider request failed." }));
  });
});
