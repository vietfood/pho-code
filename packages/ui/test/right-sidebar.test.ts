import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RightSidebar } from "../src/right-sidebar";
import { readRightSidebarCollapsed, writeRightSidebarCollapsed } from "../src/lib/right-sidebar-collapsed";

describe("RightSidebar", () => {
  test("renders a compact overlay pill when collapsed", () => {
    const markup = renderToStaticMarkup(
      createElement(RightSidebar, {
        collapsed: true,
        surface: "changes",
        onToggleCollapsed: () => undefined,
        onSelectSurface: () => undefined,
        children: createElement("p", null, "panel"),
      }),
    );
    expect(markup).toContain('data-testid="right-sidebar"');
    expect(markup).toContain('data-collapsed="true"');
    expect(markup).toContain('data-testid="right-sidebar-pill"');
    expect(markup).toContain("rounded-2xl");
    expect(markup).toContain('data-testid="right-sidebar-collapse"');
    expect(markup).toContain('data-testid="right-sidebar-surface-diff"');
    expect(markup).toContain('data-testid="right-sidebar-surface-context"');
    expect(markup).toContain("Show sidebar");
    expect(markup).toContain("Context prompt");
    expect(markup).not.toContain(">panel<");
    expect(markup).not.toContain('data-testid="right-sidebar-resize"');
    expect(markup).not.toContain('data-testid="right-sidebar-context-custom"');
  });

  test("expands to a resizable panel with the selected surface", () => {
    const markup = renderToStaticMarkup(
      createElement(RightSidebar, {
        collapsed: false,
        surface: "context-prompt",
        contextPromptCustomized: true,
        onToggleCollapsed: () => undefined,
        onSelectSurface: () => undefined,
        children: createElement("p", { "data-testid": "embedded-panel" }, "context"),
      }),
    );
    expect(markup).toContain('data-collapsed="false"');
    expect(markup).not.toContain('data-testid="right-sidebar-pill"');
    expect(markup).toContain('data-testid="right-sidebar-resize"');
    expect(markup).toContain("Resize right sidebar");
    expect(markup).toContain("Hide sidebar");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('data-customized="true"');
    expect(markup).toContain('data-testid="right-sidebar-context-custom"');
    expect(markup).toContain('data-testid="embedded-panel"');
    expect(markup).toContain("context");
  });
});

describe("right sidebar collapsed storage", () => {
  test("defaults to collapsed and round-trips", () => {
    const original = globalThis.localStorage;
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });
    try {
      expect(readRightSidebarCollapsed()).toBe(true);
      writeRightSidebarCollapsed(false);
      expect(readRightSidebarCollapsed()).toBe(false);
      writeRightSidebarCollapsed(true);
      expect(readRightSidebarCollapsed()).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original });
    }
  });
});
