import { PROTOCOL_VERSION, assertJsonSafe, type RuntimeEvent } from "@pho-code/protocol";

/** Callers supply the event; the emitter owns the envelope fields it stamps. */
export type RuntimeEventDraft = Omit<RuntimeEvent, "protocolVersion" | "sequence" | "occurredAt">;

export interface RuntimeEventEmitter {
  emit(event: RuntimeEventDraft): void;
  subscribe(listener: (event: RuntimeEvent) => void): () => void;
  /** Drop every listener; used once during runtime disposal. */
  clear(): void;
}

/**
 * Owns the runtime's listener set and monotonic sequence counter.
 *
 * Extracted from `createPhoCodeRuntime` so the sequence can only advance through
 * `emit` — nothing else in the runtime can observe or reset it.
 */
export function createRuntimeEventEmitter(): RuntimeEventEmitter {
  const listeners = new Set<(event: RuntimeEvent) => void>();
  let sequence = 0;

  return {
    emit(event) {
      sequence += 1;
      const envelope = {
        ...event,
        protocolVersion: PROTOCOL_VERSION,
        sequence,
        occurredAt: new Date().toISOString(),
      } as RuntimeEvent;
      assertJsonSafe(envelope, "runtimeEvent");
      // Copy first: a listener may unsubscribe while this loop runs.
      for (const listener of [...listeners]) {
        try {
          listener(envelope);
        } catch (error) {
          console.error("Runtime event listener failed:", error);
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      listeners.clear();
    },
  };
}
