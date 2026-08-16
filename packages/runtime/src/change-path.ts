import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import {
  CHANGE_UNTRACKED_PATH_PREFIX,
  isPersistableRelativePath,
  type ChangeLimitation,
} from "@pho-code/protocol";
import { hashUtf8 } from "./change-hash";
import { isSensitiveWorkspaceRelative, toPosixRelative } from "./workspace-reference";

export type CapturePathKind = "regular-file" | "absent" | "directory" | "symlink" | "other";

export interface ResolvedCapturePath {
  relativePath: string;
  canonicalPath: string;
  kind: CapturePathKind;
  limitation?: Extract<ChangeLimitation, "outside-workspace" | "sensitive" | "unsupported-kind" | "capture-failed">;
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

export function untrackedCapturePath(kind: "outside-workspace" | "malformed", discriminator: string): string {
  const digest = hashUtf8(discriminator).slice(0, 16);
  return `${CHANGE_UNTRACKED_PATH_PREFIX}${kind}-${digest}`;
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
      return outsideResult(requestedPath, resolved, "absent");
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
  const kind: CapturePathKind = stats.isDirectory()
    ? "directory"
    : stats.isSymbolicLink()
      ? "symlink"
      : stats.isFile()
        ? "regular-file"
        : "other";
  if (relative.outside) {
    return outsideResult(requestedPath, canonicalPath, kind);
  }
  if (isSensitiveWorkspaceRelative(relative.path)) {
    return {
      relativePath: relative.path,
      canonicalPath,
      kind,
      limitation: "sensitive",
    };
  }
  if (kind === "symlink" || kind === "directory" || kind === "other") {
    return { relativePath: relative.path, canonicalPath, kind, limitation: "unsupported-kind" };
  }
  return { relativePath: relative.path, canonicalPath, kind: "regular-file" };
}

function outsideResult(
  requestedPath: string,
  canonicalPath: string,
  kind: CapturePathKind,
): ResolvedCapturePath {
  return {
    relativePath: untrackedCapturePath("outside-workspace", requestedPath),
    canonicalPath,
    kind,
    limitation: "outside-workspace",
  };
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
  const posix = toPosixRelative(relative);
  if (!isPersistableRelativePath(posix)) {
    return { path: posix, outside: true };
  }
  return { path: posix, outside: false };
}
