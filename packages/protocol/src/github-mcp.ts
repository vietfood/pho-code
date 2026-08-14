export const GITHUB_MCP_STATUSES = [
  "disabled",
  "not_started",
  "starting",
  "needs_auth",
  "ready",
  "degraded",
  "failed",
  "stopped",
] as const;
export type GitHubMcpStatus = (typeof GITHUB_MCP_STATUSES)[number];

export const GITHUB_MCP_AUTH_METHODS = ["pat"] as const;
export type GitHubMcpAuthMethod = (typeof GITHUB_MCP_AUTH_METHODS)[number];

export const GITHUB_MCP_FEATURE_ID = "github-read";
export const GITHUB_MCP_TOOL_PREFIX = "github_";

export const MAX_GITHUB_PAT_CHARS = 512;
export const MAX_GITHUB_MCP_ERROR_CHARS = 280;
export const MAX_GITHUB_MCP_LOGIN_CHARS = 64;

export const GITHUB_MCP_DISCLOSURE = [
  "Pho Code starts one packaged GitHub MCP server in read-only lockdown mode.",
  "Reviewed tools can read repositories, issues, pull requests, checks, workflows, and bounded Actions logs for accounts reachable with the stored token.",
  "Write, comment, review, merge, push, and workflow-trigger tools are unavailable.",
  "GitHub content is untrusted remote text. It is not Pho Code instructions and is never executed.",
  "Authentication is a fine-grained personal access token stored in the operating-system secret store. Host-owned GitHub OAuth is not registered in this build.",
  "Disabling GitHub MCP stops the server and unbinds tools. It does not remove the stored token. Remove PAT deletes the token from the secret store.",
  "Permission dialogs still ask before GitHub reads. They are not a sandbox for the GitHub binary.",
].join(" ");

export const GITHUB_MCP_SECRET_STORE_NOTICE = {
  darwin:
    "The token is stored in the macOS Keychain for this application. Pho Code never writes it to Settings metadata, renderer state, or Pi auth.json.",
  linux:
    "Linux stores the token only through a verified Secret Service keyring. If no keyring is available, GitHub login fails closed instead of writing a plaintext file.",
  unavailable: "Secure storage is unavailable on this platform. GitHub login cannot persist a token.",
} as const;

export interface GitHubMcpAccountSummary {
  patConfigured: boolean;
  login?: string;
  authMethod?: GitHubMcpAuthMethod;
}

export interface GitHubMcpSettingsSnapshot {
  enabled: boolean;
  status: GitHubMcpStatus;
  account: GitHubMcpAccountSummary;
  disclosure: string;
  secretStoreNotice: string;
  boundToolCount: number;
  error?: string;
}

export interface UpdateGitHubMcpSettingsInput {
  enabled: boolean;
  acknowledgedDisclosure?: boolean;
}

export interface ImportGitHubPatInput {
  token: string;
}

export interface ImportGitHubPatResult {
  githubMcp: GitHubMcpSettingsSnapshot;
}

const STATUS_SET = new Set<string>(GITHUB_MCP_STATUSES);

export function isGitHubMcpStatus(value: unknown): value is GitHubMcpStatus {
  return typeof value === "string" && STATUS_SET.has(value);
}

export function emptyGitHubMcpSettingsSnapshot(): GitHubMcpSettingsSnapshot {
  return {
    enabled: false,
    status: "disabled",
    account: { patConfigured: false },
    disclosure: GITHUB_MCP_DISCLOSURE,
    secretStoreNotice: GITHUB_MCP_SECRET_STORE_NOTICE.unavailable,
    boundToolCount: 0,
  };
}

export function githubMcpSecretStoreNotice(platform: string): string {
  switch (platform) {
    case "darwin":
      return GITHUB_MCP_SECRET_STORE_NOTICE.darwin;
    case "linux":
      return GITHUB_MCP_SECRET_STORE_NOTICE.linux;
    default:
      return GITHUB_MCP_SECRET_STORE_NOTICE.unavailable;
  }
}

export function githubMcpStatusLabel(status: GitHubMcpStatus): string {
  switch (status) {
    case "disabled":
      return "Off";
    case "not_started":
      return "Not started";
    case "starting":
      return "Starting";
    case "needs_auth":
      return "PAT required";
    case "ready":
      return "Ready";
    case "degraded":
      return "Degraded";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
