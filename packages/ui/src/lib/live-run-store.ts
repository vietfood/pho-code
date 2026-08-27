import { useCallback, useSyncExternalStore } from "react";
import { idleRunState, type RunState } from "@pho-code/protocol";

const listeners = new Set<() => void>();
const keyListeners = new Map<string, Set<() => void>>();
const runs = new Map<string, RunState>();
const IDLE_RUN = idleRunState();
let selectedKey: string | undefined;
let current: RunState = IDLE_RUN;
let pending: RunState | null = null;
const pendingKeys = new Set<string>();
let frame = 0;

function commit(): void {
  if (frame !== 0 && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  if (pending !== null) {
    current = pending;
    pending = null;
    for (const listener of listeners) {
      listener();
    }
  }
  if (pendingKeys.size > 0) {
    for (const key of pendingKeys) {
      const set = keyListeners.get(key);
      if (set) {
        for (const listener of set) {
          listener();
        }
      }
    }
    pendingKeys.clear();
  }
}

function schedule(): void {
  if (typeof requestAnimationFrame !== "function") {
    commit();
    return;
  }
  if (frame !== 0) {
    return;
  }
  frame = requestAnimationFrame(() => {
    frame = 0;
    commit();
  });
}

function shouldNotify(key: string | undefined, explicitKey: boolean): boolean {
  if (selectedKey !== undefined) {
    return key === selectedKey;
  }
  return !explicitKey;
}

export function getLiveRun(): RunState {
  return current;
}

export function getLiveRunForKey(key: string): RunState | undefined {
  return runs.get(key);
}

export function subscribeLiveRun(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Per-key subscription so every visible chat tile streams independently. */
export function subscribeLiveRunKey(key: string, listener: () => void): () => void {
  let set = keyListeners.get(key);
  if (!set) {
    set = new Set();
    keyListeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) {
      keyListeners.delete(key);
    }
  };
}

function pokeKey(key: string): void {
  if (keyListeners.has(key)) {
    pendingKeys.add(key);
  }
}

export function replaceLiveRun(
  run: RunState,
  options: { immediate?: boolean; key?: string } = {},
): void {
  const key = options.key ?? selectedKey;
  if (key) {
    runs.set(key, run);
  }
  let dirty = false;
  if (shouldNotify(key, options.key !== undefined)) {
    pending = run;
    dirty = true;
  }
  if (key && keyListeners.has(key)) {
    pendingKeys.add(key);
    dirty = true;
  }
  if (!dirty) {
    return;
  }
  if (options.immediate) {
    commit();
    return;
  }
  schedule();
}

export function selectLiveRunKey(key: string | undefined): void {
  selectedKey = key;
  pending = key ? (runs.get(key) ?? IDLE_RUN) : IDLE_RUN;
  commit();
}

export function dropLiveRun(key: string): void {
  runs.delete(key);
  pokeKey(key);
  if (selectedKey !== key) {
    commit();
    return;
  }
  selectedKey = undefined;
  pending = IDLE_RUN;
  commit();
}

export function resetLiveRunStore(): void {
  selectedKey = undefined;
  runs.clear();
  pending = IDLE_RUN;
  for (const key of keyListeners.keys()) {
    pendingKeys.add(key);
  }
  commit();
}

export function useLiveRun(): RunState {
  return useSyncExternalStore(subscribeLiveRun, getLiveRun, getLiveRun);
}

/** Live run for one session key; falls back to a stable idle snapshot. */
export function useLiveRunForKey(key: string): RunState {
  const subscribe = useCallback(
    (listener: () => void) => subscribeLiveRunKey(key, listener),
    [key],
  );
  const getSnapshot = useCallback(() => runs.get(key) ?? IDLE_RUN, [key]);
  return useSyncExternalStore(subscribe, getSnapshot, () => IDLE_RUN);
}
