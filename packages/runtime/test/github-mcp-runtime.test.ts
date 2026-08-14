import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  GITHUB_MCP_DISCLOSURE,
  HARNESS_ERROR_CODES,
  isJsonSafeValue,
} from "@pho-code/protocol";
import { FORBIDDEN_GITHUB_MCP_TOOLS, intersectGitHubMcpTools } from "../src/github-mcp-allowlist";
import { createGitHubMcpRuntime, MAX_GITHUB_MCP_RESULT_CHARS } from "../src/github-mcp-runtime";
import { createMemorySecretStore, GITHUB_MCP_SECRET_ACCOUNT, GITHUB_MCP_SECRET_SERVICE } from "../src/secret-store";

const FAKE_SERVER = fileURLToPath(new URL("./fake-github-mcp-stdio.ts", import.meta.url));
const CANARY = "github_pat_canary_secret_value_do_not_leak";

function launchFake(extraArgs: string[] = []) {
  return {
    command: process.execPath,
    args: [FAKE_SERVER, ...extraArgs],
  };
}

describe("GitHub MCP allowlist", () => {
  test("refuses when a write tool is advertised and when a required read tool is missing", () => {
    const forbidden = intersectGitHubMcpTools(["get_me", "create_issue"]);
    expect(forbidden.forbidden).toContain("create_issue");
    expect(FORBIDDEN_GITHUB_MCP_TOOLS.has("create_issue")).toBe(true);

    const missing = intersectGitHubMcpTools(["get_me"]);
    expect(missing.missingRequired.length).toBeGreaterThan(0);
    expect(missing.bound.some((tool) => tool.mcpName === "get_me")).toBe(true);
  });
});

