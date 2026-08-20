import {
  HARNESS_ERROR_CODES,
  createHarnessError,
  emptySettingsSnapshot,
  type PiRuntimeStatusSnapshot,
  type RuntimeEvent,
  type SkillSettingsSnapshot,
  type Unsubscribe,
} from "@pho-code/protocol";
import type { HarnessRuntime } from "@pho-code/runtime";

export interface ApplicationRuntimeHost extends HarnessRuntime {
  getStatus(): PiRuntimeStatusSnapshot;
  subscribeStatus(listener: (status: PiRuntimeStatusSnapshot) => void): Unsubscribe;
  attach(runtime: HarnessRuntime): Promise<boolean>;
  fail(error?: unknown): void;
}

const STARTING: PiRuntimeStatusSnapshot = { status: "starting" };
const READY: PiRuntimeStatusSnapshot = { status: "ready" };

function failedStatus(): PiRuntimeStatusSnapshot {
  return {
    status: "failed",
    error: createHarnessError({
      code: HARNESS_ERROR_CODES.runtimeUnavailable,
      message: "The Pi runtime failed to start. Restart Pho Code to try again.",
      operation: "runtimeStartup",
      recoverable: true,
    }),
  };
}

function unavailable(operation: string) {
  return createHarnessError({
    code: HARNESS_ERROR_CODES.runtimeUnavailable,
    message: "The Pi runtime is not connected.",
    operation,
  });
}

/** Owns the one Pi runtime generation for an application lifetime. */
export function createApplicationRuntimeHost(): ApplicationRuntimeHost {
  let runtime: HarnessRuntime | undefined;
  let runtimeUnsubscribe: Unsubscribe | undefined;
  let status: PiRuntimeStatusSnapshot = STARTING;
  let stopped = false;
  let disposeAttempt: Promise<void> | undefined;
  let disposeCount = 0;
  let enabledSkillSources: readonly string[] = [];
  const disposed = new WeakSet<HarnessRuntime>();
  const eventListeners = new Set<(event: RuntimeEvent) => void>();
  const statusListeners = new Set<(next: PiRuntimeStatusSnapshot) => void>();
  const delegates = new Map<string, (...args: unknown[]) => unknown>();

  const emitStatus = () => {
    for (const listener of statusListeners) {
      try {
        listener(status);
      } catch {
        continue;
      }
    }
  };

  const disposeRuntime = (owned: HarnessRuntime): Promise<void> => {
    if (disposed.has(owned)) {
      return Promise.resolve();
    }
    disposed.add(owned);
    disposeCount += 1;
    return owned.dispose();
  };

  const host = {
    get disposeCount() {
      return disposeCount;
    },
    getCapabilities: () => ({ piRuntime: status.status === "ready" }),
    getStatus: () => status,
    subscribeStatus(listener: (next: PiRuntimeStatusSnapshot) => void) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    subscribe(listener: (event: RuntimeEvent) => void) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    getPermissionSettings: () => runtime?.getPermissionSettings() ?? emptySettingsSnapshot().permission,
    getSkillSettings: () => runtime?.getSkillSettings() ?? pendingSkillSettings(),
    getGitHubMcpSettings: () => runtime?.getGitHubMcpSettings() ?? emptySettingsSnapshot().githubMcp,
    getSandboxSettings: () => runtime?.getSandboxSettings() ?? emptySettingsSnapshot().sandbox,
    listSessionActivity: () => runtime?.listSessionActivity() ?? [],
    setEnabledSkillSources(sourceIds: readonly string[]) {
      enabledSkillSources = [...sourceIds];
      return runtime?.setEnabledSkillSources(sourceIds) ?? pendingSkillSettings();
    },
    async attach(next: HarnessRuntime): Promise<boolean> {
      if (next === runtime) {
        return false;
      }
      if (stopped || status.status !== "starting") {
        await disposeRuntime(next);
        return false;
      }

      try {
        next.setEnabledSkillSources(enabledSkillSources);
        runtimeUnsubscribe = next.subscribe((event) => {
          for (const listener of eventListeners) {
            listener(event);
          }
        });
      } catch {
        status = failedStatus();
        emitStatus();
        await disposeRuntime(next);
        return false;
      }

      runtime = next;
      status = READY;
      emitStatus();
      return true;
    },
    fail(_error?: unknown) {
      if (stopped || status.status !== "starting") {
        return;
      }
      status = failedStatus();
      emitStatus();
    },
    dispose(): Promise<void> {
      if (!disposeAttempt) {
        stopped = true;
        runtimeUnsubscribe?.();
        runtimeUnsubscribe = undefined;
        disposeAttempt = runtime ? disposeRuntime(runtime) : Promise.resolve();
      }
      return disposeAttempt;
    },
  };

  function pendingSkillSettings(): SkillSettingsSnapshot {
    const snapshot = emptySettingsSnapshot().skills;
    const enabled = new Set(enabledSkillSources);
    return {
      ...snapshot,
      sources: snapshot.sources.map((source) => ({
        ...source,
        enabled: source.sourceId === "pho-code" || enabled.has(source.sourceId),
      })),
    };
  }

  return new Proxy(host, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }
      if (typeof property !== "string" || property === "then") {
        return undefined;
      }
      let delegate = delegates.get(property);
      if (!delegate) {
        delegate = (...args: unknown[]) => {
          if (!runtime || stopped) {
            throw unavailable(property);
          }
          const method = (runtime as unknown as Record<string, unknown>)[property];
          if (typeof method !== "function") {
            throw unavailable(property);
          }
          return Reflect.apply(method, runtime, args);
        };
        delegates.set(property, delegate);
      }
      return delegate;
    },
  }) as unknown as ApplicationRuntimeHost;
}
