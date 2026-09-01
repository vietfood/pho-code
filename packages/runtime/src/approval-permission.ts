import type {
  AuthorizerLog,
  AuthorizerVerdict,
  PermissionQuery,
  PermissionsService,
  PromptPermissionDetails,
} from "@gotgenes/pi-permission-system";
import { APPROVAL_PERMISSION_AUTHORIZER_NAME } from "./permission-settings";

const PERMISSIONS_READY_CHANNEL = "permissions:ready";
const PERMISSIONS_SERVICE_KEY = Symbol.for("@gotgenes/pi-permission-system:service");

/**
 * The pinned permission extension loads before Pi inline extensions. This link
 * quiets ordinary asks after explicit/managed migration; the later exact-input approval
 * broker remains authoritative and the package's deterministic denies still
 * return before the authorizer chain.
 */
export function bindApprovalPermissionAuthorizer(events: {
  on(channel: string, listener: () => void): void;
}, enabled: () => boolean = () => true, capture?: (ask: CapturedPermissionAsk) => void): void {
  let dispose: (() => void) | undefined;
  const register = () => {
    dispose?.();
    dispose = undefined;
    try {
      dispose = publishedPermissionsService()?.registerAuthorizer(
        APPROVAL_PERMISSION_AUTHORIZER_NAME,
        async (details, query, log) =>
          enabled() ? authorizePhoOwnedAsk(details, query, log, capture) : { kind: "defer" },
      );
    } catch {
      // A reload can publish/register the same service twice; its live link wins.
    }
  };
  events.on(PERMISSIONS_READY_CHANNEL, register);
  register();
}

export interface CapturedPermissionAsk {
  toolCallId: string;
  requestId: string;
  toolName?: string;
  detail: Readonly<Record<string, unknown>>;
}

export function authorizePhoOwnedAsk(
  details: PromptPermissionDetails,
  _query: PermissionQuery,
  log: AuthorizerLog,
  capture?: (ask: CapturedPermissionAsk) => void,
): AuthorizerVerdict {
  const toolCallId = details.toolCallId?.trim();
  if (details.source !== "tool_call" || details.forwarding !== undefined || !toolCallId) {
    return { kind: "defer" };
  }
  const surface = details.accessIntent?.surface ?? details.surface ?? details.toolName;
  log.review("pho_approval_whole_action_boundary", {
    toolCallId: details.toolCallId ?? null,
    toolName: details.toolName ?? null,
    surface: surface ?? null,
  });
  capture?.({
    toolCallId,
    requestId: details.requestId,
    ...(details.toolName ? { toolName: details.toolName } : {}),
    detail: boundedAskDetail(details, surface),
  });
  return { kind: "allow" };
}

function boundedAskDetail(
  details: PromptPermissionDetails,
  surface: string | null | undefined,
): Readonly<Record<string, unknown>> {
  const bounded = (value: string | null | undefined, max = 8_192) =>
    typeof value === "string" ? value.slice(0, max) : null;
  return {
    requestId: bounded(details.requestId, 256),
    source: details.source,
    toolName: bounded(details.toolName, 256),
    surface: bounded(surface, 256),
    path: bounded(details.path),
    command: bounded(details.command),
    target: bounded(details.target),
    value: bounded(details.value),
    matchValues: (details.accessIntent?.matchValues ?? []).slice(0, 16).map((value) => bounded(value)),
  };
}

function publishedPermissionsService(): PermissionsService | undefined {
  const service = (globalThis as Record<symbol, unknown>)[PERMISSIONS_SERVICE_KEY];
  if (!service || typeof service !== "object") return undefined;
  return typeof (service as { registerAuthorizer?: unknown }).registerAuthorizer === "function"
    ? (service as PermissionsService)
    : undefined;
}
