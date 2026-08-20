import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  APPLICATION_DATA_IDENTITY,
  BUNDLE_IDENTIFIER,
  PROOF_ARTIFACT_LABEL,
  PUBLIC_PRODUCT_NAME,
  PUBLIC_VERSION_LINE,
  RELEASE_CHANNEL,
} from "./release-identity.ts";
import { RELEASE_ORIGINS, RELEASE_ORIGINS_ARE_PLACEHOLDERS, assertReleaseOriginsShape } from "./release-origins.ts";
import { REQUIRED_NESTED_CODE_PATH_PATTERNS, isNestedCodeRelativePath } from "./mac-nested-code.ts";
import {
  FORBIDDEN_ENTITLEMENT_KEYS,
  LOCAL_MAC_OUTPUT_DIR,
  MAC_ENTITLEMENTS_FILE,
  MAC_ENTITLEMENTS_INHERIT_FILE,
  MISSING_RELEASE_CREDENTIALS_MESSAGE,
  PROOF_MAC_OUTPUT_DIR,
  assertMacEntitlementsAreMinimal,
  assertProofConfigCannotFallbackUnsigned,
  createMacElectronBuilderConfig,
  electronBuilderMacArgs,
  parseMacPackageFlavor,
  requireProofSigningInputs,
} from "./mac-packaging-config.ts";

const builderPaths = {
  outputDir: "/tmp/pho-code-package-out",
  buildResourcesDir: "/tmp/pho-code-build-resources",
};

describe("macOS package flavors", () => {
  test("parses local vs proof from argv", () => {
    expect(parseMacPackageFlavor(["package-mac.ts"])).toBe("local");
    expect(parseMacPackageFlavor(["package-mac.ts", "--proof"])).toBe("proof");
  });

  test("local flavor stays unsigned dir output and does not notarize", () => {
    const config = createMacElectronBuilderConfig("local", builderPaths);
    const mac = config.mac as Record<string, unknown>;
    expect(config.appId).toBe(BUNDLE_IDENTIFIER);
    expect(config.appId).toBe(APPLICATION_DATA_IDENTITY);
    expect(config.forceCodeSigning).toBeUndefined();
    expect(mac.identity).toBeNull();
    expect(mac.hardenedRuntime).toBe(false);
    expect(mac.gatekeeperAssess).toBe(false);
    expect(mac.notarize).toBeUndefined();
    expect(mac.target).toEqual(["dir"]);
    expect(config.artifactName).toBe("${productName}-${version}-${arch}.${ext}");
    expect(electronBuilderMacArgs("local")).toEqual(["--mac", "dir", "--publish", "never"]);
    const extraResources = config.extraResources as Array<{ to: string }>;
    expect(extraResources.some((entry) => entry.to === "LICENSE")).toBe(true);
    expect(extraResources.some((entry) => entry.to === "EULA.md")).toBe(true);
    expect(LOCAL_MAC_OUTPUT_DIR.endsWith("apps/desktop/release")).toBe(true);
  });

  test("proof flavor requires credentials before a config exists", () => {
    expect(() => createMacElectronBuilderConfig("proof", builderPaths)).toThrow(MISSING_RELEASE_CREDENTIALS_MESSAGE);
    expect(() => requireProofSigningInputs({})).toThrow(MISSING_RELEASE_CREDENTIALS_MESSAGE);
    expect(() =>
      requireProofSigningInputs({
        CSC_NAME: "Developer ID Application: Example (TEAM)",
      }),
    ).toThrow(MISSING_RELEASE_CREDENTIALS_MESSAGE);
  });

  test("proof flavor enables hardened runtime, force signing, notarize, and DMG/ZIP", () => {
    const signing = requireProofSigningInputs({
      PHO_CODE_CODESIGN_IDENTITY: "Developer ID Application: Example (TEAM)",
      APPLE_API_KEY: "/tmp/AuthKey.p8",
      APPLE_API_KEY_ID: "KEYID",
      APPLE_API_ISSUER: "issuer-uuid",
    });
    const config = createMacElectronBuilderConfig("proof", builderPaths, { signing, buildNumber: "7" });
    const mac = config.mac as Record<string, unknown>;
    expect(config.forceCodeSigning).toBe(true);
    expect(config.buildVersion).toBe("7");
    expect(mac.identity).toBe("Developer ID Application: Example (TEAM)");
    expect(mac.hardenedRuntime).toBe(true);
    expect(mac.notarize).toBe(true);
    expect(mac.minimumSystemVersion).toBe("14.0");
    expect(mac.target).toEqual([
      { target: "dmg", arch: ["arm64"] },
      { target: "zip", arch: ["arm64"] },
    ]);
    expect(String(config.artifactName)).toContain(PROOF_ARTIFACT_LABEL);
    expect(String(config.artifactName)).not.toContain("beta");
    expect(String(config.artifactName)).not.toContain(PUBLIC_VERSION_LINE);
    expect(PROOF_MAC_OUTPUT_DIR.endsWith("apps/desktop/release-proof")).toBe(true);
    assertProofConfigCannotFallbackUnsigned(config);
  });

  test("proof entitlements omit debug and library-validation exceptions", () => {
    const mainPlist = readFileSync(MAC_ENTITLEMENTS_FILE, "utf8");
    const inheritPlist = readFileSync(MAC_ENTITLEMENTS_INHERIT_FILE, "utf8");
    assertMacEntitlementsAreMinimal(mainPlist);
    assertMacEntitlementsAreMinimal(inheritPlist);
    for (const key of FORBIDDEN_ENTITLEMENT_KEYS) {
      expect(mainPlist.includes(key)).toBe(false);
      expect(inheritPlist.includes(key)).toBe(false);
    }
  });
});

describe("release identity and origins", () => {
  test("keeps the frozen public identity and placeholder HTTPS origins", () => {
    expect(PUBLIC_PRODUCT_NAME).toBe("Pho Code");
    expect(BUNDLE_IDENTIFIER).toBe("dev.vietfood.phocode");
    expect(RELEASE_CHANNEL).toBe("beta");
    expect(RELEASE_ORIGINS_ARE_PLACEHOLDERS).toBe(true);
    assertReleaseOriginsShape();
    expect(RELEASE_ORIGINS.downloadPage.startsWith("https://")).toBe(true);
    expect(RELEASE_ORIGINS.updateFeed.includes(".invalid")).toBe(true);
  });
});

describe("nested native code inventory", () => {
  test("classifies bundled executables and native libraries", () => {
    expect(isNestedCodeRelativePath("Contents/Resources/features/ripgrep/15.2.0/darwin-arm64/rg")).toBe(true);
    expect(isNestedCodeRelativePath("Contents/Resources/features/github/github-mcp-server/1.9.0/darwin-arm64/github-mcp-server")).toBe(
      true,
    );
    expect(isNestedCodeRelativePath("Contents/Resources/app.asar.unpacked/node_modules/@ff-labs/fff-darwin-arm64/fff.node")).toBe(
      true,
    );
    expect(isNestedCodeRelativePath("Contents/Resources/LICENSE")).toBe(false);
    expect(
      REQUIRED_NESTED_CODE_PATH_PATTERNS.every((pattern) =>
        [
          "Contents/Resources/features/ripgrep/15.2.0/darwin-arm64/rg",
          "Contents/Resources/features/github/github-mcp-server/1.9.0/darwin-arm64/github-mcp-server",
          "Contents/Resources/app.asar.unpacked/node_modules/@ff-labs/fff.node",
        ].some((sample) => pattern.test(sample)),
      ),
    ).toBe(true);
  });
});
