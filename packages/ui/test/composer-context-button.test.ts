import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerContextButton } from "../src/composer-context-button";

describe("ComposerContextButton", () => {
  test("colors agent mode red and shows the agent icon", () => {
    const markup = renderToStaticMarkup(
      createElement(ComposerContextButton, {
        mode: "agent",
        disabled: false,
        onModeChange: () => undefined,
        onAttach: () => undefined,
        attachDisabled: false,
        attachTitle: "Attach images",
      }),
    );
    expect(markup).toContain('data-testid="composer-context-button"');
    expect(markup).toContain("composer-context-button is-agent");
    expect(markup).not.toContain("is-plan");
    expect(markup).toContain("lucide-bot");
    expect(markup).not.toContain("lucide-plus");
  });

  test("colors plan mode blue", () => {
    const markup = renderToStaticMarkup(
      createElement(ComposerContextButton, {
        mode: "plan",
        disabled: false,
        onModeChange: () => undefined,
        attachDisabled: true,
        attachTitle: "Disabled",
      }),
    );
    expect(markup).toContain("composer-context-button is-plan");
    expect(markup).toContain("lucide-list-tree");
    expect(markup).toContain("Plan mode and attachments");
  });
});
