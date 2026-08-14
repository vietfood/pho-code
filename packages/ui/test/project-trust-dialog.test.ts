import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectTrustBanner } from "../src/project-trust-banner";
import { ProjectTrustDialog } from "../src/project-trust-dialog";

describe("project trust UI", () => {
  test("dialog asks to trust permission rules and shows the workspace path", () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectTrustDialog, {
        workspaceName: "demo",
        workspacePath: "/tmp/demo",
        sessionTrusted: false,
        busy: false,
        onConfirm: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="project-trust-dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain("Trust this project");
    expect(markup).toContain("Not now");
    expect(markup).toContain("This project is not trusted");
    expect(markup).toContain("only the global policy applies");
    expect(markup).toContain("/tmp/demo");
    expect(markup).toContain("does not enable project extensions");
  });

  test("dialog explains process-lifetime approval when the folder is already open", () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectTrustDialog, {
        workspaceName: "demo",
        workspacePath: "/tmp/demo",
        sessionTrusted: true,
        busy: false,
        onConfirm: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(markup).toContain("applies for this session because you opened the folder here");
  });

  test("banner offers Trust and Dismiss after the dialog is deferred", () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectTrustBanner, {
        sessionTrusted: false,
        onTrust: () => undefined,
        onDismiss: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="project-trust-banner"');
    expect(markup).toContain('data-testid="project-trust-banner-trust"');
    expect(markup).toContain("Dismiss");
    expect(markup).toContain("This project is not trusted");
  });
});
