import { failCommand, HARNESS_ERROR_CODES, type SessionKey } from "@pho-code/protocol";

/** The parts of a resident controller the lookup needs to identify it. */
export interface LocatableController {
  key: SessionKey;
}

export interface ControllerLookup<TSession extends LocatableController> {
  /**
   * The controller a session-bearing command acts on. A command that names a
   * workspace must match that exact controller; one that names only a session
   * may resolve an unambiguous resident match, then the current selection.
   */
  locate(sessionId: string, workspaceId: string | undefined, operation: string): TSession;
}

/**
 * Owns how a command's `{ sessionId, workspaceId? }` becomes one controller.
 *
 * Extracted from `createPhoCodeRuntime`. Three of its four paths end in a
 * refusal, and the distinction between them — "not open" for a named workspace
 * versus "not the active session" for an ambiguous one — is the part a caller
 * must not re-derive by hand at each of its ~30 call sites.
 */
export function createControllerLookup<TSession extends LocatableController>(deps: {
  get(key: SessionKey): TSession | undefined;
  list(): readonly TSession[];
  selected(): TSession | undefined;
}): ControllerLookup<TSession> {
  return {
    locate(sessionId, workspaceId, operation) {
      if (workspaceId && workspaceId.trim() !== "") {
        const match = deps.get({ workspaceId, sessionId });
        if (!match) {
          failCommand(operation, "The target session is not open.", HARNESS_ERROR_CODES.sessionNotFound);
        }
        return match;
      }
      const matches = deps.list().filter((entry) => entry.key.sessionId === sessionId);
      if (matches.length === 1 && matches[0]) {
        return matches[0];
      }
      const selected = deps.selected();
      if (selected?.key.sessionId === sessionId) {
        return selected;
      }
      failCommand(operation, "The target session is not the active session.", HARNESS_ERROR_CODES.sessionNotFound);
    },
  };
}
