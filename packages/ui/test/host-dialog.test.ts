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

  test("permission prompts show a readable summary and hide the raw request until opened", () => {
    const markup = renderToStaticMarkup(
      createElement(HostDialog, {
        request: {
          requestId: "req-fetch",
          kind: "select",
          title: "Permission Required",
          message:
            'Current agent requested tool \'fetch\' with input {"url":"https://raw.githubusercontent.com/NVIDIA/cuEquivariance/SKILL.md"}. Allow this call?',
          options: ["Yes", 'Yes, allow tool "fetch_content" for this session', "No", "No, provide reason"],
        },
        onResolve: () => undefined,
      }),
    );
    expect(markup).toContain("The agent wants to fetch a file from GitHub.");
    expect(markup).toContain("https://raw.githubusercontent.com/NVIDIA/cuEquivariance/SKILL.md");
    expect(markup).toContain("View request");
    expect(markup).toContain('data-testid="extension-dialog-view-request"');
    expect(markup).not.toContain("Current agent requested tool");
    expect(markup).not.toContain('data-testid="extension-dialog-raw-request"');
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
