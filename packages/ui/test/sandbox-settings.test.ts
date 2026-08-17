import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { emptySandboxSettingsSnapshot, SANDBOX_DISCLOSURE } from "@pho-code/protocol";
import { SandboxSettingsSection } from "../src/sandbox-settings";

describe("sandbox settings", () => {
  test("renders honesty copy, status, and controls", () => {
    const markup = renderToStaticMarkup(
      createElement(SandboxSettingsSection, {
        sandbox: emptySandboxSettingsSnapshot(),
        busy: false,
        running: false,
        onChange: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="sandbox-settings"');
    expect(markup).toContain(SANDBOX_DISCLOSURE);
    expect(markup).toContain("Enable sandbox");
    expect(markup).toContain("Status: Off");
    expect(markup).toContain('data-testid="sandbox-network-deny"');
    expect(markup).toContain("Workspace and temp are already writable");
    expect(markup).not.toContain("sandbox-exec");
    expect(markup).not.toContain("proxy port");
  });

  test("shows idle-pending copy while a run is active", () => {
    const markup = renderToStaticMarkup(
      createElement(SandboxSettingsSection, {
        sandbox: {
          ...emptySandboxSettingsSnapshot(),
          enabled: true,
          status: "healthy",
          platformSupported: true,
        },
        busy: false,
        running: true,
        onChange: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="sandbox-idle-pending"');
    expect(markup).toContain("Wait until this run finishes.");
  });
});
