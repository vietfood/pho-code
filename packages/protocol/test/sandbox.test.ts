import { describe, expect, test } from "bun:test";
import {
  emptySandboxSettingsSnapshot,
  emptySettingsSnapshot,
  isJsonSafeValue,
  isSandboxBashToolName,
  isSandboxNetworkMode,
  isSandboxStatus,
  jsonRoundTrip,
  MAX_SANDBOX_ALLOWED_DOMAINS,
  MAX_SANDBOX_PATH_LIST,
  parseSandboxAllowedDomains,
  parseSandboxDomain,
  parseSandboxPathEntry,
  parseSandboxPathList,
  parseSandboxSettingsPatch,
  SANDBOX_DISCLOSURE,
  sandboxBashWasWrapped,
  sandboxStatusLabel,
} from "../src/index";

describe("sandbox protocol", () => {
  test("empty snapshot is JSON-safe and includes honesty copy", () => {
    const snapshot = emptySandboxSettingsSnapshot();
    expect(snapshot.enabled).toBe(false);
    expect(snapshot.status).toBe("off");
    expect(snapshot.networkMode).toBe("deny");
    expect(snapshot.allowedDomains).toEqual([]);
    expect(snapshot.includePackageRegistryDefaults).toBe(false);
    expect(snapshot.disclosure).toBe(SANDBOX_DISCLOSURE);
    expect(snapshot.disclosure).toContain("Seatbelt for agent bash");
    expect(isJsonSafeValue(snapshot)).toBe(true);
    expect(jsonRoundTrip(snapshot)).toEqual(snapshot);
    expect(JSON.stringify(snapshot)).not.toContain("sandbox-exec");
    expect(JSON.stringify(snapshot)).not.toMatch(/proxy port|ripgrep|\brg\b/i);
  });

  test("settings snapshot includes sandbox without engine internals", () => {
    const snapshot = emptySettingsSnapshot();
    expect(snapshot.sandbox.status).toBe("off");
    expect(snapshot.sandbox.enabled).toBe(false);
    expect(isJsonSafeValue(snapshot)).toBe(true);
  });

  test("accepts only known statuses and network modes", () => {
    expect(isSandboxStatus("healthy")).toBe(true);
    expect(isSandboxStatus("running")).toBe(false);
    expect(isSandboxNetworkMode("deny")).toBe(true);
    expect(isSandboxNetworkMode("allowlist")).toBe(true);
    expect(isSandboxNetworkMode("allow-all")).toBe(false);
    expect(sandboxStatusLabel("failed")).toBe("Failed");
    expect(isSandboxBashToolName("bash")).toBe(true);
    expect(isSandboxBashToolName("user_bash")).toBe(true);
    expect(isSandboxBashToolName("Run")).toBe(true);
    expect(isSandboxBashToolName("write")).toBe(false);
    expect(sandboxBashWasWrapped("bash", "healthy")).toBe(true);
    expect(sandboxBashWasWrapped("bash", "off")).toBe(false);
    expect(sandboxBashWasWrapped("write", "healthy")).toBe(false);
  });

  test("rejects wildcard, empty, and oversized domain allowlists", () => {
    expect(parseSandboxDomain("*")).toBeUndefined();
    expect(parseSandboxDomain("")).toBeUndefined();
    expect(parseSandboxDomain("*.github.com")).toBe("*.github.com");
    expect(parseSandboxDomain("github.com")).toBe("github.com");
    expect(parseSandboxDomain("*.*.github.com")).toBeUndefined();
    expect(parseSandboxAllowedDomains(["*"])).toBeUndefined();
    expect(parseSandboxAllowedDomains(["github.com", "api.github.com"])).toEqual([
      "github.com",
      "api.github.com",
    ]);
    expect(parseSandboxAllowedDomains(Array.from({ length: MAX_SANDBOX_ALLOWED_DOMAINS + 1 }, () => "a.com"))).toBeUndefined();
  });

  test("rejects relative extra paths and parent traversal", () => {
    expect(parseSandboxPathEntry("/tmp/extra")).toBe("/tmp/extra");
    expect(parseSandboxPathEntry("~/Documents")).toBe("~/Documents");
    expect(parseSandboxPathEntry("relative")).toBeUndefined();
    expect(parseSandboxPathEntry("/tmp/../etc")).toBeUndefined();
    expect(parseSandboxPathList(["/tmp/a", "/tmp/b"])).toEqual(["/tmp/a", "/tmp/b"]);
    expect(parseSandboxPathList(Array.from({ length: MAX_SANDBOX_PATH_LIST + 1 }, (_, index) => `/tmp/${index}`))).toBeUndefined();
  });

  test("parses a sandbox settings patch or returns a field error", () => {
    expect(parseSandboxSettingsPatch({})).toEqual({ ok: false, message: "No sandbox settings were provided." });
    expect(parseSandboxSettingsPatch({ enabled: true, networkMode: "deny" })).toEqual({
      ok: true,
      patch: { enabled: true, networkMode: "deny" },
    });
    expect(parseSandboxSettingsPatch({ allowedDomains: ["*"] }).ok).toBe(false);
    expect(parseSandboxSettingsPatch({ additionalReadPaths: ["relative"] }).ok).toBe(false);
  });
});
