import { lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const TRASH_TOOL_NAME = "move_to_trash";
export const REFERENCE_SUBMODULE_SEGMENTS = ["refs/pi-gui", "refs/pi-web", "refs/t3code"] as const;

export interface TrashTargetContext {
  workspacePath: string;
  agentDir: string;
  applicationDataDir?: string;
  resourcesRoot?: string;
  homeDir?: string;
}

export interface ValidatedTrashTarget {
  requestedPath: string;
  canonicalPath: string;
  workspaceRelative: string;
}

export class TrashTargetError extends Error {
  readonly code = "trash_target_rejected";

  constructor(message: string) {
    super(message);
    this.name = "TrashTargetError";
  }
}

export async function validateTrashTarget(
  requestedPath: string,
  context: TrashTargetContext,
): Promise<ValidatedTrashTarget> {
  if (typeof requestedPath !== "string" || requestedPath.trim() === "") {
    throw new TrashTargetError("A single filesystem path is required.");
  }

  const workspace = await canonicalizeExistingDirectory(context.workspacePath, "workspace");
  const resolved = path.resolve(workspace, requestedPath);
  let stats;
  try {
    stats = await lstat(resolved);
  } catch {
    throw new TrashTargetError("The path does not exist.");
  }

  const canonicalPath = stats.isSymbolicLink() ? resolved : await realpath(resolved);
  if (path.dirname(canonicalPath) === canonicalPath) {
    throw new TrashTargetError("The filesystem root cannot be moved to Trash.");
  }
  if (canonicalPath === workspace) {
    throw new TrashTargetError("The workspace root cannot be moved to Trash.");
  }
  if (!isStrictlyInside(canonicalPath, workspace)) {
    throw new TrashTargetError("The path is outside the selected workspace.");
  }

  const relative = path.relative(workspace, canonicalPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new TrashTargetError("The path escaped the selected workspace.");
  }
  if (REFERENCE_SUBMODULE_SEGMENTS.some((segment) => relative === segment || relative.startsWith(`${segment}${path.sep}`))) {
    throw new TrashTargetError("Reference submodules cannot be moved to Trash.");
  }

  const protectedRoots = await collectProtectedRoots(context);
  for (const protectedRoot of protectedRoots) {
    if (canonicalPath === protectedRoot.path) {
      throw new TrashTargetError("This path is protected and cannot be moved to Trash.");
    }
    if (protectedRoot.mode === "tree" && isStrictlyInside(canonicalPath, protectedRoot.path)) {
      throw new TrashTargetError("This path is protected and cannot be moved to Trash.");
    }
  }

  return {
    requestedPath,
    canonicalPath,
    workspaceRelative: relative.split(path.sep).join("/"),
  };
}

async function collectProtectedRoots(context: TrashTargetContext): Promise<Array<{ path: string; mode: "exact" | "tree" }>> {
  const home = path.resolve(context.homeDir ?? homedir());
  const candidates: Array<{ path: string; mode: "exact" | "tree" }> = [
    { path: home, mode: "exact" },
    { path: path.resolve(context.agentDir), mode: "tree" },
    ...(context.applicationDataDir ? [{ path: path.resolve(context.applicationDataDir), mode: "tree" as const }] : []),
    ...(context.resourcesRoot ? [{ path: path.resolve(context.resourcesRoot), mode: "tree" as const }] : []),
  ];
  const roots: Array<{ path: string; mode: "exact" | "tree" }> = [];
  for (const candidate of candidates) {
    try {
      roots.push({ path: await realpath(candidate.path), mode: candidate.mode });
    } catch {
      roots.push({ path: path.resolve(candidate.path), mode: candidate.mode });
    }
  }
  return roots;
}

async function canonicalizeExistingDirectory(directory: string, label: string): Promise<string> {
  if (typeof directory !== "string" || directory.trim() === "") {
    throw new TrashTargetError(`The ${label} path is required.`);
  }
  if (!path.isAbsolute(directory)) {
    throw new TrashTargetError(`The ${label} path must be absolute.`);
  }
  try {
    const canonical = await realpath(path.resolve(directory));
    const stats = await lstat(canonical);
    if (!stats.isDirectory()) {
      throw new TrashTargetError(`The ${label} path is not a directory.`);
    }
    return canonical;
  } catch (error) {
    if (error instanceof TrashTargetError) {
      throw error;
    }
    throw new TrashTargetError(`The ${label} directory is missing or inaccessible.`);
  }
}

function isStrictlyInside(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
