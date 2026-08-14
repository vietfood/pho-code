import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  createHarnessError,
  githubMcpSecretStoreNotice,
  GITHUB_MCP_DISCLOSURE,
  HARNESS_ERROR_CODES,
  MAX_GITHUB_MCP_ERROR_CHARS,
  MAX_GITHUB_MCP_LOGIN_CHARS,
  MAX_GITHUB_PAT_CHARS,
  type GitHubMcpSettingsSnapshot,
  type GitHubMcpStatus,
  type SessionKey,
} from "@pho-code/protocol";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  githubMcpToolByPiName,
  intersectGitHubMcpTools,
  type GitHubMcpAllowlistedTool,
} from "./github-mcp-allowlist";
import {
  GITHUB_MCP_SERVER_ARGS,
  GITHUB_MCP_TOKEN_ENV,
  githubMcpPackagedRelativePath,
} from "./github-mcp-artifact";
import {
  GITHUB_MCP_SECRET_ACCOUNT,
  GITHUB_MCP_SECRET_SERVICE,
  type SecretStore,
} from "./secret-store";

export const MAX_GITHUB_MCP_RESULT_CHARS = 24_000;
export const MAX_GITHUB_MCP_STDERR_CHARS = 2_000;
export const GITHUB_MCP_CALL_TIMEOUT_MS = 30_000;
export const MAX_GITHUB_MCP_CONCURRENT_CALLS = 2;

export interface GitHubMcpLaunchSpec {
  command: string;
  args: readonly string[];
  env?: Record<string, string>;
}

export interface GitHubMcpRuntimeOptions {
  secretStore: SecretStore;
  resourcesRoot?: string;
  serverPath?: string;
  enabled?: boolean;
  accountLogin?: string;
  launch?: (token: string) => GitHubMcpLaunchSpec;
  now?: () => number;
}

export interface GitHubMcpCallInput {
  piName: string;
  args: Record<string, unknown>;
  sessionKey?: SessionKey;
  signal?: AbortSignal;
}

export interface GitHubMcpRuntime {
  snapshot(): GitHubMcpSettingsSnapshot;
  shouldBindTools(): boolean;
  boundTools(): readonly GitHubMcpAllowlistedTool[];
  setEnabled(enabled: boolean): Promise<GitHubMcpSettingsSnapshot>;
  importPat(token: string): Promise<GitHubMcpSettingsSnapshot>;
  logout(): Promise<GitHubMcpSettingsSnapshot>;
  startIfEnabled(): Promise<GitHubMcpSettingsSnapshot>;
  callTool(input: GitHubMcpCallInput): Promise<{ text: string; details?: Record<string, string | number | boolean | null> }>;
  pid(): number | undefined;
  dispose(): Promise<void>;
}

interface ActiveCall {
  id: number;
  abort: AbortController;
}

export function resolveGitHubMcpServerPath(resourcesRoot?: string): string | undefined {
  const relative = githubMcpPackagedRelativePath();
  if (!relative || !resourcesRoot) {
    return undefined;
  }
  const candidate = path.join(resourcesRoot, "features", relative);
  return existsSync(candidate) ? candidate : undefined;
}

