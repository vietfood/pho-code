import path from "node:path";
import { describe, expect, test } from "bun:test";
import { contentSecurityPolicy, isSafeExternalUrl } from "../../electron/security-policy";
import {
  isTrustedRendererUrl,
  isTrustedSenderFrame,
  resolveTrustedRendererLocation,
} from "../../electron/trusted-renderer";

const production = resolveTrustedRendererLocation({
  rendererDirectory: "/app/out/renderer",
});

const development = resolveTrustedRendererLocation({
  rendererDirectory: "/app/out/renderer",
  devServerUrl: "http://localhost:5173/",
});

describe("trusted renderer location", () => {
  test("accepts the production renderer entry and files inside it", () => {
    expect(isTrustedRendererUrl("file:///app/out/renderer/index.html", production)).toBe(true);
    expect(isTrustedRendererUrl("file:///app/out/renderer/assets/index.js", production)).toBe(true);
  });

  test("rejects a sibling prefix collision in production", () => {
    expect(isTrustedRendererUrl("file:///app/out/renderer-evil/index.html", production)).toBe(false);
  });

  test("rejects encoded path traversal in production", () => {
    expect(isTrustedRendererUrl("file:///app/out/renderer/%2e%2e/secret.txt", production)).toBe(false);
  });

  test("rejects malformed production URLs", () => {
    expect(isTrustedRendererUrl("not a url", production)).toBe(false);
    expect(isTrustedRendererUrl("file://", production)).toBe(false);
  });

  test("accepts the configured development origin and path", () => {
    expect(isTrustedRendererUrl("http://localhost:5173/", development)).toBe(true);
    expect(isTrustedRendererUrl("http://localhost:5173/index.html", development)).toBe(true);
  });

  test("rejects an alternate development port", () => {
    expect(isTrustedRendererUrl("http://localhost:5174/", development)).toBe(false);
  });

  test("rejects credentials syntax on the development origin", () => {
    expect(isTrustedRendererUrl("http://user:pass@localhost:5173/", development)).toBe(false);
  });

  test("rejects https when the configured origin is http", () => {
    expect(isTrustedRendererUrl("https://localhost:5173/", development)).toBe(false);
  });

  test("rejects a subframe even when the URL is trusted", () => {
    expect(
      isTrustedSenderFrame({
        frameUrl: "file:///app/out/renderer/index.html",
        isMainFrame: false,
        trusted: production,
      }),
    ).toBe(false);
  });

  test("accepts the main frame at the trusted production entry", () => {
    expect(
      isTrustedSenderFrame({
        frameUrl: "file:///app/out/renderer/index.html",
        isMainFrame: true,
        trusted: production,
      }),
    ).toBe(true);
  });

  test("path containment does not treat renderer as a string prefix of renderer-evil", () => {
    const relative = path.relative("/app/out/renderer", "/app/out/renderer-evil/index.html");
    expect(relative.startsWith("..")).toBe(true);
  });
});

describe("security policy", () => {
  test("production CSP forbids eval and limits connect-src to self", () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self'");
  });

  test("rejects non-http(s) and credentialed external URLs", () => {
    expect(isSafeExternalUrl("https://example.com/docs")).toBe(true);
    expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("https://user:pass@example.com/")).toBe(false);
  });
});
