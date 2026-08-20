import type { AgentScopeAdapter } from "@pho-agent/runtime";

export interface PhoCodeScopeAdapter extends AgentScopeAdapter {
  registerWorkspace(workspaceId: string, canonicalPath: string): string;
  forgetWorkspace(workspaceId: string): void;
}

export function createPhoCodeScopeAdapter(): PhoCodeScopeAdapter {
  const pathsByScope = new Map<string, string>();
  return {
    registerWorkspace(workspaceId, canonicalPath) {
      const scopeId = workspaceId.trim();
      if (!scopeId || !canonicalPath) {
        throw new TypeError("A validated workspace identity and canonical path are required.");
      }
      pathsByScope.set(scopeId, canonicalPath);
      return scopeId;
    },
    forgetWorkspace(workspaceId) {
      pathsByScope.delete(workspaceId);
    },
    resolve(scopeId) {
      const runtimeDirectory = pathsByScope.get(scopeId);
      if (!runtimeDirectory) {
        throw new Error("The agent scope is not registered to a validated Pho Code workspace.");
      }
      return { runtimeDirectory };
    },
  };
}
