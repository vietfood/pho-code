export const PUBLIC_PRODUCT_NAME = "Pho Code";
export const TECHNICAL_SLUG = "pho-code";
export const BUNDLE_IDENTIFIER = "dev.vietfood.phocode";
export const STAGED_APP_PACKAGE_NAME = "pho-code-app";
export const PUBLIC_VERSION_LINE = "4.0.0-beta.N";
export const RELEASE_CHANNEL = "beta";
export const RELEASE_ARCHITECTURE = "arm64";
export const MINIMUM_MACOS_VERSION = "14.0";
export const BUILD_NUMBER_ENV = "PHO_CODE_BUILD_NUMBER";
export const CODESIGN_IDENTITY_ENV = "PHO_CODE_CODESIGN_IDENTITY";
export const PROOF_ARTIFACT_LABEL = "m0-proof";
export const COPYRIGHT = "Copyright 2026 Pho Code";
export const APP_CATEGORY = "public.app-category.developer-tools";

/** Application-data and Keychain identity follow the bundle identifier. Changing it after distribution is a migration. */
export const APPLICATION_DATA_IDENTITY = BUNDLE_IDENTIFIER;

export const IDENTITY_FREEZE = {
  status: "frozen-for-v4",
  publicNameClearance: "owner-residual",
  notes: [
    "ASCII Pho Code remains the executable, bundle, and protocol display name.",
    "phocode.com already hosts an archived Vietnamese programming blog named Phở Code; that is not trademark clearance.",
    "Phoenix Code at phcode.io / phcode.dev is a distinct editor; do not use those hosts as Pho Code origins.",
  ],
} as const;
