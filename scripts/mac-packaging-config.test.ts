import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { BUNDLE_IDENTIFIER, PROOF_ARTIFACT_LABEL } from "./release-identity.ts";
import {
  FORBIDDEN_ENTITLEMENT_KEYS,
  LOCAL_MAC_OUTPUT_DIR,
  MAC_ENTITLEMENTS_FILE,
  MAC_ENTITLEMENTS_INHERIT_FILE,
  MISSING_RELEASE_CREDENTIALS_MESSAGE,
  PROOF_MAC_OUTPUT_DIR,
  assertMacEntitlementsAreMinimal,
  createMacElectronBuilderConfig,
  electronBuilderMacArgs,
  parseMacPackageFlavor,
  requireProofSigningInputs,
} from "./mac-packaging-config.ts";

/** Proof packaging must never emit an unsigned or un-notarized app. */
function assertCannotFallbackUnsigned(config: Record<string, unknown>): void {
  if (config.forceCodeSigning !== true) {
    throw new Error("Proof packaging must set forceCodeSigning.");
  }
  const mac = config.mac as Record<string, unknown> | undefined;
  if (!mac || mac.identity === null || mac.hardenedRuntime !== true || mac.notarize !== true) {
    throw new Error("Proof packaging cannot fall back to an unsigned or un-notarized app.");
  }
}

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
    expect(PROOF_MAC_OUTPUT_DIR.endsWith("apps/desktop/release-proof")).toBe(true);
    assertCannotFallbackUnsigned(config);
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
