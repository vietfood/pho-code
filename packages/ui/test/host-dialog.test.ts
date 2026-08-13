import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { HostDialog } from "../src/host-dialog";

describe("inline host dialog", () => {
  test("renders a compact composer-dock approval card instead of a full-screen modal", () => {
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
    expect(markup).toContain("approval-card");
    expect(markup).toContain("Pending approval");
    expect(markup).toContain("Permission Required");
    expect(markup).toContain("Allow bash?");
    expect(markup).toContain("approval-radio");
    expect(markup).toContain('aria-label="Continue"');
    expect(markup).toContain('aria-label="Dismiss"');
    expect(markup).not.toContain("fixed inset-0");
    expect(markup).not.toContain("aria-modal");
    expect(markup).not.toContain("glass-panel");
  });

  test("confirm prompts keep Approve/Decline with a compact send control", () => {
    const markup = renderToStaticMarkup(
      createElement(HostDialog, {
        request: {
          requestId: "req-2",
          kind: "confirm",
          title: "Confirm harness action?",
          message: "Approve this representative dialog.",
        },
        onResolve: () => undefined,
      }),
    );
    expect(markup).toContain("Pending approval");
    expect(markup).toContain("Confirm harness action?");
    expect(markup).toContain("Decline");
    expect(markup).toContain('aria-label="Approve"');
    expect(markup).toContain('data-testid="extension-dialog-confirm"');
  });
});
