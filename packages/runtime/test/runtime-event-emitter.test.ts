import { describe, expect, test } from "bun:test";
import { PROTOCOL_VERSION, RUNTIME_EVENT_TYPES, type RuntimeEvent } from "@pho-code/protocol";
import { createRuntimeEventEmitter } from "../src/runtime-event-emitter";

const activity = { type: RUNTIME_EVENT_TYPES.sessionActivity, payload: [] } as const;

describe("runtime event emitter", () => {
  test("stamps protocol version, a monotonic sequence, and an ISO timestamp", () => {
    const emitter = createRuntimeEventEmitter();
    const seen: RuntimeEvent[] = [];
    emitter.subscribe((event) => seen.push(event));

    emitter.emit(activity);
    emitter.emit(activity);

    expect(seen).toHaveLength(2);
    expect(seen[0]?.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(seen[0]?.sequence).toBe(1);
    expect(seen[1]?.sequence).toBe(2);
    expect(Number.isNaN(Date.parse(seen[1]?.occurredAt ?? ""))).toBe(false);
  });

  test("sequence keeps advancing with no listeners attached", () => {
    const emitter = createRuntimeEventEmitter();
    emitter.emit(activity);
    const seen: RuntimeEvent[] = [];
    emitter.subscribe((event) => seen.push(event));
    emitter.emit(activity);
    expect(seen[0]?.sequence).toBe(2);
  });

  test("unsubscribe stops delivery without disturbing other listeners", () => {
    const emitter = createRuntimeEventEmitter();
    const kept: number[] = [];
    const dropped: number[] = [];
    const unsubscribe = emitter.subscribe((event) => dropped.push(event.sequence));
    emitter.subscribe((event) => kept.push(event.sequence));

    emitter.emit(activity);
    unsubscribe();
    emitter.emit(activity);

    expect(dropped).toEqual([1]);
    expect(kept).toEqual([1, 2]);
  });

  test("a throwing listener does not stop the others or the sequence", () => {
    const emitter = createRuntimeEventEmitter();
    const seen: number[] = [];
    emitter.subscribe(() => {
      throw new Error("listener boom");
    });
    emitter.subscribe((event) => seen.push(event.sequence));

    expect(() => emitter.emit(activity)).not.toThrow();
    expect(() => emitter.emit(activity)).not.toThrow();
    expect(seen).toEqual([1, 2]);
  });

  test("unsubscribing during delivery still reaches listeners added before the emit", () => {
    const emitter = createRuntimeEventEmitter();
    const seen: string[] = [];
    const unsubscribe = emitter.subscribe(() => {
      seen.push("first");
      unsubscribe();
    });
    emitter.subscribe(() => seen.push("second"));

    emitter.emit(activity);
    expect(seen).toEqual(["first", "second"]);
  });

  test("clear drops every listener", () => {
    const emitter = createRuntimeEventEmitter();
    const seen: number[] = [];
    emitter.subscribe((event) => seen.push(event.sequence));
    emitter.emit(activity);
    emitter.clear();
    emitter.emit(activity);
    expect(seen).toEqual([1]);
  });

  test("refuses an event that is not JSON-safe", () => {
    const emitter = createRuntimeEventEmitter();
    expect(() =>
      emitter.emit({
        type: RUNTIME_EVENT_TYPES.sessionActivity,
        payload: [{ nested: () => undefined }],
      } as unknown as Parameters<typeof emitter.emit>[0]),
    ).toThrow();
  });
});
