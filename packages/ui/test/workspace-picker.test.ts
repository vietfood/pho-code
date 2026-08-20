import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspacePicker } from "../src/workspace-picker";

const noop = (): void => undefined;

function render(status: Parameters<typeof WorkspacePicker>[0]["runtimeStatus"]): string {
  return renderToStaticMarkup(
    createElement(WorkspacePicker, {
      recents: [],
      sessionsByWorkspace: {},
      appName: "Pho Code",
      appVersion: "0.0.0",
      runtimeStatus: status,
      onPick: noop,
      onOpenRecent: noop,
      onNewSession: noop,
      onOpenSession: noop,
      busy: status.status !== "ready",
    }),
  );
}

describe("workspace picker runtime startup", () => {
  test("shows starting state while keeping the welcome chrome rendered", () => {
    const markup = render({ status: "starting" });
    expect(markup).toContain("Starting Pi…");
    expect(markup).toContain("workspace-heading");
    expect(markup).toContain("disabled");
  });

  test("shows a bounded runtime failure and omits status when ready", () => {
    expect(
      render({
        status: "failed",
        error: {
          code: "runtime_unavailable",
          message: "Pi could not start. Restart Pho Code to try again.",
          recoverable: true,
        },
      }),
    ).toContain("Pi could not start");
    expect(render({ status: "ready" })).not.toContain("pi-runtime-status");
  });
});
