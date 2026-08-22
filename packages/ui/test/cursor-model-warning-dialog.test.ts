import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CursorModelWarningDialog } from "../src/cursor-model-warning-dialog";

const cursorModel = {
  provider: "cursor",
  id: "composer-2-5",
  name: "Composer 2.5",
  contextWindow: 200_000,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

describe("CursorModelWarningDialog", () => {
  test("warns about Cursor agent loop, permissions, and local-only policy", () => {
    const markup = renderToStaticMarkup(
      createElement(CursorModelWarningDialog, {
        model: cursorModel,
        onConfirm: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="cursor-model-warning-dialog"');
    expect(markup).toContain('data-provider="cursor"');
    expect(markup).toContain("Use a Cursor model in this chat?");
    expect(markup).toContain("pi-cursor-sdk");
    expect(markup).toContain("permission-system");
    expect(markup).toContain("local-only");
    expect(markup).toContain("~/.cursor");
    expect(markup).toContain("Use Cursor model");
  });

  test("adds mid-chat cache context when switching into an existing transcript", () => {
    const markup = renderToStaticMarkup(
      createElement(CursorModelWarningDialog, {
        model: cursorModel,
        midChat: true,
        currentModel: {
          provider: "deepseek",
          id: "echo",
          name: "Echo",
          contextWindow: 128_000,
          cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
        },
        contextUsage: { tokens: 4_200, contextWindow: 128_000, percent: 3.3 },
        onConfirm: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(markup).toContain("miss cache reads");
    expect(markup).toContain("4.2k");
  });
});
