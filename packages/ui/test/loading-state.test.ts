import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { elapsedSince, formatElapsedTenths } from "../src/lib/elapsed";
import { LoadingState } from "../src/loading-state";

describe("elapsed tenths", () => {
  test("formats seconds then minutes", () => {
    expect(formatElapsedTenths(0)).toBe("0.0s");
    expect(formatElapsedTenths(1_200)).toBe("1.2s");
    expect(formatElapsedTenths(72_400)).toBe("1m 12.4s");
  });

  test("elapsedSince is stable for missing or inverted clocks", () => {
    expect(elapsedSince(undefined, 1_000)).toBe("0.0s");
    expect(elapsedSince("not-a-date", 1_000)).toBe("0.0s");
    expect(elapsedSince("2026-08-13T00:00:00.000Z", Date.parse("2026-08-13T00:00:01.200Z"))).toBe("1.2s");
  });
});

describe("LoadingState", () => {
  test("renders the Drive pixel grid, shimmer label, and elapsed timer", () => {
    const markup = renderToStaticMarkup(
      createElement(LoadingState, { label: "Working", elapsed: "1.2s" }),
    );
    expect(markup).toContain('data-testid="agent-loading"');
    expect(markup).toContain('data-variant="drive"');
    expect(markup).toContain("Working");
    expect(markup).toContain("1.2s");
    expect(markup).toContain("aria-label=\"Working 1.2s\"");
    expect(markup).toContain("pixel-on");
    expect(markup).toContain("loading-state-grid");
  });
});