describe("GitHub MCP runtime", () => {
  test("stays disabled by default and does not spawn a process", async () => {
    const github = createGitHubMcpRuntime({
      secretStore: createMemorySecretStore(),
      launch: () => launchFake(),
    });
    const snapshot = github.snapshot();
    expect(snapshot.enabled).toBe(false);
    expect(snapshot.status).toBe("disabled");
    expect(snapshot.disclosure).toBe(GITHUB_MCP_DISCLOSURE);
    expect(github.pid()).toBeUndefined();
    expect(isJsonSafeValue(snapshot)).toBe(true);
    await github.dispose();
  });

  test("reports signed in while disabled when a token is already stored", async () => {
    const github = createGitHubMcpRuntime({
      secretStore: createMemorySecretStore({
        [`${GITHUB_MCP_SECRET_SERVICE}\0${GITHUB_MCP_SECRET_ACCOUNT}`]: CANARY,
      }),
      launch: () => launchFake(),
    });
    const snapshot = await github.startIfEnabled();
    expect(snapshot.enabled).toBe(false);
    expect(snapshot.status).toBe("disabled");
    expect(snapshot.account.signedIn).toBe(true);
    expect(github.pid()).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain(CANARY);
    await github.dispose();
  });

  test("needs auth when enabled without a stored token", async () => {
    const github = createGitHubMcpRuntime({
      secretStore: createMemorySecretStore(),
      enabled: true,
      launch: () => launchFake(),
    });
    const snapshot = await github.startIfEnabled();
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.status).toBe("needs_auth");
    expect(snapshot.account.signedIn).toBe(false);
    expect(github.shouldBindTools()).toBe(false);
    await github.dispose();
  });

  test("connects to a fake stdio server, binds only allowlisted tools, and redacts secrets", async () => {
    const store = createMemorySecretStore({
      [`${GITHUB_MCP_SECRET_SERVICE}\0${GITHUB_MCP_SECRET_ACCOUNT}`]: CANARY,
    });
    const github = createGitHubMcpRuntime({
      secretStore: store,
      enabled: true,
      launch: () => launchFake(),
    });
    const snapshot = await github.startIfEnabled();
    expect(snapshot.status).toBe("ready");
    expect(snapshot.account.login).toBe("octocat");
    expect(snapshot.boundToolCount).toBeGreaterThan(0);
    expect(github.shouldBindTools()).toBe(true);
    expect(github.boundTools().some((tool) => tool.piName === "github_issue_write")).toBe(false);
    expect(github.pid()).toBeGreaterThan(0);

    const result = await github.callTool({
      piName: "github_get_file_contents",
      args: { owner: "octo", repo: "hello" },
    });
    expect(result.text).toContain("untrusted");
    expect(result.details?.readOnly).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain(CANARY);
    expect(JSON.stringify(result)).not.toContain(CANARY);

    const disabled = await github.setEnabled(false);
    expect(disabled.status).toBe("disabled");
    expect(disabled.account.signedIn).toBe(true);
    expect(await store.get(GITHUB_MCP_SECRET_SERVICE, GITHUB_MCP_SECRET_ACCOUNT)).toBe(CANARY);
    expect(github.pid()).toBeUndefined();
    await github.dispose();
  });

  test("refuses readiness when the fake server advertises a write tool", async () => {
    const github = createGitHubMcpRuntime({
      secretStore: createMemorySecretStore({
        [`${GITHUB_MCP_SECRET_SERVICE}\0${GITHUB_MCP_SECRET_ACCOUNT}`]: CANARY,
      }),
      enabled: true,
      launch: () => launchFake(["--write-tool"]),
    });
    const snapshot = await github.startIfEnabled();
    expect(snapshot.status).toBe("failed");
    expect(snapshot.error).toContain("write tool");
    expect(github.shouldBindTools()).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain(CANARY);
    await github.dispose();
  });

  test("logout removes the credential and disabling does not", async () => {
    const store = createMemorySecretStore();
    const github = createGitHubMcpRuntime({
      secretStore: store,
      launch: () => launchFake(),
    });
    const imported = await github.importPat(CANARY);
    expect(imported.account.signedIn).toBe(true);
    expect(await store.get(GITHUB_MCP_SECRET_SERVICE, GITHUB_MCP_SECRET_ACCOUNT)).toBe(CANARY);

    await github.setEnabled(true);
    expect(github.snapshot().status).toBe("ready");
    await github.setEnabled(false);
    expect(await store.get(GITHUB_MCP_SECRET_SERVICE, GITHUB_MCP_SECRET_ACCOUNT)).toBe(CANARY);

    const loggedOut = await github.logout();
    expect(loggedOut.account.signedIn).toBe(false);
    expect(await store.get(GITHUB_MCP_SECRET_SERVICE, GITHUB_MCP_SECRET_ACCOUNT)).toBeUndefined();
    expect(JSON.stringify(loggedOut)).not.toContain(CANARY);
    await github.dispose();
  });

  test("truncates oversized tool output", async () => {
    const github = createGitHubMcpRuntime({
      secretStore: createMemorySecretStore({
        [`${GITHUB_MCP_SECRET_SERVICE}\0${GITHUB_MCP_SECRET_ACCOUNT}`]: CANARY,
      }),
      enabled: true,
      launch: () => launchFake(["--huge"]),
    });
    await github.startIfEnabled();
    const result = await github.callTool({ piName: "github_issue_read", args: { owner: "o", repo: "r" } });
    expect(result.text).toContain("Omitted");
    expect(result.text.length).toBeLessThan(MAX_GITHUB_MCP_RESULT_CHARS + 120);
    await github.dispose();
  });

  test("memory secret store never returns the canary through snapshots", async () => {
    const github = createGitHubMcpRuntime({
      secretStore: createMemorySecretStore(),
    });
    await github.importPat(CANARY);
    expect(JSON.stringify(github.snapshot())).not.toContain(CANARY);
    await expect(github.callTool({ piName: "github_get_me", args: {} })).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.githubMcpFailed,
    });
    await github.dispose();
  });
});
