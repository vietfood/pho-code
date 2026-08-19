export const RIPGREP_VERSION = "15.2.0";
export const RIPGREP_TAG = "15.2.0";
export const RIPGREP_UPSTREAM = "https://github.com/BurntSushi/ripgrep";
export const RIPGREP_LICENSE = "Unlicense OR MIT";
export const RIPGREP_EXECUTABLE = "rg";
export const RIPGREP_RELEASED_AT = "2026-07-15";

export const SANDBOX_RUNTIME_PACKAGE = "@anthropic-ai/sandbox-runtime";
export const SANDBOX_RUNTIME_VERSION = "0.0.73";
export const SANDBOX_RUNTIME_LICENSE = "Apache-2.0";
export const SANDBOX_RUNTIME_NESTED_DEPS = [
  "@pondwader/socks5-server",
  "commander",
  "node-forge",
  "zod",
] as const;

export type RipgrepPlatformId = "darwin-arm64" | "darwin-x64";

export interface RipgrepReleaseAsset {
  platform: RipgrepPlatformId;
  asset: string;
  sha256: string;
}

export const RIPGREP_RELEASE_ASSETS: readonly RipgrepReleaseAsset[] = [
  {
    platform: "darwin-arm64",
    asset: "ripgrep-15.2.0-aarch64-apple-darwin.tar.gz",
    sha256: "3750b2e93f37e0c692657da574d7019a101c0084da05a790c83fd335bad973e4",
  },
  {
    platform: "darwin-x64",
    asset: "ripgrep-15.2.0-x86_64-apple-darwin.tar.gz",
    sha256: "af7825fcc69a2afc7a7aea55fc9af90e26421d8f20fe59df32e233c0b8a231c1",
  },
];

export function ripgrepPlatformId(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): RipgrepPlatformId | undefined {
  const id = `${platform}-${arch}`;
  return RIPGREP_RELEASE_ASSETS.some((entry) => entry.platform === id) ? (id as RipgrepPlatformId) : undefined;
}

export function ripgrepReleaseAsset(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): RipgrepReleaseAsset | undefined {
  const id = ripgrepPlatformId(platform, arch);
  return RIPGREP_RELEASE_ASSETS.find((entry) => entry.platform === id);
}

export function ripgrepReleaseUrl(asset: string): string {
  return `${RIPGREP_UPSTREAM}/releases/download/${RIPGREP_TAG}/${asset}`;
}

export function ripgrepPackagedRelativePath(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | undefined {
  const id = ripgrepPlatformId(platform, arch);
  if (!id) {
    return undefined;
  }
  return `ripgrep/${RIPGREP_VERSION}/${id}/${RIPGREP_EXECUTABLE}`;
}
