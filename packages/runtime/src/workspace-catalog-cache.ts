import type { ModelSummary, SessionSummary } from "@pho-code/protocol";

export interface WorkspaceCatalog {
  models: ModelSummary[];
  modelError?: string;
  sessions: SessionSummary[];
}

export interface WorkspaceCatalogCache {
  /** The catalog for `workspacePath`, or undefined when the slot holds another workspace. */
  get(workspacePath: string): WorkspaceCatalog | undefined;
  /** Replace the slot and return the stored catalog as a fresh object. */
  set(workspacePath: string, catalog: WorkspaceCatalog): WorkspaceCatalog;
  clear(): void;
}

/**
 * One-slot catalog cache for the active workspace.
 *
 * Deliberately not a Map: the runtime only ever reads the workspace it is
 * currently showing, and holding every visited workspace's model and session
 * lists would grow without bound. Reads return a fresh object so a caller
 * cannot mutate the cached lists in place.
 */
export function createWorkspaceCatalogCache(): WorkspaceCatalogCache {
  let slot: (WorkspaceCatalog & { workspacePath: string }) | undefined;

  const project = (entry: WorkspaceCatalog): WorkspaceCatalog => ({
    models: entry.models,
    sessions: entry.sessions,
    ...(entry.modelError ? { modelError: entry.modelError } : {}),
  });

  return {
    get(workspacePath) {
      return slot && slot.workspacePath === workspacePath ? project(slot) : undefined;
    },
    set(workspacePath, catalog) {
      slot = { workspacePath, ...project(catalog) };
      return project(catalog);
    },
    clear() {
      slot = undefined;
    },
  };
}
