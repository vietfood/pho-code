import { describe, expect, test } from "bun:test";
import {
  RIPGREP_VERSION,
  SANDBOX_RUNTIME_NESTED_DEPS,
  SANDBOX_RUNTIME_PACKAGE,
  SANDBOX_RUNTIME_VERSION,
  ripgrepPackagedRelativePath,
  ripgrepPlatformId,
  ripgrepReleaseAsset,
} from "../src/sandbox-artifact";

describe("sandbox artifact pins", () => {
  test("records exact sandbox-runtime and ripgrep pins", () => {
    expect(SANDBOX_RUNTIME_PACKAGE).toBe("@anthropic-ai/sandbox-runtime");
    expect(SANDBOX_RUNTIME_VERSION).toBe("0.0.73");
    expect(RIPGREP_VERSION).toBe("15.2.0");
    expect(SANDBOX_RUNTIME_NESTED_DEPS).toEqual(["@pondwader/socks5-server", "commander", "node-forge", "zod"]);
  });

  test("maps macOS architectures to packaged rg paths", () => {
    expect(ripgrepPlatformId("darwin", "arm64")).toBe("darwin-arm64");
    expect(ripgrepPlatformId("darwin", "x64")).toBe("darwin-x64");
    expect(ripgrepPlatformId("linux", "arm64")).toBeUndefined();
    expect(ripgrepPackagedRelativePath("darwin", "arm64")).toBe("ripgrep/15.2.0/darwin-arm64/rg");
    expect(ripgrepReleaseAsset("darwin", "arm64")?.sha256).toHaveLength(64);
    expect(ripgrepReleaseAsset("win32", "x64")).toBeUndefined();
  });
});
