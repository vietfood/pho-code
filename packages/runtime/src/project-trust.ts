/** The persistent decision store; `null`/`undefined` both mean "not decided". */
export interface ProjectTrustDecisionStore {
  get(cwd: string): boolean | null | undefined;
}

export interface ProjectTrust {
  /** Approve a workspace for this process only; the store is not written. */
  approveForSession(cwd: string): void;
  /**
   * Whether project-supplied resources may be used for `cwd`: approved in this
   * process, not requiring trust at all, or already trusted on disk.
   */
  isApproved(cwd: string): boolean;
}

/**
 * Owns which workspaces the owner has approved for project-supplied resources.
 *
 * Extracted from `createPhoCodeRuntime`, where a bare `Set` of session-scoped
 * approvals sat beside the persistent trust store with the three-way decision
 * spelled out inline. Keeping them together makes the precedence explicit and
 * keeps the in-memory approvals from being read without the store, or written
 * where a caller only meant to ask.
 */
export function createProjectTrust(deps: {
  store: ProjectTrustDecisionStore;
  requiresTrust(cwd: string): boolean;
}): ProjectTrust {
  const approvedThisSession = new Set<string>();

  return {
    approveForSession(cwd) {
      approvedThisSession.add(cwd);
    },
    isApproved(cwd) {
      if (approvedThisSession.has(cwd)) {
        return true;
      }
      if (!deps.requiresTrust(cwd)) {
        return true;
      }
      return deps.store.get(cwd) === true;
    },
  };
}
