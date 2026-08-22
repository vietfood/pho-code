import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RightSidebar, rightSidebarSurfaceAction } from "../src/right-sidebar";
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
    expect(markup).toContain('data-testid="right-sidebar-surface-diff"');
    expect(markup).toContain('data-testid="right-sidebar-surface-context"');
    expect(markup).toContain('data-testid="right-sidebar-surface-plan"');
    expect(markup).toContain("Context prompt");
    expect(markup).not.toContain('data-testid="right-sidebar-collapse"');
    expect(markup).not.toContain("Show sidebar");
    expect(markup).not.toContain(">panel<");
    expect(markup).not.toContain('data-testid="right-sidebar-resize"');
    expect(markup).not.toContain('data-testid="right-sidebar-context-custom"');
    expect(markup).toContain('aria-pressed="false"');
  });

  test("docks Changes children when the panel is expanded", () => {
    const markup = renderToStaticMarkup(
      createElement(RightSidebar, {
        collapsed: false,
        surface: "changes",
        onToggleCollapsed: () => undefined,
        onSelectSurface: () => undefined,
        children: createElement("section", { "data-testid": "change-review-window" }, "stacked"),
      }),
    );
    expect(markup).toContain('data-collapsed="false"');
    expect(markup).not.toContain('data-testid="right-sidebar-pill"');
    expect(markup).toContain('data-testid="change-review-window"');
    expect(markup).toContain("stacked");
  });

  test("marks Changes pressed on the collapsed pill while the overlay is open", () => {
    const markup = renderToStaticMarkup(
      createElement(RightSidebar, {
        collapsed: true,
        surface: "changes",
        changesOverlayOpen: true,
        onToggleCollapsed: () => undefined,
        onSelectSurface: () => undefined,
      }),
    );
    expect(markup).toContain('data-collapsed="true"');
    expect(markup).toContain('data-testid="right-sidebar-pill"');
    expect(markup).toContain('aria-pressed="true"');
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
    expect(markup).toContain("right-sidebar-host");
    expect(markup).not.toContain("border-s");
    expect(markup).toContain('data-testid="right-sidebar-resize"');
    expect(markup).toContain("Resize right sidebar");
    expect(markup).not.toContain("Hide sidebar");
    expect(markup).not.toContain('data-testid="right-sidebar-collapse"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('data-customized="true"');
    expect(markup).toContain('data-testid="right-sidebar-context-custom"');
    expect(markup).toContain('data-testid="embedded-panel"');
    expect(markup).toContain("context");
  });
});

describe("right sidebar surface activation", () => {
  test("collapses when the open surface is clicked again", () => {
    expect(rightSidebarSurfaceAction(false, "changes", "changes")).toBe("collapse");
    expect(rightSidebarSurfaceAction(false, "context-prompt", "context-prompt")).toBe("collapse");
    expect(rightSidebarSurfaceAction(false, "plan", "plan")).toBe("collapse");
    expect(rightSidebarSurfaceAction(true, "changes", "changes", true)).toBe("collapse");
  });

  test("selects when collapsed or when switching surfaces", () => {
    expect(rightSidebarSurfaceAction(true, "changes", "changes")).toBe("select");
    expect(rightSidebarSurfaceAction(true, "changes", "context-prompt")).toBe("select");
    expect(rightSidebarSurfaceAction(false, "changes", "context-prompt")).toBe("select");
    expect(rightSidebarSurfaceAction(false, "context-prompt", "changes")).toBe("select");
    expect(rightSidebarSurfaceAction(false, "plan", "changes")).toBe("select");
    expect(rightSidebarSurfaceAction(false, "changes", "plan")).toBe("select");
    expect(rightSidebarSurfaceAction(true, "changes", "context-prompt", true)).toBe("select");
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
