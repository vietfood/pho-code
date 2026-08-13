import { setTimeout as delay } from "node:timers/promises";

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;

export type ShutdownResult = "completed" | "timedOut" | "failed";

export async function runBoundedShutdown(
  dispose: () => Promise<void>,
  timeoutMs: number = DEFAULT_SHUTDOWN_TIMEOUT_MS,
): Promise<ShutdownResult> {
  return Promise.race([
    dispose()
      .then(() => "completed" as const)
      .catch((error: unknown) => {
        console.error("Runtime dispose failed during shutdown:", error);
        return "failed" as const;
      }),
    delay(timeoutMs).then(() => "timedOut" as const),
  ]);
}
