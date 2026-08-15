import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { isSensitiveWorkspaceRelative, toPosixRelative } from "./workspace-reference";
import type { ChangeLimitation } from "@pho-code/protocol";

export type CapturePathKind = "regular-file" | "absent" | "directory" | "symlink" | "other";

export interface ResolvedCapturePath {
  relativePath: string;
  canonicalPath: string;
  kind: CapturePathKind;
  limitation?: Extract<ChangeLimitation, "outside-workspace" | "sensitive" | "unsupported-kind">;
}

export function decodeWriteEditPath(args: unknown): string | undefined {
  if (args === null || typeof args !== "object") {
    return undefined;
  }
  const pathValue = (args as { path?: unknown }).path;
  if (typeof pathValue !== "string" || pathValue.trim() === "") {
    return undefined;
  }
  return pathValue.trim();
}

export async function resolveCapturePath(
  requestedPath: string,
  workspacePath: string,
): Promise<ResolvedCapturePath> {
  const workspace = await realpath(path.resolve(workspacePath));
  const resolved = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(workspace, requestedPath);

  let stats;
  try {
    stats = await lstat(resolved);
  } catch {
    const relative = posixRelativeOrOutside(workspace, resolved);
    if (relative.outside) {
      return {
        relativePath: requestedPath,
        canonicalPath: resolved,
        kind: "absent",
        limitation: "outside-workspace",
      };
    }
    if (isSensitiveWorkspaceRelative(relative.path)) {
      return {
        relativePath: relative.path,
        canonicalPath: resolved,
        kind: "absent",
        limitation: "sensitive",
      };
    }
    return {
      relativePath: relative.path,
      canonicalPath: resolved,
      kind: "absent",
    };
  }

  const canonicalPath = stats.isSymbolicLink() ? resolved : await realpath(resolved);
  const relative = posixRelativeOrOutside(workspace, canonicalPath);
  if (relative.outside) {
    return {
      relativePath: requestedPath,
      canonicalPath,
      kind: stats.isDirectory() ? "directory" : stats.isSymbolicLink() ? "symlink" : "other",
      limitation: "outside-workspace",
    };
  }
  if (isSensitiveWorkspaceRelative(relative.path)) {
    return {
      relativePath: relative.path,
      canonicalPath,
      kind: stats.isDirectory() ? "directory" : stats.isSymbolicLink() ? "symlink" : stats.isFile() ? "regular-file" : "other",
      limitation: "sensitive",
    };
  }
  if (stats.isSymbolicLink()) {
    return { relativePath: relative.path, canonicalPath, kind: "symlink", limitation: "unsupported-kind" };
  }
  if (stats.isDirectory()) {
    return { relativePath: relative.path, canonicalPath, kind: "directory", limitation: "unsupported-kind" };
  }
  if (!stats.isFile()) {
    return { relativePath: relative.path, canonicalPath, kind: "other", limitation: "unsupported-kind" };
  }
  return { relativePath: relative.path, canonicalPath, kind: "regular-file" };
}

function posixRelativeOrOutside(
  workspace: string,
  target: string,
): { path: string; outside: false } | { path: string; outside: true } {
  if (target === workspace) {
    return { path: ".", outside: true };
  }
  const relative = path.relative(workspace, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { path: relative, outside: true };
  }
  return { path: toPosixRelative(relative), outside: false };
}
