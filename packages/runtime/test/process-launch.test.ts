import { mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "bun:test";
import { runArgvCommand } from "../src/process-launch";

const TERMINATION_GRACE_MS = 40;
const READY_POLL_MS = 5;
const READY_DEADLINE_MS = 20_000;

// The child must announce readiness rather than be aborted on a fixed delay.
// Interpreter startup takes tens of milliseconds when idle and hundreds under
// load, so a timed abort can deliver SIGTERM before the handler below exists —
// the default disposition then kills the child immediately and the grace window
// this test exists to prove never runs.
async function waitUntilChildIgnoresSigterm(marker: string): Promise<void> {
  const deadline = Date.now() + READY_DEADLINE_MS;
  while (!existsSync(marker)) {
    if (Date.now() > deadline) {
      throw new Error(`child never reported readiness at ${marker}`);
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }
}

test("process cancellation waits until the child has actually exited", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pho-code-cancel-"));
  const marker = path.join(directory, "ready");
  const controller = new AbortController();
  const running = runArgvCommand({
    executable: process.execPath,
    args: [
      "-e",
      `process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ready')`,
    ],
    signal: controller.signal,
    timeoutMs: 30_000,
    terminationGraceMs: TERMINATION_GRACE_MS,
  });

  await waitUntilChildIgnoresSigterm(marker);
  const abortedAt = Date.now();
  controller.abort();
  const result = await running;
  const elapsedSinceAbort = Date.now() - abortedAt;
  const outcome = `failure=${result.failure} elapsedSinceAbort=${elapsedSinceAbort}ms`;

  expect(result.failure, outcome).toBe("aborted");
  expect(elapsedSinceAbort, outcome).toBeGreaterThanOrEqual(TERMINATION_GRACE_MS);
});
