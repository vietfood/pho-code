import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentBackendDescriptor } from "@pho-code/protocol";
import { BackendPicker } from "../src/backend-picker";

const backends: AgentBackendDescriptor[] = [
  { id: "pi", label: "Pi", capabilities: {} },
  { id: "codex", label: "Codex", capabilities: {} },
  { id: "claude-acp", label: "Claude", capabilities: {} },
];

describe("BackendPicker", () => {
  test("renders a chip with the selected backend mark and no chevron", () => {
    const markup = renderToStaticMarkup(
      createElement(BackendPicker, {
        backends,
        selectedBackendId: "pi",
        disabled: false,
        onBackendChange: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="backend-selector"');
    expect(markup).toContain("composer-backend-picker-trigger is-pi");
    expect(markup).toContain('data-backend-kind="pi"');
    expect(markup).toContain('data-lobe-icon="pi"');
    expect(markup).toContain("composer-backend-picker-label");
    expect(markup).not.toContain("lucide-chevron-down");
  });

  test("tints the Claude chip and keeps the Lobe Claude mark", () => {
    const markup = renderToStaticMarkup(
      createElement(BackendPicker, {
        backends,
        selectedBackendId: "claude-acp",
        disabled: false,
        onBackendChange: () => undefined,
      }),
    );
    expect(markup).toContain("composer-backend-picker-trigger is-claude");
    expect(markup).toContain('data-backend-kind="claude"');
    expect(markup).toContain('data-lobe-icon="claude"');
  });

  test("hides when fewer than two backends are advertised", () => {
    const markup = renderToStaticMarkup(
      createElement(BackendPicker, {
        backends: backends.slice(0, 1),
        selectedBackendId: "pi",
        disabled: false,
        onBackendChange: () => undefined,
      }),
    );
    expect(markup).toBe("");
  });
});
