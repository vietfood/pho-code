import { randomUUID } from "node:crypto";

export interface ActiveRun {
  runId: string;
  sessionId: string;
  promptDone: Promise<void>;
  abortRequested: boolean;
  settled: boolean;
  startedAt: string;
}

/** The parts of a live session a run is attached to. */
export interface RunBearingSession {
  activeRun?: ActiveRun;
  runtime: { session: { sessionId: string } };
}

export interface RunLifecycle<TSession extends RunBearingSession> {
  /** Attach a fresh run to the session and return it. */
  start(session: TSession): ActiveRun;
  /**
   * Settle the run when Pi's prompt promise resolves or rejects.
   *
   * `run.promptDone` is observed by callers but never awaited on a command
   * path, so it is deliberately reduced to a never-rejecting promise: a
   * rejection there would surface as an unhandled rejection rather than as a
   * failed run. An aborted run settles without an error because the owner
   * asked for it; `ignoreError` covers the case where the caller has already
   * taken over the failure.
   */
  watchPromptDone(
    session: TSession,
    run: ActiveRun,
    promptDone: Promise<unknown>,
    ignoreError?: () => boolean,
  ): void;
}

/**
 * Owns the birth and settlement of a run.
 *
 * Extracted from `createPhoCodeRuntime`, where the unhandled-rejection
 * guarantee above lived in a comment beside one of ~70 sibling functions and
 * could not be tested without constructing a runtime and a Pi session.
 */
export function createRunLifecycle<TSession extends RunBearingSession>(deps: {
  finishRun(session: TSession, run: ActiveRun, error?: unknown): Promise<void> | void;
  now?(): Date;
  newRunId?(): string;
}): RunLifecycle<TSession> {
  const now = deps.now ?? (() => new Date());
  const newRunId = deps.newRunId ?? (() => randomUUID());

  return {
    start(session) {
      const run: ActiveRun = {
        runId: newRunId(),
        sessionId: session.runtime.session.sessionId,
        promptDone: Promise.resolve(),
        abortRequested: false,
        settled: false,
        startedAt: now().toISOString(),
      };
      session.activeRun = run;
      return run;
    },
    watchPromptDone(session, run, promptDone, ignoreError) {
      run.promptDone = promptDone.then(
        () => undefined,
        () => undefined,
      );
      void promptDone.then(
        () => deps.finishRun(session, run),
        (error: unknown) => {
          if (ignoreError?.()) {
            return;
          }
          if (run.abortRequested) {
            return deps.finishRun(session, run);
          }
          return deps.finishRun(session, run, error);
        },
      );
    },
  };
}
