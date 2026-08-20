import {
  createSessionRegistry as createAgentSessionRegistry,
  type AgentScopeKey,
  type SessionRegistry as AgentSessionRegistry,
} from "@pho-agent/runtime/session-registry";
import type { SessionKey } from "@pho-code/protocol";

export {
  MAX_CONCURRENT_ACTIVE_RUNS,
  MAX_RESIDENT_SESSION_CONTROLLERS,
} from "@pho-agent/runtime/session-registry";

export interface SessionRegistryHost<C> {
  openController(key: SessionKey): Promise<C>;
  createController(workspaceId: string): Promise<C>;
  keyOf(controller: C): SessionKey;
  isProtected(controller: C): boolean;
  lastSelectedAt(controller: C): number;
  markSelected(controller: C, at: number): void;
  hasActiveRun(controller: C): boolean;
  dispose(controller: C, reason: "evicted" | "removed" | "shutdown"): Promise<void>;
}

export interface SessionRegistry<C> {
  open(key: SessionKey): Promise<C>;
  create(workspaceId: string): Promise<C>;
  select(key: SessionKey, at?: number): C;
  get(key: SessionKey): C | undefined;
  list(): C[];
  activeRunCount(): number;
  assertCanAdmitRun(operation: string): void;
  runLocked<T>(key: SessionKey, operation: () => Promise<T>): Promise<T>;
  evictUnprotected(except?: SessionKey): Promise<void>;
  remove(key: SessionKey): Promise<C | undefined>;
  disposeAll(): Promise<void>;
}

function toAgentKey(key: SessionKey): AgentScopeKey {
  return { scopeId: key.workspaceId, sessionId: key.sessionId };
}

function toCodeKey(key: AgentScopeKey): SessionKey {
  return { workspaceId: key.scopeId, sessionId: key.sessionId };
}

export function createSessionRegistry<C>(host: SessionRegistryHost<C>): SessionRegistry<C> {
  const registry: AgentSessionRegistry<C> = createAgentSessionRegistry({
    openController: (key) => host.openController(toCodeKey(key)),
    createController: (scopeId) => host.createController(scopeId),
    keyOf: (controller) => toAgentKey(host.keyOf(controller)),
    isProtected: (controller) => host.isProtected(controller),
    lastSelectedAt: (controller) => host.lastSelectedAt(controller),
    markSelected: (controller, at) => host.markSelected(controller, at),
    hasActiveRun: (controller) => host.hasActiveRun(controller),
    dispose: (controller, reason) => host.dispose(controller, reason),
  });
  return {
    open: (key) => registry.open(toAgentKey(key)),
    create: (workspaceId) => registry.create(workspaceId),
    select: (key, at) => registry.select(toAgentKey(key), at),
    get: (key) => registry.get(toAgentKey(key)),
    list: () => registry.list(),
    activeRunCount: () => registry.activeRunCount(),
    assertCanAdmitRun: (operation) => registry.assertCanAdmitRun(operation),
    runLocked: (key, operation) => registry.runLocked(toAgentKey(key), operation),
    evictUnprotected: (except) => registry.evictUnprotected(except ? toAgentKey(except) : undefined),
    remove: (key) => registry.remove(toAgentKey(key)),
    disposeAll: () => registry.disposeAll(),
  };
}
