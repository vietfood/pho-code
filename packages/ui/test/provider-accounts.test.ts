import { describe, expect, test } from "bun:test";
import type { ProviderAccountSummary } from "@pho-code/protocol";
import {
  formatProviderMethods,
  matchesProviderAccountQuery,
  partitionProviderAccounts,
  providerStatusLabel,
} from "../src/lib/provider-accounts";

function account(partial: Partial<ProviderAccountSummary> & Pick<ProviderAccountSummary, "id" | "name">): ProviderAccountSummary {
  return {
    methods: ["api_key"],
    configured: false,
    subscriptionClassified: false,
    ...partial,
  };
}

describe("matchesProviderAccountQuery", () => {
  test("empty or whitespace query matches every provider", () => {
    const provider = account({ id: "deepseek", name: "DeepSeek API key" });
    expect(matchesProviderAccountQuery(provider, "")).toBe(true);
    expect(matchesProviderAccountQuery(provider, "   ")).toBe(true);
  });

  test("matches name and id case-insensitively", () => {
    const provider = account({ id: "openai-codex", name: "OpenAI (ChatGPT Plus/Pro)" });
    expect(matchesProviderAccountQuery(provider, "chatgpt")).toBe(true);
    expect(matchesProviderAccountQuery(provider, "OPENAI-CODEX")).toBe(true);
    expect(matchesProviderAccountQuery(provider, "anthropic")).toBe(false);
  });
});

describe("partitionProviderAccounts", () => {
  test("keeps connected accounts above remaining providers", () => {
    const providers = [
      account({ id: "anthropic", name: "Anthropic" }),
      account({ id: "deepseek", name: "DeepSeek", configured: true, activeMethod: "api_key" }),
      account({ id: "openrouter", name: "OpenRouter", configured: true, activeMethod: "api_key" }),
    ];
    const { connected, available } = partitionProviderAccounts(providers);
    expect(connected.map((entry) => entry.id)).toEqual(["deepseek", "openrouter"]);
    expect(available.map((entry) => entry.id)).toEqual(["anthropic"]);
  });
});

describe("providerStatusLabel", () => {
  test("describes unconfigured methods without exposing a secret field", () => {
    expect(
      providerStatusLabel(
        account({
          id: "anthropic",
          name: "Anthropic",
          methods: ["api_key", "oauth"],
        }),
      ),
    ).toBe("Not connected · API key or OAuth");
  });

  test("names the stored method for connected accounts", () => {
    expect(
      providerStatusLabel(
        account({
          id: "deepseek",
          name: "DeepSeek",
          configured: true,
          activeMethod: "api_key",
        }),
      ),
    ).toBe("Connected · API key");
  });
});

describe("formatProviderMethods", () => {
  test("joins available methods for compact rows", () => {
    expect(formatProviderMethods(["oauth"])).toBe("OAuth");
    expect(formatProviderMethods(["api_key", "oauth"])).toBe("API key or OAuth");
  });
});
