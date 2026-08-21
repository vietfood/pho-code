import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerRail } from "../src/composer-rail";
import { isMacDesktop, localMachineLabel } from "../src/lib/platform";

describe("ComposerRail", () => {
  test("shows machine and workspace chips above the field", () => {
    const markup = renderToStaticMarkup(
      createElement(ComposerRail, { workspaceName: "piui" }),
    );
    expect(markup).toContain('data-testid="composer-rail"');
    expect(markup).toContain('data-testid="composer-rail-machine"');
    expect(markup).toContain(localMachineLabel(isMacDesktop()));
    expect(markup).toContain('data-testid="composer-rail-workspace"');
    expect(markup).toContain("piui");
    // Branch and worktree chips stay out: the protocol carries no branch state.
    expect(markup).not.toContain("lucide-git-branch");
    expect(markup).not.toContain('data-testid="composer-rail-attach"');
  });

  test("omits the workspace chip when no workspace name is known", () => {
    const markup = renderToStaticMarkup(createElement(ComposerRail, {}));
    expect(markup).toContain('data-testid="composer-rail-machine"');
    expect(markup).not.toContain('data-testid="composer-rail-workspace"');
  });

  test("offers attach only when the host supports it, disabled with the reason", () => {
    const enabled = renderToStaticMarkup(
      createElement(ComposerRail, {
        workspaceName: "piui",
        onAttach: () => undefined,
        attachTitle: "Attach PNG, JPEG, GIF, or WebP images",
      }),
    );
    expect(enabled).toContain('data-testid="composer-rail-attach"');
    expect(enabled).toContain('aria-label="Attach images"');
    expect(enabled).not.toContain('disabled=""');

    const disabled = renderToStaticMarkup(
      createElement(ComposerRail, {
        workspaceName: "piui",
        onAttach: () => undefined,
        attachDisabled: true,
        attachTitle: "The selected model does not accept images",
      }),
    );
    expect(disabled).toContain('disabled=""');
    expect(disabled).toContain("The selected model does not accept images");
  });
});