export function createGitHubMcpRuntime(options: GitHubMcpRuntimeOptions): GitHubMcpRuntime {
  let enabled = options.enabled === true;
  let status: GitHubMcpStatus = enabled ? "not_started" : "disabled";
  let accountLogin = sanitizeLogin(options.accountLogin);
  let error: string | undefined;
  let bound: GitHubMcpAllowlistedTool[] = [];
  let client: Client | undefined;
  let transport: StdioClientTransport | undefined;
  let startAttempt: Promise<void> | undefined;
  let callId = 0;
  const activeCalls = new Map<number, ActiveCall>();
  const secrets: string[] = [];

  function snapshot(): GitHubMcpSettingsSnapshot {
    const result: GitHubMcpSettingsSnapshot = {
      enabled,
      status: enabled ? status : "disabled",
      account: {
        signedIn: Boolean(accountLogin) || secrets.length > 0,
        ...(accountLogin ? { login: accountLogin, authMethod: "pat" as const } : {}),
        ...(!accountLogin && secrets.length > 0 ? { authMethod: "pat" as const } : {}),
      },
      disclosure: GITHUB_MCP_DISCLOSURE,
      secretStoreNotice: githubMcpSecretStoreNotice(process.platform),
      boundToolCount: enabled && (status === "ready" || status === "degraded") ? bound.length : 0,
    };
    if (error) {
      result.error = error;
    }
    return result;
  }

  async function token(): Promise<string | undefined> {
    const stored = await options.secretStore.get(GITHUB_MCP_SECRET_SERVICE, GITHUB_MCP_SECRET_ACCOUNT);
    if (stored && stored.length > 0 && !secrets.includes(stored)) {
      secrets.push(stored);
    }
    return stored && stored.length > 0 ? stored : undefined;
  }

  async function stop(next: GitHubMcpStatus): Promise<void> {
    for (const call of activeCalls.values()) {
      call.abort.abort();
    }
    activeCalls.clear();
    bound = [];
    const currentClient = client;
    const currentTransport = transport;
    client = undefined;
    transport = undefined;
    startAttempt = undefined;
    try {
      await currentClient?.close();
    } catch {
      // Closing a failed client must not block disable/logout.
    }
    try {
      await currentTransport?.close();
    } catch {
      // Exact-child cleanup is owned by the SDK close path.
    }
    status = enabled ? next : "disabled";
  }

  async function start(): Promise<void> {
    if (!enabled) {
      status = "disabled";
      return;
    }
    if (status === "ready" && client) {
      return;
    }
    if (startAttempt) {
      await startAttempt;
      return;
    }
    startAttempt = (async () => {
      status = "starting";
      error = undefined;
      const credential = await token();
      if (!credential) {
        status = "needs_auth";
        error = "Sign in with a fine-grained GitHub personal access token.";
        return;
      }
      const launch = options.launch
        ? options.launch(credential)
        : defaultLaunch(credential, options.serverPath ?? resolveGitHubMcpServerPath(options.resourcesRoot));
      if (!launch) {
        status = "failed";
        error = "The packaged GitHub MCP server is missing for this architecture.";
        return;
      }
      const nextTransport = new StdioClientTransport({
        command: launch.command,
        args: [...launch.args],
        env: sanitizeLaunchEnv(launch.env, credential),
        stderr: "pipe",
      });
      attachStderr(nextTransport, credential);
      const nextClient = new Client({ name: "pho-code", version: "0.0.0" });
      transport = nextTransport;
      client = nextClient;
      try {
        await nextClient.connect(nextTransport);
        const listed = await nextClient.listTools();
        const discovered = listed.tools.map((tool) => tool.name);
        const intersection = intersectGitHubMcpTools(discovered);
        if (intersection.forbidden.length > 0) {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.githubMcpFailed,
            message: "GitHub MCP refused to start because a write tool was advertised.",
            operation: "githubMcp",
          });
        }
        if (intersection.missingRequired.length > 0) {
          throw createHarnessError({
            code: HARNESS_ERROR_CODES.githubMcpFailed,
            message: "GitHub MCP refused to start because a required read tool was missing.",
            operation: "githubMcp",
          });
        }
        bound = intersection.bound;
        const login = await readAccountLogin(nextClient, credential);
        if (login) {
          accountLogin = login;
        }
        status = "ready";
        error = undefined;
      } catch (caught) {
        bound = [];
        await stop("failed");
        status = "failed";
        error = boundErrorMessage(caught, secrets);
        throw caught;
      }
    })();
    try {
      await startAttempt;
    } finally {
      if (status !== "starting") {
        startAttempt = undefined;
      }
    }
  }

  const runtime: GitHubMcpRuntime = {
    snapshot,
    shouldBindTools() {
      return enabled && (status === "ready" || status === "degraded") && bound.length > 0;
    },
    boundTools() {
      return runtime.shouldBindTools() ? bound : [];
    },
    async setEnabled(nextEnabled) {
      if (enabled === nextEnabled) {
        return snapshot();
      }
      enabled = nextEnabled;
      if (!nextEnabled) {
        await stop("stopped");
        status = "disabled";
        error = undefined;
        return snapshot();
      }
      status = "not_started";
      await start().catch(() => undefined);
      return snapshot();
    },
    async importPat(raw) {
      const next = raw.trim();
      if (next.length === 0 || next.length > MAX_GITHUB_PAT_CHARS) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.invalidCommand,
          message: "A GitHub personal access token is required.",
          operation: "importGitHubPat",
          recoverable: true,
        });
      }
      await options.secretStore.set(GITHUB_MCP_SECRET_SERVICE, GITHUB_MCP_SECRET_ACCOUNT, next);
      secrets.length = 0;
      secrets.push(next);
      if (enabled) {
        await stop("not_started");
        await start().catch(() => undefined);
      } else {
        error = undefined;
      }
      return snapshot();
    },
    async logout() {
      await options.secretStore.delete(GITHUB_MCP_SECRET_SERVICE, GITHUB_MCP_SECRET_ACCOUNT);
      secrets.length = 0;
      accountLogin = undefined;
      if (enabled) {
        await stop("needs_auth");
        status = "needs_auth";
        error = "Sign in with a fine-grained GitHub personal access token.";
      } else {
        error = undefined;
      }
      return snapshot();
    },
    async startIfEnabled() {
      if (enabled) {
        await start().catch(() => undefined);
      } else {
        await token();
      }
      return snapshot();
    },
    async callTool(input) {
      if (!enabled) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.githubMcpFailed,
          message: "GitHub MCP is off.",
          operation: "githubMcp",
          recoverable: true,
        });
      }
      if (status === "needs_auth") {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.githubMcpAuthRequired,
          message: "Sign in to GitHub before using GitHub tools.",
          operation: "githubMcp",
          recoverable: true,
        });
      }
      if (!client || (status !== "ready" && status !== "degraded")) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.githubMcpFailed,
          message: error ?? "GitHub MCP is not ready.",
          operation: "githubMcp",
          recoverable: true,
        });
      }
      const tool = githubMcpToolByPiName(input.piName);
      if (!tool || !bound.some((entry) => entry.piName === input.piName)) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.githubMcpFailed,
          message: "That GitHub tool is not available.",
          operation: "githubMcp",
          recoverable: true,
        });
      }
      if (activeCalls.size >= MAX_GITHUB_MCP_CONCURRENT_CALLS) {
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.githubMcpFailed,
          message: "Too many GitHub reads are already in progress.",
          operation: "githubMcp",
          recoverable: true,
        });
      }
      const id = (callId += 1);
      const abort = new AbortController();
      const onAbort = () => abort.abort();
      input.signal?.addEventListener("abort", onAbort, { once: true });
      activeCalls.set(id, { id, abort });
      try {
        const result = await client.callTool(
          { name: tool.mcpName, arguments: sanitizeToolArgs(input.args) },
          undefined,
          { signal: abort.signal, timeout: GITHUB_MCP_CALL_TIMEOUT_MS },
        );
        const text = boundToolText(result, secrets);
        return {
          text,
          details: {
            owner: stringArg(input.args.owner),
            repo: stringArg(input.args.repo),
            tool: tool.piName,
            readOnly: true,
          },
        };
      } catch (caught) {
        if (abort.signal.aborted || input.signal?.aborted) {
          throw new Error("Operation aborted");
        }
        status = "degraded";
        error = boundErrorMessage(caught, secrets);
        throw createHarnessError({
          code: HARNESS_ERROR_CODES.githubMcpFailed,
          message: error,
          operation: "githubMcp",
          recoverable: true,
        });
      } finally {
        input.signal?.removeEventListener("abort", onAbort);
        activeCalls.delete(id);
      }
    },
    pid() {
      return transport?.pid ?? undefined;
    },
    async dispose() {
      enabled = false;
      await stop("stopped");
    },
  };

  return runtime;
}

