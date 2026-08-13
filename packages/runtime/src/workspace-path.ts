import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createHarnessError, HARNESS_ERROR_CODES } from "@pho-code/protocol";

export async function canonicalizeWorkspaceDirectory(inputPath: string, operation: string): Promise<string> {
  if (typeof inputPath !== "string" || inputPath.trim() === "") {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.workspaceInaccessible,
      message: "Workspace path is required.",
      operation,
      recoverable: true,
    });
  }

  if (!path.isAbsolute(inputPath)) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.workspaceInaccessible,
      message: "Workspace path must be absolute.",
      operation,
      recoverable: true,
    });
  }

  const resolved = path.resolve(inputPath);
  let canonical: string;
  try {
    canonical = await realpath(resolved);
  } catch {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.workspaceInaccessible,
      message: "Workspace directory is missing or inaccessible.",
      operation,
      recoverable: true,
      details: { path: resolved },
    });
  }

  let stats;
  try {
    stats = await stat(canonical);
  } catch {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.workspaceInaccessible,
      message: "Workspace directory is missing or inaccessible.",
      operation,
      recoverable: true,
      details: { path: canonical },
    });
  }

  if (!stats.isDirectory()) {
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.workspaceInaccessible,
      message: "Workspace path is not a directory.",
      operation,
      recoverable: true,
      details: { path: canonical },
    });
  }

  return canonical;
}

export function displayNameForPath(workspacePath: string): string {
  return path.basename(workspacePath) || workspacePath;
}
