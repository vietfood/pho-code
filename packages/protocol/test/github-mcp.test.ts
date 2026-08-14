import { describe, expect, test } from "bun:test";
import {
  emptyGitHubMcpSettingsSnapshot,
  emptySettingsSnapshot,
  GITHUB_MCP_DISCLOSURE,
  githubMcpStatusLabel,
  isGitHubMcpStatus,
  isJsonSafeValue,
  jsonRoundTrip,
} from "../src/index";

describe("GitHub MCP protocol", () => {
  test("empty snapshot is JSON-safe and contains no token-shaped fields", () => {
    const snapshot = emptyGitHubMcpSettingsSnapshot();
    expect(snapshot.enabled).toBe(false);
    expect(snapshot.status).toBe("disabled");
    expect(snapshot.account.patConfigured).toBe(false);
    expect(snapshot.disclosure).toBe(GITHUB_MCP_DISCLOSURE);
    expect(snapshot.boundToolCount).toBe(0);
    expect(isJsonSafeValue(snapshot)).toBe(true);
    expect(jsonRoundTrip(snapshot)).toEqual(snapshot);
    expect(JSON.stringify(snapshot)).not.toMatch(/github_pat_|ghp_|gho_|ghu_|ghs_|ghr_/);
  });

  test("settings snapshot includes GitHub MCP without secrets", () => {
    const snapshot = emptySettingsSnapshot();
    expect(snapshot.githubMcp.status).toBe("disabled");
    expect(isJsonSafeValue(snapshot)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/github_pat_|ghp_/);
  });

  test("accepts only known statuses", () => {
    expect(isGitHubMcpStatus("ready")).toBe(true);
    expect(isGitHubMcpStatus("needs_auth")).toBe(true);
    expect(isGitHubMcpStatus("connected")).toBe(false);
    expect(githubMcpStatusLabel("needs_auth")).toBe("PAT required");
  });
});
