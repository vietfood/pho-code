import { lookupCompiledContextPrompt } from "./context-prompt";

export interface CompiledContextPromptCache {
  /**
   * Store the compiled prompt for a session key, or forget it when the session
   * has no context-prompt record. Set and delete are one operation because a
   * stale compiled prompt is worse than none: Pi would keep sending a prompt
   * the owner already reset.
   */
  record(keyId: string, compiled: string | undefined): void;
  forget(keyId: string): void;
  /** The compiled prompt Pi should use, falling back to a session-id match. */
  compiledFor(input: { cwd: string; sessionId: string }): string | undefined;
}

/**
 * Owns the per-session compiled context prompt.
 *
 * Extracted from `createPhoCodeRuntime`, where it was a bare `Map` mutated at
 * five sites — including a `set`/`delete` branch that had to be spelled out by
 * hand every time a context record might be absent.
 */
export function createCompiledContextPromptCache(): CompiledContextPromptCache {
  const compiledByKey = new Map<string, string>();

  return {
    record(keyId, compiled) {
      if (compiled === undefined) {
        compiledByKey.delete(keyId);
        return;
      }
      compiledByKey.set(keyId, compiled);
    },
    forget(keyId) {
      compiledByKey.delete(keyId);
    },
    compiledFor(input) {
      return lookupCompiledContextPrompt(compiledByKey, input);
    },
  };
}
