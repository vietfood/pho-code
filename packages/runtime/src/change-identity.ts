import { randomUUID } from "node:crypto";
import { lstat, open, realpath, stat } from "node:fs/promises";
import { MAX_CHANGE_SNAPSHOT_BYTES } from "@pho-code/protocol";
import { hashBytes } from "./change-hash";

export class ChangeRecoveryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChangeRecoveryConflictError";
  }
}

export interface FilesystemIdentity {
  canonicalPath: string;
  device: string;
  inode: string;
  kind: "file" | "directory";
}

const UNDO_TEMP_NAME = /^\.pho-code-undo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/i;

export function createUndoTempName(): string {
  return `.pho-code-undo-${randomUUID()}.tmp`;
}

export function isUndoTempName(value: string): boolean {
  return UNDO_TEMP_NAME.test(value);
}

export function sameFilesystemIdentity(left: FilesystemIdentity, right: FilesystemIdentity): boolean {
  return (
    left.canonicalPath === right.canonicalPath &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.kind === right.kind
  );
}

export async function inspectDirectoryIdentity(directoryPath: string): Promise<FilesystemIdentity> {
  let canonicalPath: string;
  try {
    canonicalPath = await realpath(directoryPath);
  } catch {
    throw new ChangeRecoveryConflictError("The workspace identity changed.");
  }
  const info = await stat(canonicalPath);
  if (!info.isDirectory()) {
    throw new ChangeRecoveryConflictError("The workspace identity is no longer a directory.");
  }
  return {
    canonicalPath,
    device: String(info.dev),
    inode: String(info.ino),
    kind: "directory",
  };
}

export async function inspectRegularFile(canonicalPath: string): Promise<{
  identity: FilesystemIdentity;
  hash: string;
  mode: number;
}> {
  let handle;
  try {
    handle = await open(canonicalPath, "r");
  } catch {
    throw new ChangeRecoveryConflictError("The tracked path is no longer the same file.");
  }
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_CHANGE_SNAPSHOT_BYTES) {
      throw new ChangeRecoveryConflictError("The tracked file can no longer be restored safely.");
    }
    const buffer = Buffer.alloc(info.size);
    const { bytesRead } = await handle.read(buffer, 0, info.size, 0);
    if (bytesRead !== info.size) {
      throw new ChangeRecoveryConflictError("The tracked file changed while it was being checked.");
    }
    const identity: FilesystemIdentity = {
      canonicalPath,
      device: String(info.dev),
      inode: String(info.ino),
      kind: "file",
    };
    await assertPathHoldsIdentity(canonicalPath, identity);
    return {
      identity,
      hash: hashBytes(buffer.subarray(0, bytesRead)),
      mode: info.mode,
    };
  } finally {
    await handle.close();
  }
}

export async function assertPathHoldsIdentity(
  canonicalPath: string,
  expected: FilesystemIdentity,
): Promise<void> {
  let info;
  try {
    info = await lstat(canonicalPath);
  } catch {
    throw new ChangeRecoveryConflictError("The tracked path is no longer the same file.");
  }
  if (info.isSymbolicLink() || (expected.kind === "file" && !info.isFile()) || (expected.kind === "directory" && !info.isDirectory())) {
    throw new ChangeRecoveryConflictError("The tracked path is no longer a regular file.");
  }
  if (String(info.dev) !== expected.device || String(info.ino) !== expected.inode) {
    throw new ChangeRecoveryConflictError("The tracked path is no longer the same file.");
  }
  if (!info.isSymbolicLink()) {
    const currentPath = await realpath(canonicalPath);
    if (currentPath !== expected.canonicalPath) {
      throw new ChangeRecoveryConflictError("The tracked path is no longer the same file.");
    }
  }
}
