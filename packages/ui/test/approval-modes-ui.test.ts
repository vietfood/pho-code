import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultSessionApprovalSnapshot } from "@pho-code/protocol";
import {
  ApprovalModeControl,
  ApprovalRequestCard,
  ApprovalReviewActivityView,
  FullAccessWarningDialog,
} from "../src";

describe("approval mode UI", () => {
  test("shows the authoritative mode and only supported choices", () => {
    const approval = {
      ...defaultSessionApprovalSnapshot(),
      supportedModes: [
        { mode: "ask" as const, owner: "pho" as const, support: "native" as const },
        { mode: "auto" as const, owner: "pho" as const, support: "native" as const },
      ],
    };
    const markup = renderToStaticMarkup(createElement(ApprovalModeControl, { approval, disabled: false, onChange: () => undefined }));
    expect(markup).toContain('data-testid="approval-mode-control"');
    expect(markup).toContain("Approval mode: Ask for approval");
    expect(markup).not.toContain("Full access");
  });

  test("renders exact owner decisions and automatic-review rationale", () => {
    const markup = renderToStaticMarkup(createElement(ApprovalRequestCard, {
      request: {
        backendId: "pi",
        workspaceId: "workspace",
        sessionId: "session",
        requestId: "request-1",
        source: "automatic-review",
        action: {
          title: "Use an external path?",
          summary: "Write one file outside the workspace.",
          exactInput: '{"content":"exact","path":"/tmp/note.txt"}',
          target: { label: "Path", value: "/tmp/note.txt" },
        },
        reason: "The reviewer needs your decision.",
      },
      onResolve: () => undefined,
    }));
    expect(markup).toContain("Allow once");
    expect(markup).toContain("Allow for this session");
    expect(markup).toContain("No, provide reason");
    expect(markup).toContain("/tmp/note.txt");
    expect(markup).toContain("View exact request");
    expect(markup).toContain("approval-request-exact-input");
  });

  test("warns honestly for Full and presents review progress", () => {
    const warning = renderToStaticMarkup(createElement(FullAccessWarningDialog, { onConfirm: () => undefined, onCancel: () => undefined }));
    expect(warning).toContain("Files and credentials");
    expect(warning).toContain("Prompt injection");
    expect(warning).toContain("remain blocked");

    const activity = renderToStaticMarkup(createElement(ApprovalReviewActivityView, {
      activity: { requestId: "request-1", state: "reviewing" },
    }));
    expect(activity).toContain("Reviewing access");

    const blocked = renderToStaticMarkup(createElement(ApprovalReviewActivityView, {
      activity: { requestId: "request-2", state: "settled", outcome: "blocked" },
      onRetry: () => undefined,
    }));
    expect(blocked).toContain("Review exact retry");
  });
});
