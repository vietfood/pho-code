import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionContextMenu } from "../src/session-context-menu";

describe("session context menu", () => {
  test("offers archive and move to trash for an ordinary chat", () => {
    const markup = renderToStaticMarkup(
      createElement(SessionContextMenu, {
        x: 12,
        y: 24,
        archived: false,
        onArchive: () => undefined,
        onRemove: () => undefined,
        onClose: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="session-context-menu"');
    expect(markup).toContain("Archive chat");
    expect(markup).toContain("Move chat to Trash");
    expect(markup).not.toContain("Restore chat");
  });

  test("offers restore for an archived chat", () => {
    const markup = renderToStaticMarkup(
      createElement(SessionContextMenu, {
        x: 12,
        y: 24,
        archived: true,
        onRestore: () => undefined,
        onRemove: () => undefined,
        onClose: () => undefined,
      }),
    );
    expect(markup).toContain("Restore chat");
    expect(markup).not.toContain("Archive chat");
  });
});
