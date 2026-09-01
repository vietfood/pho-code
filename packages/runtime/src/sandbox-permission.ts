import type {
  AuthorizerLog,
  AuthorizerVerdict,
  PermissionQuery,
  PermissionsService,
  PromptPermissionDetails,
} from "@gotgenes/pi-permission-system";
import { isSandboxBashToolName } from "@pho-code/protocol";
import { SANDBOX_PERMISSION_AUTHORIZER_NAME } from "./permission-settings";
import { isSandboxFileToolName, SANDBOX_FILE_TOOL_MISSING_PATH_REASON } from "./sandbox-policy";
import type { AgentSandbox, SandboxFileToolVerdict, SandboxRuntimeSnapshot } from "./sandbox-runtime";

const DELEGATION_EXCLUDED_SURFACES = new Set(["path", "external_directory"]);
const PERMISSIONS_READY_CHANNEL = "permissions:ready";
/**
 * Same process-global slot `getPermissionsService()` reads. Do not import the
 * package at runtime: Electron's bundled main cannot resolve that module, and
 * jiti loads a separate copy anyway. `Symbol.for` is the public cross-isolate contract.
 */
const PERMISSIONS_SERVICE_KEY = Symbol.for("@gotgenes/pi-permission-system:service");

export interface SandboxAskDetails {
  toolName?: string;
  surface?: string | null;
  path?: string;
  value?: string | null;
  accessIntent?: {
    surface: string;
    matchValues?: readonly string[];
    boundaryValue?: string | null;
  } | null;
}

export function shouldSkipSandboxBashAsk(
  snapshot: SandboxRuntimeSnapshot,
  details: SandboxAskDetails,
): boolean {
  if (!snapshot.enabled || snapshot.status !== "healthy") {
    return false;
  }
  if (!isAgentBashAsk(details)) {
    return false;
  }
  const surface = details.accessIntent?.surface ?? details.surface;
  return !(typeof surface === "string" && DELEGATION_EXCLUDED_SURFACES.has(surface));
}

export function isSandboxFileToolAsk(details: SandboxAskDetails): boolean {
  if (isAgentBashAsk(details)) {
    return false;
  }
  if (details.toolName && isSandboxFileToolName(details.toolName)) {
    return true;
  }
  const surface = details.accessIntent?.surface ?? details.surface;
  return typeof surface === "string" && isSandboxFileToolName(surface);
}

export function requestedPathFromSandboxAsk(details: SandboxAskDetails): string | undefined {
  if (typeof details.path === "string" && details.path.trim()) {
    return details.path.trim();
  }
  const boundary = details.accessIntent?.boundaryValue;
  if (typeof boundary === "string" && boundary.trim()) {
    return boundary.trim();
  }
  const matchValues = details.accessIntent?.matchValues;
  if (matchValues) {
    for (const value of matchValues) {
      if (typeof value === "string" && looksLikeFilesystemPath(value)) {
        return value.trim();
      }
    }
  }
  if (typeof details.value === "string" && looksLikeFilesystemPath(details.value)) {
    return details.value.trim();
  }
  return undefined;
}

export function shouldSkipSandboxFileToolAsk(
  snapshot: SandboxRuntimeSnapshot,
  details: SandboxAskDetails,
  evaluation: SandboxFileToolVerdict,
): boolean {
  if (evaluation.action !== "allow") {
    return false;
  }
  if (!snapshot.enabled || snapshot.status !== "healthy") {
    return false;
  }
  if (!isSandboxFileToolAsk(details)) {
    return false;
  }
  const surface = details.accessIntent?.surface ?? details.surface;
  return !(typeof surface === "string" && DELEGATION_EXCLUDED_SURFACES.has(surface));
}

export function shouldDenySandboxFileToolAsk(
  snapshot: SandboxRuntimeSnapshot,
  details: SandboxAskDetails,
  evaluation: SandboxFileToolVerdict,
): boolean {
  if (evaluation.action !== "deny") {
    return false;
  }
  if (!snapshot.enabled || snapshot.status !== "healthy") {
    return false;
  }
  return isSandboxFileToolAsk(details);
}

