import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatPaneLoading } from "../src/chat-pane-loading";

describe("chat pane loading", () => {
  test("keeps the chat header and shows opening status in the transcript slot", () => {
    const markup = renderToStaticMarkup(createElement(ChatPaneLoading));
    expect(markup).toContain('data-testid="session-switching"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Opening session");
    expect(markup).toContain("loading-dots");
    expect(markup).not.toContain('data-testid="transcript"');
    expect(markup).not.toContain('data-testid="composer"');
  });
});
