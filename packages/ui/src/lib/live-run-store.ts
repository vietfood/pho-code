import { useSyncExternalStore } from "react";
import { idleRunState, type RunState } from "@pho-code/protocol";

const listeners = new Set<() => void>();
const runs = new Map<string, RunState>();
let selectedKey: string | undefined;
let current: RunState = idleRunState();
let pending: RunState | null = null;
let frame = 0;

function commit(): void {
  if (frame !== 0 && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  if (pending === null) {
    return;
  }
  current = pending;
  pending = null;
  for (const listener of listeners) {
    listener();
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

export function replaceLiveRun(
  run: RunState,
  options: { immediate?: boolean; key?: string } = {},
): void {
  const key = options.key ?? selectedKey;
  if (key) {
    runs.set(key, run);
  }
  if (!shouldNotify(key, options.key !== undefined)) {
    return;
  }
  pending = run;
  if (options.immediate) {
    commit();
    return;
  }
  schedule();
}

export function selectLiveRunKey(key: string | undefined): void {
  selectedKey = key;
  pending = key ? (runs.get(key) ?? idleRunState()) : idleRunState();
  commit();
}

export function dropLiveRun(key: string): void {
  runs.delete(key);
  if (selectedKey !== key) {
    return;
  }
  selectedKey = undefined;
  pending = idleRunState();
  commit();
}

export function resetLiveRunStore(): void {
  selectedKey = undefined;
  runs.clear();
  pending = idleRunState();
  commit();
}

export function useLiveRun(): RunState {
  return useSyncExternalStore(subscribeLiveRun, getLiveRun, getLiveRun);
}
