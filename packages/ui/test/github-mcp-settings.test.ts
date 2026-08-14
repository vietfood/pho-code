import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyGitHubMcpSettingsSnapshot, GITHUB_MCP_DISCLOSURE } from "@pho-code/protocol";
import { GitHubMcpSettingsSection } from "../src/github-mcp-settings";

describe("GitHub MCP settings", () => {
  test("renders the disclosure, toggle, and no token field by default", () => {
    const markup = renderToStaticMarkup(
      createElement(GitHubMcpSettingsSection, {
        githubMcp: emptyGitHubMcpSettingsSnapshot(),
        busy: false,
        onEnabledChange: () => undefined,
        onImportPat: async () => undefined,
        onLogout: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="github-mcp-settings"');
    expect(markup).toContain(GITHUB_MCP_DISCLOSURE);
    expect(markup).toContain("Enable read-only GitHub tools");
    expect(markup).toContain("Add personal access token");
    expect(markup).not.toContain("github_pat_");
    expect(markup).not.toContain('data-testid="github-mcp-token-input"');
  });
});
