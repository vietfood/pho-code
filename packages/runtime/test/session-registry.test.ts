import { describe, expect, test } from "bun:test";
import { HARNESS_ERROR_CODES, sessionKeyId, type SessionKey } from "@pho-code/protocol";
import {
  MAX_CONCURRENT_ACTIVE_RUNS,
  MAX_RESIDENT_SESSION_CONTROLLERS,
  createSessionRegistry,
} from "../src/session-registry";

interface FakeController {
  key: SessionKey;
  selectedAt: number;
  running: boolean;
  attention: boolean;
  disposed: boolean;
  reason?: "evicted" | "removed" | "shutdown";
}

function key(workspaceId: string, sessionId: string): SessionKey {
  return { workspaceId, sessionId };
}

function createFakeRegistry() {
  const created: FakeController[] = [];
  let opens = 0;
  const registry = createSessionRegistry<FakeController>({
    async openController(sessionKey) {
      opens += 1;
      await Promise.resolve();
      const controller: FakeController = {
        key: sessionKey,
        selectedAt: 0,
        running: false,
        attention: false,
        disposed: false,
      };
      created.push(controller);
      return controller;
    },
    async createController(workspaceId) {
      const controller: FakeController = {
        key: key(workspaceId, `new-${created.length + 1}`),
        selectedAt: Date.now(),
        running: false,
        attention: false,
        disposed: false,
      };
      created.push(controller);
      return controller;
    },
    keyOf(controller) {
      return controller.key;
    },
    isProtected(controller) {
      return controller.running || controller.attention;
    },
    lastSelectedAt(controller) {
      return controller.selectedAt;
    },
    markSelected(controller, at) {
      controller.selectedAt = at;
    },
    hasActiveRun(controller) {
      return controller.running;
    },
    async dispose(controller, reason) {
      controller.disposed = true;
      controller.reason = reason;
    },
  });
  return { registry, created, openCount: () => opens };
}

describe("session registry", () => {
  test("deduplicates concurrent opens of the same key into one controller", async () => {
    const { registry, openCount } = createFakeRegistry();
    const target = key("/tmp/a", "s1");
    const [first, second] = await Promise.all([registry.open(target), registry.open(target)]);
    expect(first).toBe(second);
    expect(openCount()).toBe(1);
    expect(registry.get(target)).toBe(first);
  });

  test("evicts the least-recently-selected idle controller at the resident limit", async () => {
    const { registry } = createFakeRegistry();
    const opened = [];
    for (let index = 0; index < MAX_RESIDENT_SESSION_CONTROLLERS; index += 1) {
      const controller = await registry.open(key("/tmp/a", `s${index}`));
      registry.select(controller.key, index + 1);
      opened.push(controller);
    }
    const extra = await registry.open(key("/tmp/a", "s-extra"));
    expect(opened[0]?.disposed).toBe(true);
    expect(opened[0]?.reason).toBe("evicted");
    expect(registry.get(opened[0]!.key)).toBeUndefined();
    expect(registry.get(extra.key)).toBe(extra);
    expect(registry.list()).toHaveLength(MAX_RESIDENT_SESSION_CONTROLLERS);
  });

  test("never evicts running or attention controllers and fails closed when all are protected", async () => {
    const { registry } = createFakeRegistry();
    for (let index = 0; index < MAX_RESIDENT_SESSION_CONTROLLERS; index += 1) {
      const controller = await registry.open(key("/tmp/a", `s${index}`));
      controller.running = index % 2 === 0;
      controller.attention = index % 2 === 1;
    }
    await expect(registry.open(key("/tmp/a", "overflow"))).rejects.toMatchObject({
      code: HARNESS_ERROR_CODES.sessionConcurrencyLimit,
      recoverable: true,
    });
    expect(registry.list()).toHaveLength(MAX_RESIDENT_SESSION_CONTROLLERS);
    expect(registry.list().every((controller) => !controller.disposed)).toBe(true);
  });

  test("refuses a fifth concurrent run before admission", async () => {
    const { registry } = createFakeRegistry();
    for (let index = 0; index < MAX_CONCURRENT_ACTIVE_RUNS; index += 1) {
      const controller = await registry.open(key("/tmp/a", `run-${index}`));
      controller.running = true;
    }
    expect(() => registry.assertCanAdmitRun("sendPrompt")).toThrow(/At most 4 chats can run at once/);
  });

  test("serializes per-key lifecycle operations and allows unrelated keys to proceed", async () => {
    const { registry } = createFakeRegistry();
    const left = key("/tmp/a", "s1");
    const right = key("/tmp/b", "s1");
    const order: string[] = [];
    let releaseLeft: () => void = () => undefined;
    const leftGate = new Promise<void>((resolve) => {
      releaseLeft = resolve;
    });
    const leftOp = registry.runLocked(left, async () => {
      order.push("left-start");
      await leftGate;
      order.push("left-end");
      return sessionKeyId(left);
    });
    const rightOp = registry.runLocked(right, async () => {
      order.push("right");
      return sessionKeyId(right);
    });
    await rightOp;
    expect(order).toEqual(["left-start", "right"]);
    const secondLeft = registry.runLocked(left, async () => {
      order.push("left-second");
      return "second";
    });
    releaseLeft();
    await leftOp;
    await secondLeft;
    expect(order).toEqual(["left-start", "right", "left-end", "left-second"]);
  });

  test("evicts idle controllers while leaving protected ones resident", async () => {
    const { registry } = createFakeRegistry();
    const idle = await registry.open(key("/tmp/a", "idle"));
    const running = await registry.open(key("/tmp/a", "run"));
    const keep = await registry.open(key("/tmp/b", "keep"));
    running.running = true;
    await registry.evictUnprotected(keep.key);
    expect(idle.disposed).toBe(true);
    expect(idle.reason).toBe("evicted");
    expect(running.disposed).toBe(false);
    expect(keep.disposed).toBe(false);
    expect(registry.get(idle.key)).toBeUndefined();
    expect(registry.get(running.key)).toBe(running);
    expect(registry.get(keep.key)).toBe(keep);
  });

  test("disposeAll shuts down every controller concurrently without leaving residents", async () => {
    const { registry } = createFakeRegistry();
    await registry.open(key("/tmp/a", "s1"));
    await registry.open(key("/tmp/b", "s2"));
    await registry.disposeAll();
    expect(registry.list()).toEqual([]);
    expect(registry.get(key("/tmp/a", "s1"))).toBeUndefined();
  });
});
