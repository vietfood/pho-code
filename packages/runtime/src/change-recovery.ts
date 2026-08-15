import { randomUUID } from "node:crypto";
import { open, rename, stat } from "node:fs/promises";
import path from "node:path";
import { MAX_CHANGE_SNAPSHOT_BYTES } from "@pho-code/protocol";
import { hashBytes } from "./change-hash";
import type { RecoverableRemovalService } from "./recoverable-removal";

export class ChangeRecoveryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChangeRecoveryConflictError";
  }
}

export interface ChangeRecoveryService {
  restoreExact(input: {
    canonicalPath: string;
    workspacePath: string;
    expectedCurrentHash: string;
    bytes: Uint8Array;
    signal: AbortSignal;
  }): Promise<void>;
}

export function createAtomicChangeRecoveryService(
  removal: RecoverableRemovalService,
): ChangeRecoveryService {
  return {
    async restoreExact(input) {
      const info = await stat(input.canonicalPath);
      if (!info.isFile()) {
        throw new ChangeRecoveryConflictError("The tracked path is no longer a regular file.");
      }
      if (input.signal.aborted) {
        throw new Error("Undo was cancelled.");
      }
      const currentHash = await hashBoundedRegularFile(input.canonicalPath);
      if (currentHash !== input.expectedCurrentHash) {
        throw new ChangeRecoveryConflictError("The file changed after the Undo preview.");
      }

      const temporaryPath = path.join(
        path.dirname(input.canonicalPath),
        `.pho-code-undo-${randomUUID()}.tmp`,
      );
      let temporaryCreated = false;
      try {
        const handle = await open(temporaryPath, "wx", info.mode);
        temporaryCreated = true;
        try {
          await handle.writeFile(input.bytes);
          await handle.sync();
        } finally {
          await handle.close();
        }
        if (input.signal.aborted) {
          throw new Error("Undo was cancelled.");
        }
        const finalHash = await hashBoundedRegularFile(input.canonicalPath);
        if (finalHash !== input.expectedCurrentHash) {
          throw new ChangeRecoveryConflictError("The file changed while Undo was being prepared.");
        }
        await rename(temporaryPath, input.canonicalPath);
        temporaryCreated = false;
      } finally {
        if (temporaryCreated) {
          try {
            await removal.moveToTrash({
              canonicalPath: temporaryPath,
              workspacePath: input.workspacePath,
              signal: new AbortController().signal,
            });
          } catch {
            // The owned temporary file is deliberately left in place when recoverable cleanup fails.
          }
        }
      }
    },
  };
}

async function hashBoundedRegularFile(canonicalPath: string): Promise<string> {
  const handle = await open(canonicalPath, "r");
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
    return hashBytes(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}
