import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Alert, AlertDescription, AlertTitle } from "../src/ui/alert";

describe("Alert", () => {
  test("renders title and description in the destructive variant", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Alert,
        { variant: "destructive", role: "alert" },
        createElement(AlertTitle, null, "Run failed"),
        createElement(AlertDescription, null, "no rollout found for thread id 01a040df"),
      ),
    );
    expect(markup).toContain('data-slot="alert"');
    expect(markup).toContain('data-slot="alert-title"');
    expect(markup).toContain('data-slot="alert-description"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("text-destructive");
    expect(markup).toContain("Run failed");
    expect(markup).toContain("no rollout found for thread id 01a040df");
  });

  test("defaults to the neutral variant and merges caller classes", () => {
    const markup = renderToStaticMarkup(createElement(Alert, { className: "mx-3" }, "Heads up"));
    expect(markup).toContain("bg-card");
    expect(markup).toContain("mx-3");
    expect(markup).not.toContain("text-destructive");
  });
});
