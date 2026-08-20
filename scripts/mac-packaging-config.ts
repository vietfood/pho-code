import { readFileSync } from "node:fs";
import path from "node:path";
import { PINNED_ELECTRON } from "../packages/protocol/src/version.ts";
import {
  APP_CATEGORY,
  BUILD_NUMBER_ENV,
  BUNDLE_IDENTIFIER,
  CODESIGN_IDENTITY_ENV,
  COPYRIGHT,
  MINIMUM_MACOS_VERSION,
  PROOF_ARTIFACT_LABEL,
  PUBLIC_PRODUCT_NAME,
  RELEASE_ARCHITECTURE,
} from "./release-identity.ts";
import { DESKTOP_DIR, DESKTOP_RESOURCES_DIR, WORKSPACE_ROOT } from "./stage-app-resources.ts";

export type MacPackageFlavor = "local" | "proof";

export const FORBIDDEN_ENTITLEMENT_KEYS = [
  "com.apple.security.get-task-allow",
  "com.apple.security.cs.disable-library-validation",
  "com.apple.security.cs.allow-dyld-environment-variables",
  "com.apple.security.cs.disable-executable-page-protection",
] as const;

export const MAC_ENTITLEMENTS_FILE = path.join(DESKTOP_DIR, "build", "entitlements.mac.plist");
export const MAC_ENTITLEMENTS_INHERIT_FILE = path.join(DESKTOP_DIR, "build", "entitlements.mac.inherit.plist");

export const LOCAL_MAC_OUTPUT_DIR = path.join(DESKTOP_DIR, "release");
export const PROOF_MAC_OUTPUT_DIR = path.join(DESKTOP_DIR, "release-proof");

export const MISSING_RELEASE_CREDENTIALS_MESSAGE =
  "Release proof packaging requires a Developer ID identity and notarization credentials. No releasable artifact was written.";

export interface ProofSigningInputs {
  identity: string | undefined;
  notarization: "api-key" | "apple-id";
}

export interface MacBuilderPaths {
  outputDir: string;
  buildResourcesDir: string;
}

export function parseMacPackageFlavor(argv: readonly string[]): MacPackageFlavor {
  return argv.includes("--proof") ? "proof" : "local";
}

