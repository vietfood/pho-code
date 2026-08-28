import { describe, expect, test } from "bun:test";
import { createRunLifecycle, type ActiveRun, type RunBearingSession } from "../src/runtime-run-lifecycle";

function fakeSession(): RunBearingSession {
  return { runtime: { session: { sessionId: "s1" } } };
}

function lifecycleFor() {
  const finished: { run: ActiveRun; error?: unknown }[] = [];
  const lifecycle = createRunLifecycle<RunBearingSession>({
    finishRun: (_session, run, error) => {
      finished.push(error === undefined ? { run } : { run, error });
    },
    now: () => new Date("2026-08-28T00:00:00.000Z"),
    newRunId: () => "run-1",
  });
  return { lifecycle, finished };
}

describe("run lifecycle", () => {
  test("attaches a fresh unsettled run to the session", () => {
    const { lifecycle } = lifecycleFor();
    const session = fakeSession();

    const run = lifecycle.start(session);

    expect(session.activeRun).toBe(run);
    expect(run).toMatchObject({
      runId: "run-1",
      sessionId: "s1",
      abortRequested: false,
      settled: false,
      startedAt: "2026-08-28T00:00:00.000Z",
    });
  });

  test("finishes the run when the prompt resolves", async () => {
    const { lifecycle, finished } = lifecycleFor();
    const session = fakeSession();
    const run = lifecycle.start(session);

    lifecycle.watchPromptDone(session, run, Promise.resolve("done"));
    await run.promptDone;
    await Promise.resolve();

    expect(finished).toHaveLength(1);
    expect(finished[0]?.error).toBeUndefined();
  });

  test("passes a prompt failure to finishRun", async () => {
    const { lifecycle, finished } = lifecycleFor();
    const session = fakeSession();
    const run = lifecycle.start(session);
    const failure = new Error("provider refused");

    lifecycle.watchPromptDone(session, run, Promise.reject(failure));
    await run.promptDone;
    await Promise.resolve();

    expect(finished[0]?.error).toBe(failure);
  });

  test("settles an aborted run without an error", async () => {
    const { lifecycle, finished } = lifecycleFor();
    const session = fakeSession();
    const run = lifecycle.start(session);
    run.abortRequested = true;

    lifecycle.watchPromptDone(session, run, Promise.reject(new Error("aborted by owner")));
    await run.promptDone;
    await Promise.resolve();

    expect(finished).toHaveLength(1);
    expect(finished[0]?.error).toBeUndefined();
  });

  test("does not finish the run when the caller owns the failure", async () => {
    const { lifecycle, finished } = lifecycleFor();
    const session = fakeSession();
    const run = lifecycle.start(session);

    lifecycle.watchPromptDone(session, run, Promise.reject(new Error("handled")), () => true);
    await run.promptDone;
    await Promise.resolve();

    expect(finished).toHaveLength(0);
  });

  test("never lets promptDone reject, because command paths only observe it", async () => {
    const { lifecycle } = lifecycleFor();
    const session = fakeSession();
    const run = lifecycle.start(session);

    lifecycle.watchPromptDone(session, run, Promise.reject(new Error("provider refused")));

    // Awaiting must not throw: a rejection here would escape as an unhandled
    // rejection rather than as a failed run.
    await expect(run.promptDone).resolves.toBeUndefined();
  });
});