function createSandboxAuthorizer(sandbox: AgentSandbox) {
  return async function authorizeSandboxAsk(
    details: PromptPermissionDetails,
    _query: PermissionQuery,
    log: AuthorizerLog,
  ): Promise<AuthorizerVerdict> {
    const snapshot = sandbox.snapshot();
    if (shouldSkipSandboxBashAsk(snapshot, details)) {
      log.review("sandbox_skip_bash_ask", {
        toolName: details.toolName ?? null,
        surface: details.surface ?? null,
      });
      return { kind: "allow" };
    }
    if (!snapshot.enabled || snapshot.status !== "healthy") {
      return { kind: "defer" };
    }
    if (!isSandboxFileToolAsk(details)) {
      return { kind: "defer" };
    }
    const requestedPath = requestedPathFromSandboxAsk(details);
    const toolName = fileToolNameFromAsk(details);
    if (!requestedPath) {
      log.review("sandbox_deny_file_tool_ask", {
        toolName: details.toolName ?? null,
        surface: details.surface ?? null,
        reason: SANDBOX_FILE_TOOL_MISSING_PATH_REASON,
      });
      return { kind: "deny", reason: SANDBOX_FILE_TOOL_MISSING_PATH_REASON };
    }
    if (!toolName) {
      return { kind: "defer" };
    }
    const evaluation = await sandbox.evaluateFileTool({
      toolName,
      requestedPath,
    });
    if (shouldSkipSandboxFileToolAsk(snapshot, details, evaluation)) {
      log.review("sandbox_skip_file_tool_ask", {
        toolName: details.toolName ?? null,
        surface: details.surface ?? null,
      });
      return { kind: "allow" };
    }
    if (shouldDenySandboxFileToolAsk(snapshot, details, evaluation) && evaluation.action === "deny") {
      log.review("sandbox_deny_file_tool_ask", {
        toolName: details.toolName ?? null,
        surface: details.surface ?? null,
        reason: evaluation.reason,
      });
      return { kind: "deny", reason: evaluation.reason };
    }
    return { kind: "defer" };
  };
}

export function bindSandboxPermissionAuthorizer(
  events: { on(channel: string, listener: () => void): void },
  sandbox: AgentSandbox,
): void {
  let dispose: (() => void) | undefined;
  const authorize = createSandboxAuthorizer(sandbox);

  const register = () => {
    dispose?.();
    dispose = undefined;
    try {
      dispose = publishedPermissionsService()?.registerAuthorizer(SANDBOX_PERMISSION_AUTHORIZER_NAME, authorize);
    } catch {
      // Duplicate registration is a reload race; the live service already has a link.
    }
  };

  events.on(PERMISSIONS_READY_CHANNEL, register);
  register();
}

function publishedPermissionsService(): PermissionsService | undefined {
  const service = (globalThis as Record<symbol, unknown>)[PERMISSIONS_SERVICE_KEY];
  if (!service || typeof service !== "object") {
    return undefined;
  }
  const registerAuthorizer = (service as { registerAuthorizer?: unknown }).registerAuthorizer;
  if (typeof registerAuthorizer !== "function") {
    return undefined;
  }
  return service as PermissionsService;
}

function isAgentBashAsk(details: SandboxAskDetails): boolean {
  if (details.toolName && isSandboxBashToolName(details.toolName)) {
    return true;
  }
  return details.surface === "bash";
}

function fileToolNameFromAsk(details: SandboxAskDetails): "read" | "write" | "edit" | undefined {
  if (details.toolName && isSandboxFileToolName(details.toolName)) {
    return details.toolName;
  }
  const surface = details.accessIntent?.surface ?? details.surface;
  if (typeof surface === "string" && isSandboxFileToolName(surface)) {
    return surface;
  }
  return undefined;
}

function looksLikeFilesystemPath(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("/") || trimmed.startsWith("~") || trimmed.includes("/");
}
