import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorToast } from "../src/error-toast";

describe("ErrorToast", () => {
  test("pins to the bottom-left corner with a dismiss control", () => {
    const markup = renderToStaticMarkup(
      createElement(ErrorToast, {
        title: "Run failed",
        message: "no rollout found for thread id 01a040df",
        testId: "run-error",
        onDismiss: () => undefined,
      }),
    );
    expect(markup).toContain("fixed");
    expect(markup).toContain("left-4");
    expect(markup).toContain("bottom-24");
    expect(markup).not.toContain("right-4");
    expect(markup).toContain('data-testid="run-error"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Run failed");
    expect(markup).toContain("no rollout found for thread id 01a040df");
    expect(markup).toContain('aria-label="Dismiss error"');
  });

  test("falls back to a generic title", () => {
    const markup = renderToStaticMarkup(
      createElement(ErrorToast, { message: "boom", onDismiss: () => undefined }),
    );
    expect(markup).toContain("Something went wrong");
  });
});
