import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionModeChip } from "../src/session-mode-chip";

describe("SessionModeChip", () => {
  test("highlights Agent in red and Plan in blue", () => {
    const agentMarkup = renderToStaticMarkup(
      createElement(SessionModeChip, {
        mode: "agent",
        disabled: false,
        onChange: () => undefined,
      }),
    );
    expect(agentMarkup).toContain('data-testid="session-mode-selector"');
    expect(agentMarkup).toContain("is-agent");
    expect(agentMarkup).not.toContain("is-plan");
    expect(agentMarkup).toContain("Agent");

    const planMarkup = renderToStaticMarkup(
      createElement(SessionModeChip, {
        mode: "plan",
        disabled: false,
        onChange: () => undefined,
      }),
    );
    expect(planMarkup).toContain("is-plan");
    expect(planMarkup).not.toContain("is-agent");
    expect(planMarkup).toContain("Plan");
  });
});
