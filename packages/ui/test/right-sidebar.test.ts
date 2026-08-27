import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RightSidebar,
  RightSurfaceIcons,
  type RightSidebarProps,
  type RightSurfaceIconsProps,
} from "../src/right-sidebar";
import { writeReviewSidebarWidth } from "../src/lib/review-sidebar-width";
import type { RightSidebarSurface } from "../src/lib/right-sidebar-tiles";

function iconProps(overrides: Partial<RightSurfaceIconsProps>): RightSurfaceIconsProps {
  return {
    tiles: [],
    onToggleSurface: () => undefined,
    ...overrides,
  };
}

function regionProps(overrides: Partial<RightSidebarProps>): RightSidebarProps {
  return {
    tiles: [],
    onHideRegion: () => undefined,
    onCloseSurface: () => undefined,
    onMinimizeSurface: () => undefined,
    onActivateSurface: () => undefined,
    onSplitChange: () => undefined,
    renderSurface: (surface: RightSidebarSurface) => createElement("p", null, `panel-${surface}`),
    ...overrides,
  };
}

function withStubbedLocalStorage(run: () => void): void {
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
    run();
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original });
  }
}

describe("RightSurfaceIcons", () => {
  test("renders one launcher icon per surface", () => {
    const markup = renderToStaticMarkup(createElement(RightSurfaceIcons, iconProps({})));
    expect(markup).toContain('data-testid="right-surface-icons"');
    expect(markup).toContain('aria-label="Right sidebar surfaces"');
    expect(markup).toContain('data-testid="right-sidebar-surface-diff"');
    expect(markup).toContain('data-testid="right-sidebar-surface-context"');
    expect(markup).toContain('data-testid="right-sidebar-surface-plan"');
    expect(markup).toContain("Context prompt");
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).not.toContain('data-testid="right-sidebar-context-custom"');
  });

  test("marks icons pressed for open tiles and parked tiles", () => {
    const markup = renderToStaticMarkup(
      createElement(
        RightSurfaceIcons,
        iconProps({ tiles: ["plan"], minimized: ["context-prompt", "changes"] }),
      ),
    );
    expect(markup.match(/aria-pressed="true"/g)?.length).toBe(3);
  });

  test("keeps the customized and document badges", () => {
    const markup = renderToStaticMarkup(
      createElement(
        RightSurfaceIcons,
        iconProps({ tiles: ["context-prompt"], contextPromptCustomized: true, planDocumentPresent: true }),
      ),
    );
    expect(markup).toContain('data-customized="true"');
    expect(markup).toContain('data-testid="right-sidebar-context-custom"');
    expect(markup).toContain('data-document="true"');
    expect(markup).toContain('data-testid="right-sidebar-plan-document"');
  });
});

describe("RightSidebar", () => {
  test("renders one floating tile card with a header and content", () => {
    const markup = renderToStaticMarkup(
      createElement(RightSidebar, regionProps({ tiles: ["plan"] })),
    );
    expect(markup).toContain('data-testid="right-sidebar"');
    expect(markup).toContain("right-sidebar-host");
    expect(markup).toContain('data-testid="right-sidebar-resize"');
    expect(markup).toContain("Resize right sidebar");
    expect(markup).toContain('data-testid="right-sidebar-tiles"');
    expect(markup).toContain('data-orientation="stack"');
    expect(markup).toContain('data-testid="right-sidebar-tile-plan"');
    expect(markup).toContain("rounded-xl");
    expect(markup).not.toContain("shadow-md");
    expect(markup).toContain("bg-transparent");
    expect(markup).toContain('aria-label="Minimize Plan"');
    expect(markup).toContain('aria-label="Close Plan"');
    expect(markup).toContain("panel-plan");
    expect(markup).not.toContain('data-testid="right-sidebar-tile-divider"');
    expect(markup).not.toContain('data-testid="right-sidebar-tray"');
    expect(markup).not.toContain('data-testid="right-sidebar-pill"');
    expect(markup).not.toContain("data-collapsed");
  });

  test("lets Changes fill the shared tile header title slot", () => {
    const markup = renderToStaticMarkup(
      createElement(
        RightSidebar,
        regionProps({
          tiles: ["changes"],
          renderTileTitle: (surface) =>
            surface === "changes"
              ? createElement("span", { "data-testid": "change-review-window-title" }, "working tree")
              : undefined,
        }),
      ),
    );
    expect(markup).toContain('data-testid="right-sidebar-tile-diff"');
    expect(markup).toContain("working tree");
    expect(markup).toContain('data-testid="change-review-window-title"');
    expect(markup).toContain('aria-label="Minimize Changes"');
    expect(markup).toContain('aria-label="Close Changes"');
    expect(markup).toContain('data-testid="right-sidebar-tile-minimize-diff"');
    expect(markup).toContain('data-testid="right-sidebar-tile-close-diff"');
    expect(markup).toContain("panel-changes");
  });

  test("renders two tiles with a gap divider and per-tile split styles", () => {
    const markup = renderToStaticMarkup(
      createElement(RightSidebar, regionProps({ tiles: ["changes", "plan"], splitRatio: 0.6 })),
    );
    expect(markup).toContain('data-testid="right-sidebar-tile-diff"');
    expect(markup).toContain('data-testid="right-sidebar-tile-plan"');
    expect(markup).toContain('data-testid="right-sidebar-tile-divider"');
    expect(markup).toContain('role="separator"');
    expect(markup).toContain('aria-orientation="horizontal"');
    expect(markup).toContain('aria-valuenow="60"');
    expect(markup).toContain("cursor-row-resize");
    expect(markup).toContain("panel-changes");
    expect(markup).toContain("panel-plan");
  });

  test("switches to side-by-side columns when the region is wide", () => {
    withStubbedLocalStorage(() => {
      writeReviewSidebarWidth(1000);
      const markup = renderToStaticMarkup(
        createElement(RightSidebar, regionProps({ tiles: ["changes", "plan"] })),
      );
      expect(markup).toContain('data-orientation="columns"');
      expect(markup).toContain('aria-orientation="vertical"');
      expect(markup).toContain("cursor-col-resize");
    });
  });

  test("parks minimized tiles as tray chips and keeps their content mounted but hidden", () => {
    const markup = renderToStaticMarkup(
      createElement(RightSidebar, regionProps({ tiles: ["changes", "plan"], minimized: ["context-prompt"] })),
    );
    expect(markup).toContain('data-testid="right-sidebar-tray"');
    expect(markup).toContain("rounded-full");
    expect(markup).toContain('data-testid="right-sidebar-tray-context"');
    expect(markup).toContain('aria-label="Restore Context prompt"');
    expect(markup).toContain('data-testid="right-sidebar-tray-close-context"');
    expect(markup).toContain('data-testid="right-sidebar-hidden-context"');
    expect(markup).toContain("panel-context-prompt");
    expect(markup).not.toContain('data-testid="right-sidebar-tile-context"');
  });

  test("keeps tiles mounted but display-hidden when the region is hidden", () => {
    const markup = renderToStaticMarkup(
      createElement(RightSidebar, regionProps({ tiles: ["changes"], hidden: true })),
    );
    expect(markup).toContain('data-testid="right-sidebar"');
    expect(markup).toContain("hidden");
    expect(markup).toContain("panel-changes");
  });
});