function defaultLaunch(token: string, command?: string): GitHubMcpLaunchSpec | undefined {
  if (!command) {
    return undefined;
  }
  return {
    command,
    args: GITHUB_MCP_SERVER_ARGS,
    env: { [GITHUB_MCP_TOKEN_ENV]: token },
  };
}

function sanitizeLaunchEnv(extra: Record<string, string> | undefined, token: string): Record<string, string> {
  const env = { ...getDefaultEnvironment(), ...extra };
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  env[GITHUB_MCP_TOKEN_ENV] = token;
  return env;
}

function attachStderr(nextTransport: StdioClientTransport, token: string): void {
  const stream = nextTransport.stderr;
  if (!stream) {
    return;
  }
  let buffer = "";
  stream.on("data", (chunk: Buffer | string) => {
    buffer = redactSecrets(`${buffer}${String(chunk)}`, [token]).slice(-MAX_GITHUB_MCP_STDERR_CHARS);
  });
}

async function readAccountLogin(client: Client, token: string): Promise<string | undefined> {
  try {
    const result = await client.callTool({ name: "get_me", arguments: {} }, undefined, {
      timeout: GITHUB_MCP_CALL_TIMEOUT_MS,
    });
    const text = boundToolText(result, [token]);
    const parsed = JSON.parse(text) as { login?: unknown };
    return sanitizeLogin(parsed.login);
  } catch {
    return undefined;
  }
}

function sanitizeLogin(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const login = value.trim();
  if (login.length === 0 || login.length > MAX_GITHUB_MCP_LOGIN_CHARS) {
    return undefined;
  }
  if (/^(github_pat_|ghp_|gho_|ghu_|ghs_|ghr_)/u.test(login)) {
    return undefined;
  }
  return login;
}

function sanitizeToolArgs(args: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(args)) as Record<string, unknown>;
}

function boundToolText(result: unknown, secrets: readonly string[]): string {
  const content =
    result && typeof result === "object" && "content" in result && Array.isArray(result.content)
      ? result.content
      : [];
  const parts = content.flatMap((part) => {
    if (
      part &&
      typeof part === "object" &&
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
    ) {
      return [part.text];
    }
    return [];
  });
  const raw = redactSecrets(parts.join("\n"), secrets);
  if (raw.length <= MAX_GITHUB_MCP_RESULT_CHARS) {
    return raw.length > 0 ? raw : "GitHub returned no text.";
  }
  const omitted = raw.length - MAX_GITHUB_MCP_RESULT_CHARS;
  return `${raw.slice(0, MAX_GITHUB_MCP_RESULT_CHARS)}\n\n[Omitted ${omitted} characters. Request another page or a narrower query.]`;
}

function boundErrorMessage(error: unknown, secrets: readonly string[]): string {
  const message =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : "GitHub MCP failed.";
  return redactSecrets(message, secrets).slice(0, MAX_GITHUB_MCP_ERROR_CHARS);
}

function redactSecrets(value: string, secrets: readonly string[]): string {
  let redacted = value;
  for (const secret of secrets) {
    if (secret.length > 0) {
      redacted = redacted.split(secret).join("[redacted]");
    }
  }
  return redacted.replaceAll(/(github_pat_|ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]+/gu, "[redacted]");
}

function stringArg(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
