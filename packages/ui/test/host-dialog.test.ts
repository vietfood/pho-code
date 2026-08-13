import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { HostDialog } from "../src/host-dialog";

describe("inline host dialog", () => {
  test("renders a composer-dock card instead of a full-screen modal", () => {
    const markup = renderToStaticMarkup(
      createElement(HostDialog, {
        request: {
          requestId: "req-1",
          kind: "select",
          title: "Permission Required",
          message: "Allow bash?",
          options: ["Yes", "No"],
        },
        onResolve: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="extension-dialog"');
    expect(markup).toContain("Pending approval");
    expect(markup).toContain("Permission Required");
    expect(markup).toContain("Allow bash?");
    expect(markup).not.toContain("fixed inset-0");
    expect(markup).not.toContain("aria-modal");
  });
});
