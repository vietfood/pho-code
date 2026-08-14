import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createHarnessError, HARNESS_ERROR_CODES, isHarnessError } from "@pho-code/protocol";

export interface SessionArtifactContext {
  agentDir: string;
  workspacePath: string;
  applicationDataDir?: string;
  resourcesRoot?: string;
  homeDir?: string;
}

export interface ValidatedSessionArtifact {
  sessionId: string;
  canonicalPath: string;
  fingerprint: string;
}

export async function validateSessionArtifact(
  listedPath: string,
  sessionId: string,
  context: SessionArtifactContext,
): Promise<ValidatedSessionArtifact> {
  if (typeof listedPath !== "string" || listedPath.trim() === "") {
    throw artifactError("The session transcript path is missing.");
  }
  if (!path.isAbsolute(listedPath)) {
    throw artifactError("The session transcript path must be absolute.");
  }
  if (!listedPath.endsWith(".jsonl")) {
    throw artifactError("The session transcript is not a Pi JSONL artifact.");
  }

  const resolved = path.resolve(listedPath);
  let stats;
  try {
    stats = await lstat(resolved);
  } catch {
    throw artifactError("The session transcript does not exist.");
  }
  if (stats.isSymbolicLink()) {
    throw artifactError("The session transcript cannot be a symlink.");
  }
  if (!stats.isFile()) {
    throw artifactError("The session transcript is not a regular file.");
  }

  const canonicalPath = await realpath(resolved);
  // Parent directories such as macOS /tmp may be symlinks. The file itself must
  // be a regular file, and the canonical path must stay inside the agent dir.

  const agentDir = await canonicalizeExistingDirectory(context.agentDir, "agent data");
  if (canonicalPath === agentDir) {
    throw artifactError("The agent data directory cannot be moved to Trash.");
  }
  if (!isStrictlyInside(canonicalPath, agentDir)) {
    throw artifactError("The session transcript is outside the agent data directory.");
  }
  if (path.dirname(canonicalPath) === agentDir) {
    throw artifactError("The session transcript is not in a session subdirectory.");
  }

  const workspace = await canonicalizeExistingDirectory(context.workspacePath, "workspace");
  if (canonicalPath === workspace || isStrictlyInside(canonicalPath, workspace)) {
    throw artifactError("A workspace path cannot be moved as a session transcript.");
  }

  const protectedRoots = await collectProtectedRoots(context, agentDir);
  for (const protectedRoot of protectedRoots) {
    if (canonicalPath === protectedRoot) {
      throw artifactError("This path is protected and cannot be moved to Trash.");
    }
  }

  return {
    sessionId,
    canonicalPath,
    fingerprint: sessionArtifactFingerprint({
      sessionId,
      canonicalPath,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    }),
  };
}

export function sessionArtifactFingerprint(input: {
  sessionId: string;
  canonicalPath: string;
  size: number;
  mtimeMs: number;
}): string {
  return createHash("sha256")
    .update(input.sessionId)
    .update("\0")
    .update(input.canonicalPath)
    .update("\0")
    .update(String(input.size))
    .update("\0")
    .update(String(input.mtimeMs))
    .digest("hex");
}

function artifactError(message: string) {
  return createHarnessError({
    code: HARNESS_ERROR_CODES.sessionArtifactInvalid,
    message,
    operation: "removeSession",
    recoverable: true,
  });
}

async function collectProtectedRoots(context: SessionArtifactContext, agentDir: string): Promise<string[]> {
  const home = path.resolve(context.homeDir ?? homedir());
  const candidates = [
    home,
    agentDir,
    path.join(agentDir, "auth.json"),
    path.join(agentDir, "models.json"),
    ...(context.applicationDataDir ? [path.resolve(context.applicationDataDir)] : []),
    ...(context.resourcesRoot ? [path.resolve(context.resourcesRoot)] : []),
  ];
  const roots: string[] = [];
  for (const candidate of candidates) {
    try {
      roots.push(await realpath(candidate));
    } catch {
      roots.push(path.resolve(candidate));
    }
  }
  return roots;
}

async function canonicalizeExistingDirectory(directory: string, label: string): Promise<string> {
  if (typeof directory !== "string" || directory.trim() === "") {
    throw artifactError(`The ${label} path is required.`);
  }
  if (!path.isAbsolute(directory)) {
    throw artifactError(`The ${label} path must be absolute.`);
  }
  try {
    const canonical = await realpath(path.resolve(directory));
    const stats = await lstat(canonical);
    if (!stats.isDirectory()) {
      throw artifactError(`The ${label} path is not a directory.`);
    }
    return canonical;
  } catch (error) {
    if (isHarnessError(error)) {
      throw error;
    }
    throw artifactError(`The ${label} directory is missing or inaccessible.`);
  }
}

function isStrictlyInside(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
