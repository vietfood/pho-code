import {
  type ApprovalBroker,
  type ApprovalToolIdentity,
  type ApprovalToolDisposition,
} from "@pho-agent/runtime/approval-feature";
import { fingerprintApprovalInput } from "@pho-agent/runtime/approval-controller";
import type { InlineExtension } from "@pho-agent/runtime/feature-api";
import {
  bindApprovalPermissionAuthorizer,
  type CapturedPermissionAsk,
} from "./approval-permission";
import type { HarnessFeature } from "./features";
import type { SandboxAuthorizationLookup } from "./sandbox-feature";

export const PHO_APPROVAL_FEATURE_ID = "pho-code-approval-modes";
export const PHO_APPROVAL_FEATURE_VERSION = "0.1.0";
const PERMISSION_ASK_TTL_MS = 30_000;
const MAX_PENDING_TOOL_CALLS = 256;
const MAX_ASKS_PER_TOOL_CALL = 16;

export interface PhoApprovalSessionBinding {
  broker: ApprovalBroker;
  runIdentity(): ApprovalToolIdentity;
}

export function createApprovalSessionBindings() {
  const sessions = new Map<string, PhoApprovalSessionBinding>();
  const key = (cwd: string, sessionId: string) => `${cwd}\0${sessionId}`;
  return {
    register(cwd: string, sessionId: string, binding: PhoApprovalSessionBinding): () => void {
      const id = key(cwd, sessionId);
      sessions.set(id, binding);
      return () => {
        if (sessions.get(id) === binding) sessions.delete(id);
      };
    },
    get(cwd: string, sessionId: string): PhoApprovalSessionBinding | undefined {
      return sessions.get(key(cwd, sessionId));
    },
  };
}

export type ApprovalSessionBindings = ReturnType<typeof createApprovalSessionBindings>;

export function createPhoApprovalFeature(
  bindings: ApprovalSessionBindings,
  options: { delegatePermissionAsks?: () => boolean } = {},
): HarnessFeature {
  return {
    id: PHO_APPROVAL_FEATURE_ID,
    version: PHO_APPROVAL_FEATURE_VERSION,
    extensionFactories: [createMultiplexedApprovalExtension(bindings, options)],
    expected: { extensions: 1 },
  };
}

export function createApprovalSandboxLookup(bindings: ApprovalSessionBindings): SandboxAuthorizationLookup {
  return {
    disposition(input) {
      const disposition = bindings.get(input.cwd, input.sessionId)?.broker.dispositionFor(input.toolCallId);
      return sandboxDisposition(disposition);
    },
  };
}

function createMultiplexedApprovalExtension(
  bindings: ApprovalSessionBindings,
  options: { delegatePermissionAsks?: () => boolean },
): InlineExtension {
  return {
    name: PHO_APPROVAL_FEATURE_ID,
    factory(pi) {
      const permissionAsks = createPermissionAskBuffer();
      bindApprovalPermissionAuthorizer(
        pi.events,
        options.delegatePermissionAsks,
        (ask) => permissionAsks.capture(ask),
      );
      pi.on("tool_call", async (event, ctx) => {
        const sessionId = ctx.sessionManager.getSessionId();
        const binding = bindings.get(ctx.cwd, sessionId);
        if (!binding) {
          return { block: true, reason: "Approval state is unavailable for this chat." };
        }
        const identity = binding.runIdentity();
        for (const ask of permissionAsks.drain(event.toolCallId, event.toolName)) {
          binding.broker.capture({
            toolCallId: event.toolCallId,
            detail: ask.detail,
            requestId: ask.requestId,
            ...(ask.toolName ? { toolName: ask.toolName } : {}),
          });
        }
        const disposition = await binding.broker.authorizeToolCall({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.input,
          cwd: ctx.cwd,
          ...identity,
          grantKey: identity.grantKey ?? `${event.toolName}:${fingerprintApprovalInput({ cwd: ctx.cwd, input: event.input })}`,
          ...(identity.signal ?? ctx.signal ? { signal: identity.signal ?? ctx.signal } : {}),
        });
        if (disposition.authorized) return undefined;
        return {
          block: true,
          reason: disposition.rationale ?? refusalReason(disposition.outcome),
          terminate: disposition.outcome === "circuit-open",
        };
      });
      pi.on("tool_result", (event, ctx) => {
        bindings.get(ctx.cwd, ctx.sessionManager.getSessionId())?.broker.clear(event.toolCallId);
      });
      pi.on("session_shutdown", (_event, ctx) => {
        permissionAsks.clear();
        bindings.get(ctx.cwd, ctx.sessionManager.getSessionId())?.broker.clearAll();
      });
    },
  };
}

function createPermissionAskBuffer(now: () => number = Date.now) {
  const pending = new Map<string, { capturedAt: number; asks: CapturedPermissionAsk[]; collision: boolean }>();
  const purge = () => {
    const cutoff = now() - PERMISSION_ASK_TTL_MS;
    for (const [toolCallId, entry] of pending) {
      if (entry.capturedAt < cutoff) pending.delete(toolCallId);
    }
  };
  return {
    capture(ask: CapturedPermissionAsk): void {
      purge();
      const existing = pending.get(ask.toolCallId);
      if (existing) {
        existing.collision ||= existing.asks.some(
          (candidate) => candidate.toolName !== undefined && candidate.toolName !== ask.toolName,
        );
        if (existing.asks.length < MAX_ASKS_PER_TOOL_CALL) existing.asks.push(ask);
        else existing.collision = true;
        return;
      }
      if (pending.size >= MAX_PENDING_TOOL_CALLS) {
        const oldest = pending.keys().next().value as string | undefined;
        if (oldest) pending.delete(oldest);
      }
      pending.set(ask.toolCallId, { capturedAt: now(), asks: [ask], collision: false });
    },
    drain(toolCallId: string, toolName: string): CapturedPermissionAsk[] {
      purge();
      const entry = pending.get(toolCallId);
      pending.delete(toolCallId);
      if (!entry) return [];
      const mismatch = entry.asks.some(
        (ask) => ask.toolName !== undefined && ask.toolName !== toolName,
      );
      if (entry.collision || mismatch) {
        return [{
          toolCallId,
          requestId: `collision:${toolCallId}`,
          toolName,
          detail: {
            collision: true,
            rationale: "Permission ask identity collided; owner review is required.",
          },
        }];
      }
      return entry.asks;
    },
    clear(): void {
      pending.clear();
    },
  };
}

function sandboxDisposition(disposition: ApprovalToolDisposition | undefined): "contained" | "elevated" | "full" {
  if (!disposition?.authorized) return "contained";
  if (disposition.mode === "full") return "full";
  return disposition.source === "policy" ? "contained" : "elevated";
}

function refusalReason(outcome: string): string {
  const reasons: Record<string, string> = {
    deny: "Approval policy denied this tool call.",
    "require-owner": "This tool call requires an owner decision.",
    unavailable: "Approval review is unavailable.",
    cancelled: "Approval review was cancelled.",
    stale: "Approval no longer matches this tool call.",
    "circuit-open": "Automatic approval stopped after repeated denials.",
  };
  return reasons[outcome] ?? "Approval denied this tool call.";
}
