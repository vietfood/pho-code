import { describe, expect, test } from "bun:test";
import { projectModelSummary } from "../src/model-summary";

describe("projectModelSummary", () => {
  test("projects cost rates and context window", () => {
    expect(
      projectModelSummary({
        provider: "anthropic",
        id: "claude",
        name: "Claude",
        contextWindow: 200_000,
        cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      }),
    ).toEqual({
      provider: "anthropic",
      id: "claude",
      name: "Claude",
      contextWindow: 200_000,
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    });
  });
});
