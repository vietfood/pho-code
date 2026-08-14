export const GITHUB_MCP_SERVER_VERSION = "1.9.0";
export const GITHUB_MCP_SERVER_TAG = "v1.9.0";
export const GITHUB_MCP_SERVER_UPSTREAM = "https://github.com/github/github-mcp-server";
export const GITHUB_MCP_SERVER_LICENSE = "MIT";
export const GITHUB_MCP_SERVER_EXECUTABLE = "github-mcp-server";
export const GITHUB_MCP_SERVER_RELEASED_AT = "2026-08-10";
export const GITHUB_MCP_CLIENT_SDK = "@modelcontextprotocol/sdk";
export const GITHUB_MCP_CLIENT_SDK_VERSION = "1.30.0";

export const GITHUB_MCP_TOOLSETS = "context,repos,issues,pull_requests,actions";
export const GITHUB_MCP_SERVER_ARGS = [
  "stdio",
  "--read-only",
  "--lockdown-mode",
  "--toolsets",
  GITHUB_MCP_TOOLSETS,
] as const;

export const GITHUB_MCP_TOKEN_ENV = "GITHUB_PERSONAL_ACCESS_TOKEN";

export type GitHubMcpPlatformId = "darwin-arm64" | "darwin-x64" | "linux-arm64" | "linux-x64";

export interface GitHubMcpReleaseAsset {
  platform: GitHubMcpPlatformId;
  asset: string;
  sha256: string;
}

export const GITHUB_MCP_RELEASE_ASSETS: readonly GitHubMcpReleaseAsset[] = [
  {
    platform: "darwin-arm64",
    asset: "github-mcp-server_Darwin_arm64.tar.gz",
    sha256: "cd38785573052942c337805ea365bbc27718e0bd254ee4a48e668a76b3f4a1ce",
  },
  {
    platform: "darwin-x64",
    asset: "github-mcp-server_Darwin_x86_64.tar.gz",
    sha256: "7a6395a29752b3ad771bfb9d66fd1bfcb088fcbdfeb65fc22cb1146b67a3621a",
  },
  {
    platform: "linux-arm64",
    asset: "github-mcp-server_Linux_arm64.tar.gz",
    sha256: "11e14ce34492b6a07ae4bc567d8773fc4cd3dd77e91daf3f9cacc88b15d840ea",
  },
  {
    platform: "linux-x64",
    asset: "github-mcp-server_Linux_x86_64.tar.gz",
    sha256: "cbf38bd3364518ccf80b6a25587d5ef11655b15d63cbb48bc066384d0b5b5964",
  },
];

export function githubMcpPlatformId(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): GitHubMcpPlatformId | undefined {
  if (platform === "darwin" && arch === "arm64") {
    return "darwin-arm64";
  }
  if (platform === "darwin" && arch === "x64") {
    return "darwin-x64";
  }
  if (platform === "linux" && arch === "arm64") {
    return "linux-arm64";
  }
  if (platform === "linux" && arch === "x64") {
    return "linux-x64";
  }
  return undefined;
}

export function githubMcpReleaseAsset(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): GitHubMcpReleaseAsset | undefined {
  const id = githubMcpPlatformId(platform, arch);
  return GITHUB_MCP_RELEASE_ASSETS.find((entry) => entry.platform === id);
}

export function githubMcpReleaseUrl(asset: string): string {
  return `${GITHUB_MCP_SERVER_UPSTREAM}/releases/download/${GITHUB_MCP_SERVER_TAG}/${asset}`;
}

export function githubMcpPackagedRelativePath(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | undefined {
  const id = githubMcpPlatformId(platform, arch);
  if (!id) {
    return undefined;
  }
  return `github/github-mcp-server/${GITHUB_MCP_SERVER_VERSION}/${id}/${GITHUB_MCP_SERVER_EXECUTABLE}`;
}
