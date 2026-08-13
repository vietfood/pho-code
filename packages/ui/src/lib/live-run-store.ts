import { useSyncExternalStore } from "react";
import { idleRunState, type RunState } from "@pho-code/protocol";

const listeners = new Set<() => void>();
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

export function getLiveRun(): RunState {
  return current;
}

export function subscribeLiveRun(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function replaceLiveRun(run: RunState, options: { immediate?: boolean } = {}): void {
  pending = run;
  if (options.immediate) {
    commit();
    return;
  }
  schedule();
}

export function resetLiveRunStore(): void {
  pending = idleRunState();
  commit();
}

export function useLiveRun(): RunState {
  return useSyncExternalStore(subscribeLiveRun, getLiveRun, getLiveRun);
}