function envValue(env: NodeJS.Dict<string>, key: string): string | undefined {
  const value = env[key];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export function requireProofSigningInputs(env: NodeJS.Dict<string>): ProofSigningInputs {
  const identity = envValue(env, CODESIGN_IDENTITY_ENV) ?? envValue(env, "CSC_NAME");
  const hasP12 = Boolean(envValue(env, "CSC_LINK"));
  if (!identity && !hasP12) {
    throw new Error(MISSING_RELEASE_CREDENTIALS_MESSAGE);
  }

  const hasApiKey =
    Boolean(envValue(env, "APPLE_API_KEY")) &&
    Boolean(envValue(env, "APPLE_API_KEY_ID")) &&
    Boolean(envValue(env, "APPLE_API_ISSUER"));
  const hasAppleId =
    Boolean(envValue(env, "APPLE_ID")) &&
    Boolean(envValue(env, "APPLE_APP_SPECIFIC_PASSWORD")) &&
    Boolean(envValue(env, "APPLE_TEAM_ID"));
  if (!hasApiKey && !hasAppleId) {
    throw new Error(MISSING_RELEASE_CREDENTIALS_MESSAGE);
  }

  return {
    identity,
    notarization: hasApiKey ? "api-key" : "apple-id",
  };
}

export function macOutputDir(flavor: MacPackageFlavor): string {
  switch (flavor) {
    case "local":
      return LOCAL_MAC_OUTPUT_DIR;
    case "proof":
      return PROOF_MAC_OUTPUT_DIR;
    default: {
      const exhaustive: never = flavor;
      throw new Error(`Unhandled package flavor: ${exhaustive}`);
    }
  }
}

function macTargets(flavor: MacPackageFlavor): unknown {
  switch (flavor) {
    case "local":
      return ["dir"];
    case "proof":
      return [
        { target: "dmg", arch: [RELEASE_ARCHITECTURE] },
        { target: "zip", arch: [RELEASE_ARCHITECTURE] },
      ];
    default: {
      const exhaustive: never = flavor;
      throw new Error(`Unhandled package flavor: ${exhaustive}`);
    }
  }
}

function macSigning(flavor: MacPackageFlavor, inputs?: ProofSigningInputs): Record<string, unknown> {
  switch (flavor) {
    case "local":
      return {
        identity: null,
        hardenedRuntime: false,
        gatekeeperAssess: false,
      };
    case "proof":
      if (!inputs) {
        throw new Error(MISSING_RELEASE_CREDENTIALS_MESSAGE);
      }
      return {
        ...(inputs.identity ? { identity: inputs.identity } : {}),
        type: "distribution",
        hardenedRuntime: true,
        gatekeeperAssess: false,
        entitlements: MAC_ENTITLEMENTS_FILE,
        entitlementsInherit: MAC_ENTITLEMENTS_INHERIT_FILE,
        notarize: true,
        minimumSystemVersion: MINIMUM_MACOS_VERSION,
      };
    default: {
      const exhaustive: never = flavor;
      throw new Error(`Unhandled package flavor: ${exhaustive}`);
    }
  }
}

export function createMacElectronBuilderConfig(
  flavor: MacPackageFlavor,
  paths: MacBuilderPaths,
  options?: { signing?: ProofSigningInputs; buildNumber?: string },
): Record<string, unknown> {
  const signing = flavor === "proof" ? options?.signing : undefined;
  if (flavor === "proof" && !signing) {
    throw new Error(MISSING_RELEASE_CREDENTIALS_MESSAGE);
  }
  if (flavor === "proof") {
    assertMacEntitlementsAreMinimal(readFileSync(MAC_ENTITLEMENTS_FILE, "utf8"));
    assertMacEntitlementsAreMinimal(readFileSync(MAC_ENTITLEMENTS_INHERIT_FILE, "utf8"));
  }

  return {
    appId: BUNDLE_IDENTIFIER,
    productName: PUBLIC_PRODUCT_NAME,
    electronVersion: PINNED_ELECTRON.version,
    copyright: COPYRIGHT,
    ...(flavor === "proof" ? { forceCodeSigning: true } : {}),
    directories: {
      output: paths.outputDir,
      buildResources: paths.buildResourcesDir,
    },
    files: [
      "**/*",
      "!**/node_modules/@gotgenes/**",
      "!**/node_modules/@pho-code/**",
      "!**/node_modules/pi-cursor-sdk/**",
      "!**/node_modules/@cursor/**",
    ],
    asar: true,
    asarUnpack: [
      "**/*.node",
      "**/*.wasm",
      "**/*.dylib",
      "**/*.so",
      "**/node_modules/@silvia-odwyer/photon-node/**/*",
      "**/node_modules/@ff-labs/**/*",
      "**/node_modules/ffi-rs/**/*",
      "**/node_modules/@cursor/**/*",
    ],
    extraResources: [
      { from: path.join(DESKTOP_RESOURCES_DIR, "features"), to: "features" },
      { from: path.join(DESKTOP_RESOURCES_DIR, "THIRD_PARTY_NOTICES.txt"), to: "THIRD_PARTY_NOTICES.txt" },
      { from: path.join(WORKSPACE_ROOT, "LICENSE"), to: "LICENSE" },
      { from: path.join(WORKSPACE_ROOT, "EULA.md"), to: "EULA.md" },
    ],
    npmRebuild: false,
    nodeGypRebuild: false,
    mac: {
      ...macSigning(flavor, signing),
      category: APP_CATEGORY,
      target: macTargets(flavor),
      darkModeSupport: true,
    },
    artifactName:
      flavor === "proof"
        ? `${PUBLIC_PRODUCT_NAME}-${PROOF_ARTIFACT_LABEL}-\${arch}.\${ext}`
        : "${productName}-${version}-${arch}.${ext}",
    ...(flavor === "proof" ? { buildVersion: options?.buildNumber ?? "1" } : {}),
  };
}

export function electronBuilderMacArgs(flavor: MacPackageFlavor): readonly string[] {
  switch (flavor) {
    case "local":
      return ["--mac", "dir", "--publish", "never"];
    case "proof":
      return ["--mac", `--${RELEASE_ARCHITECTURE}`, "--publish", "never"];
    default: {
      const exhaustive: never = flavor;
      throw new Error(`Unhandled package flavor: ${exhaustive}`);
    }
  }
}

export function assertProofConfigCannotFallbackUnsigned(config: Record<string, unknown>): void {
  if (config.forceCodeSigning !== true) {
    throw new Error("Proof packaging must set forceCodeSigning.");
  }
  const mac = config.mac as Record<string, unknown> | undefined;
  if (!mac || mac.identity === null || mac.hardenedRuntime !== true || mac.notarize !== true) {
    throw new Error("Proof packaging cannot fall back to an unsigned or un-notarized app.");
  }
}

export function proofBuildNumber(env: NodeJS.Dict<string>): string {
  return envValue(env, BUILD_NUMBER_ENV) ?? "1";
}

export function assertMacEntitlementsAreMinimal(plist: string): void {
  for (const key of FORBIDDEN_ENTITLEMENT_KEYS) {
    if (plist.includes(key)) {
      throw new Error(`Forbidden entitlement ${key} is not allowed in V4 proof packaging.`);
    }
  }
  if (!plist.includes("com.apple.security.cs.allow-jit")) {
    throw new Error("Proof entitlements must allow Chromium JIT.");
  }
}
