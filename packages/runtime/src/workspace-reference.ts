import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import {
  createHarnessError,
  extractAtMentionPaths,
  HARNESS_ERROR_CODES,
  type WorkspaceReferenceKind,
  type WorkspaceReferenceToken,
} from "@pho-code/protocol";

const SENSITIVE_BASENAME = /^(?:\.env(?:\..+)?|id_rsa|id_ed25519|id_ecdsa|\.netrc|\.npmrc)$/u;
const SENSITIVE_EXTENSION = /\.(?:pem|key)$/u;

export class WorkspaceReferenceError extends Error {
  readonly code = HARNESS_ERROR_CODES.invalidWorkspaceReference;

  constructor(message: string) {
    super(message);
    this.name = "WorkspaceReferenceError";
  }
}

export interface ValidatedWorkspaceReference {
  path: string;
  kind: WorkspaceReferenceKind;
  canonicalPath: string;
}

export function toPosixRelative(relativePath: string): string {
  return relativePath.split(path.sep).join("/").replace(/\/+$/u, "");
}

export function isSensitiveWorkspaceRelative(relativePath: string): boolean {
  const posix = toPosixRelative(relativePath);
  if (posix === ".env.example" || posix.endsWith("/.env.example")) {
    return false;
  }
  const segments = posix.split("/");
  if (segments[0] === ".git") {
    return true;
  }
  const base = segments.at(-1) ?? "";
  return SENSITIVE_BASENAME.test(base) || SENSITIVE_EXTENSION.test(base);
}

export function assertWorkspaceRelativeInput(relativePath: string, operation: string): string {
  const trimmed = relativePath.trim();
  if (trimmed === "") {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidWorkspaceReference,
      message: "A workspace-relative path is required.",
      operation,
      recoverable: true,
    });
  }
  if (path.isAbsolute(trimmed) || trimmed.startsWith("~")) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidWorkspaceReference,
      message: "Workspace references must be relative paths, not absolute locations.",
      operation,
      recoverable: true,
    });
  }
  const posix = toPosixRelative(trimmed);
  const segments = posix.split("/");
  if (segments.some((segment) => segment === ".." || segment === "")) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidWorkspaceReference,
      message: "Workspace references cannot contain parent or empty path segments.",
      operation,
      recoverable: true,
    });
  }
  if (isSensitiveWorkspaceRelative(posix)) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidWorkspaceReference,
      message: "That path is sensitive and cannot be attached as a reference.",
      operation,
      recoverable: true,
    });
  }
  return posix;
}

export function extractAtMentions(text: string): string[] {
  return extractAtMentionPaths(text);
}

export async function validateWorkspaceReference(
  token: WorkspaceReferenceToken,
  workspacePath: string,
  operation = "sendPrompt",
): Promise<ValidatedWorkspaceReference> {
  const relative = assertWorkspaceRelativeInput(token.path, operation);
  const workspace = await realpath(path.resolve(workspacePath));
  const resolved = path.resolve(workspace, ...relative.split("/"));
  let stats;
  try {
    stats = await lstat(resolved);
  } catch {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidWorkspaceReference,
      message: `Referenced path is missing: ${relative}`,
      operation,
      recoverable: true,
      details: { path: relative },
    });
  }
  const canonicalPath = stats.isSymbolicLink() ? resolved : await realpath(resolved);
  const inside = canonicalPath === workspace || isInside(canonicalPath, workspace);
  if (!inside) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidWorkspaceReference,
      message: "Referenced path is outside the selected workspace.",
      operation,
      recoverable: true,
      details: { path: relative },
    });
  }
  const kind: WorkspaceReferenceKind = stats.isDirectory() ? "folder" : "file";
  if (token.kind !== undefined && token.kind !== kind) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidWorkspaceReference,
      message: `Referenced path is a ${kind}, not a ${token.kind}.`,
      operation,
      recoverable: true,
      details: { path: relative },
    });
  }
  return {
    path: toPosixRelative(path.relative(workspace, canonicalPath)),
    kind,
    canonicalPath,
  };
}

export function collectWorkspaceReferenceTokens(
  text: string,
  explicit: readonly WorkspaceReferenceToken[] = [],
): WorkspaceReferenceToken[] {
  const tokens: WorkspaceReferenceToken[] = [];
  const seen = new Set<string>();
  for (const relative of extractAtMentions(text)) {
    seen.add(relative);
    tokens.push({ path: relative });
  }
  for (const token of explicit) {
    const relative = token.path.trim();
    if (relative === "" || seen.has(relative)) {
      continue;
    }
    seen.add(relative);
    tokens.push(token.kind ? { path: relative, kind: token.kind } : { path: relative });
  }
  return tokens;
}

export function serializeWorkspaceReferences(
  text: string,
  references: readonly ValidatedWorkspaceReference[],
): string {
  const trimmed = text.trim();
  if (references.length === 0) {
    return trimmed;
  }
  const lines = references.map((reference) =>
    reference.kind === "folder"
      ? `- folder \`${reference.path}\` (names the folder; do not expand its contents unless asked)`
      : `- file \`${reference.path}\``,
  );
  const block = `Referenced workspace paths:\n${lines.join("\n")}`;
  return trimmed ? `${trimmed}\n\n${block}` : block;
}

/** Drop the model-only appendix so the transcript shows the owner's prompt and @ chips. */
export function stripWorkspaceReferenceAppendix(text: string): string {
  const stripped = text.replace(WORKSPACE_REFERENCE_APPENDIX, "");
  return stripped === text ? text : stripped.replace(/\s+$/u, "");
}

const WORKSPACE_REFERENCE_APPENDIX =
  /(?:\n\n)?Referenced workspace paths:\n(?:- (?:file|folder) `[^`\n]+`(?: \(names the folder; do not expand its contents unless asked\))?\n?)+$/u;

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
