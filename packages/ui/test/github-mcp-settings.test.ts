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
        onRemovePat: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="github-mcp-settings"');
    expect(markup).toContain(GITHUB_MCP_DISCLOSURE);
    expect(markup).toContain("Enable read-only GitHub tools");
    expect(markup).toContain("Add PAT");
    expect(markup).not.toContain("github_pat_");
    expect(markup).not.toContain('data-testid="github-mcp-token-input"');
    expect(markup).not.toContain("Log out");
    expect(markup).not.toContain("signed in");
  });

  test("offers replace and remove when a PAT is stored", () => {
    const markup = renderToStaticMarkup(
      createElement(GitHubMcpSettingsSection, {
        githubMcp: {
          ...emptyGitHubMcpSettingsSnapshot(),
          account: { patConfigured: true, login: "octocat", authMethod: "pat" },
        },
        busy: false,
        onEnabledChange: () => undefined,
        onImportPat: async () => undefined,
        onRemovePat: () => undefined,
      }),
    );
    expect(markup).toContain("Replace PAT");
    expect(markup).toContain("Remove PAT");
    expect(markup).toContain("@octocat");
    expect(markup).not.toContain("Log out of GitHub");
  });
});
