export const WORKSPACE_REFERENCE_KINDS = ["file", "folder"] as const;
export type WorkspaceReferenceKind = (typeof WORKSPACE_REFERENCE_KINDS)[number];

export const LOCAL_RETRIEVAL_STATUSES = ["ready", "indexing", "unavailable"] as const;
export type LocalRetrievalStatus = (typeof LOCAL_RETRIEVAL_STATUSES)[number];

/** Workspace-relative POSIX path. Kind is optional; the runtime infers it from the filesystem. Never an absolute filesystem path. */
export interface WorkspaceReferenceToken {
  path: string;
  kind?: WorkspaceReferenceKind;
}

export interface SearchWorkspaceReferencesInput {
  query: string;
  kinds?: readonly WorkspaceReferenceKind[];
  limit?: number;
}

export interface PathSuggestion {
  path: string;
  kind: WorkspaceReferenceKind;
}

export interface SearchWorkspaceReferencesResult {
  suggestions: PathSuggestion[];
  status: LocalRetrievalStatus;
  diagnostic?: string;
}

export const MAX_WORKSPACE_REFERENCE_QUERY = 200;
export const MAX_WORKSPACE_REFERENCE_RESULTS = 20;
export const MAX_WORKSPACE_REFERENCES_PER_PROMPT = 20;
export const DEFAULT_WORKSPACE_REFERENCE_LIMIT = 12;

export function isWorkspaceReferenceKind(value: unknown): value is WorkspaceReferenceKind {
  return typeof value === "string" && (WORKSPACE_REFERENCE_KINDS as readonly string[]).includes(value);
}

export function isWorkspaceReferenceToken(value: unknown): value is WorkspaceReferenceToken {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<WorkspaceReferenceToken>;
  return (
    typeof candidate.path === "string" &&
    candidate.path.trim() !== "" &&
    (candidate.kind === undefined || isWorkspaceReferenceKind(candidate.kind))
  );
}
