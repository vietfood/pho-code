import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangeModelDialog } from "../src/change-model-dialog";
import { sameModel } from "../src/lib/model-identity";

const currentModel = {
  provider: "deepseek",
  id: "echo",
  name: "Echo",
  contextWindow: 200_000,
  cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
};

const nextModel = {
  provider: "openai",
  id: "gpt-test",
  name: "GPT Test",
  contextWindow: 128_000,
  cost: { input: 2.5, output: 10, cacheRead: 0.25, cacheWrite: 2.5 },
};

describe("sameModel", () => {
  test("matches provider and id", () => {
    expect(sameModel(currentModel, { ...currentModel, name: "Other label" })).toBe(true);
    expect(sameModel(currentModel, { ...currentModel, id: "other" })).toBe(false);
    expect(sameModel(currentModel, undefined)).toBe(false);
  });
});

describe("ChangeModelDialog", () => {
  test("explains cache miss and context resend when switching mid-chat", () => {
    const markup = renderToStaticMarkup(
      createElement(ChangeModelDialog, {
        model: nextModel,
        currentModel,
        contextUsage: { tokens: 12_400, contextWindow: 200_000, percent: 6.2 },
        onConfirm: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="change-model-dialog"');
    expect(markup).toContain('data-testid="change-model-details"');
    expect(markup).toContain("Change model in this chat?");
    expect(markup).toContain("Echo");
    expect(markup).toContain("GPT Test");
    expect(markup).toContain("miss cache reads");
    expect(markup).toContain("cold prefix");
    expect(markup).toContain("12k");
    expect(markup).toContain("200k");
    expect(markup).toContain("128k");
    expect(markup).toContain("Rate card");
    expect(markup).toContain("cache R");
    expect(markup).toContain("JSONL transcript");
    expect(markup).toContain("Switch model");
  });
});
