import type { WorkspaceSummary } from "@pho-code/protocol";

export interface SessionSelection<TSession extends { workspace: WorkspaceSummary }> {
  /** The session commands act on when none is named. */
  readonly current: TSession | undefined;
  /** Last workspace opened, kept as a fallback after the selection is cleared. */
  readonly lastWorkspace: WorkspaceSummary | undefined;
  /** Select a session and record its workspace as the fallback. */
  select(session: TSession): void;
  /**
   * Swap in a reopened controller for the session already selected. The
   * workspace is unchanged, so the fallback is left alone.
   */
  rebind(session: TSession): void;
  /**
   * Record a workspace opened without selecting a session, returning the path
   * it replaced so the caller can release the previous one.
   */
  rememberWorkspace(workspace: WorkspaceSummary): string | undefined;
  clear(): void;
  /** Clear only if `session` is the current selection. */
  clearIf(session: TSession): void;
  /** Workspace a global command acts on: the selection's, else the last opened. */
  activeWorkspacePath(): string | undefined;
}

/**
 * Owns which session is active and which workspace to fall back to.
 *
 * Extracted from `createPhoCodeRuntime`, where these were two independent
 * `let` bindings. Keeping them together makes the pairing explicit: selecting a
 * session must also record its workspace, while clearing the selection must
 * *not* forget it — global commands still need a workspace to act on after the
 * last chat closes.
 *
 * Generic over the session type so the runtime's `LiveSession` stays private.
 */
export function createSessionSelection<
  TSession extends { workspace: WorkspaceSummary },
>(): SessionSelection<TSession> {
  let current: TSession | undefined;
  let lastWorkspace: WorkspaceSummary | undefined;

  return {
    get current() {
      return current;
    },
    get lastWorkspace() {
      return lastWorkspace;
    },
    select(session) {
      current = session;
      lastWorkspace = session.workspace;
    },
    rebind(session) {
      current = session;
    },
    rememberWorkspace(workspace) {
      const previous = lastWorkspace?.path;
      lastWorkspace = workspace;
      return previous;
    },
    clear() {
      current = undefined;
    },
    clearIf(session) {
      if (current === session) {
        current = undefined;
      }
    },
    activeWorkspacePath() {
      return current?.workspace.path ?? lastWorkspace?.path;
    },
  };
}
