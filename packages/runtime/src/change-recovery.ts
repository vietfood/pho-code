import { open, rename } from "node:fs/promises";
import { MAX_CHANGE_SNAPSHOT_BYTES } from "@pho-code/protocol";
import { hashBytes } from "./change-hash";
import { fsyncParentDirectory } from "./change-fsync";
import {
  ChangeRecoveryConflictError,
  assertPathHoldsIdentity,
  type FilesystemIdentity,
} from "./change-identity";
import type { RecoverableRemovalService } from "./recoverable-removal";

export { ChangeRecoveryConflictError } from "./change-identity";

export interface ChangeRecoveryService {
  restoreExact(input: {
    canonicalPath: string;
    workspacePath: string;
    expectedCurrentHash: string;
    expectedIdentity: FilesystemIdentity;
    temporaryPath: string;
    bytes: Uint8Array;
    signal: AbortSignal;
  }): Promise<void>;
}

export function createAtomicChangeRecoveryService(
  removal: RecoverableRemovalService,
): ChangeRecoveryService {
  return {
    async restoreExact(input) {
      if (input.signal.aborted) {
        throw new Error("Undo was cancelled.");
      }
      let handle;
      try {
        handle = await open(input.canonicalPath, "r");
      } catch {
        throw new ChangeRecoveryConflictError("The tracked path is no longer the same file.");
      }
      let temporaryCreated = false;
      try {
        const current = await hashOpenRegularFile(handle, input.canonicalPath, input.expectedIdentity);
        if (current.hash !== input.expectedCurrentHash) {
          throw new ChangeRecoveryConflictError("The file changed after the Undo preview.");
        }
        const permission = current.mode & 0o7777;
        const temp = await open(input.temporaryPath, "wx", permission);
        temporaryCreated = true;
        try {
          await temp.chmod(permission);
          await temp.writeFile(input.bytes);
          await temp.sync();
        } finally {
          await temp.close();
        }
        if (input.signal.aborted) {
          throw new Error("Undo was cancelled.");
        }
        const latest = await hashOpenRegularFile(handle, input.canonicalPath, input.expectedIdentity);
        if (latest.hash !== input.expectedCurrentHash) {
          throw new ChangeRecoveryConflictError("The file changed while Undo was being prepared.");
        }
        await assertPathHoldsIdentity(input.canonicalPath, input.expectedIdentity);
        await rename(input.temporaryPath, input.canonicalPath);
        temporaryCreated = false;
        await fsyncParentDirectory(input.canonicalPath);
      } finally {
        await handle.close();
        if (temporaryCreated) {
          try {
            await removal.moveToTrash({
              canonicalPath: input.temporaryPath,
              workspacePath: input.workspacePath,
              signal: new AbortController().signal,
            });
          } catch {
            // The owned temporary file is deliberately left in place when recoverable cleanup fails.
            // The ledger journals the temp name so the next review open can Trash it.
          }
        }
      }
    },
  };
}

async function hashOpenRegularFile(
  handle: Awaited<ReturnType<typeof open>>,
  canonicalPath: string,
  expected: FilesystemIdentity,
): Promise<{ hash: string; mode: number }> {
  const info = await handle.stat();
  if (!info.isFile() || info.size > MAX_CHANGE_SNAPSHOT_BYTES) {
    throw new ChangeRecoveryConflictError("The tracked file can no longer be restored safely.");
  }
  if (String(info.dev) !== expected.device || String(info.ino) !== expected.inode) {
    throw new ChangeRecoveryConflictError("The tracked path is no longer the same file.");
  }
  const buffer = Buffer.alloc(info.size);
  const { bytesRead } = await handle.read(buffer, 0, info.size, 0);
  if (bytesRead !== info.size) {
    throw new ChangeRecoveryConflictError("The tracked file changed while it was being checked.");
  }
  await assertPathHoldsIdentity(canonicalPath, expected);
  return { hash: hashBytes(buffer.subarray(0, bytesRead)), mode: info.mode };
}
