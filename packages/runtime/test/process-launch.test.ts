import { expect, test } from "bun:test";
import { runArgvCommand } from "../src/process-launch";

test("process cancellation waits until the child has actually exited", async () => {
  const controller = new AbortController();
  const startedAt = Date.now();
  const running = runArgvCommand({
    executable: process.execPath,
    args: ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
    signal: controller.signal,
    timeoutMs: 2_000,
    terminationGraceMs: 40,
  });

  setTimeout(() => controller.abort(), 40);
  const result = await running;

  expect(result.failure).toBe("aborted");
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(70);
});
