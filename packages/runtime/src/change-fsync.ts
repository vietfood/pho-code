import { open } from "node:fs/promises";
import path from "node:path";

export async function writeFileDurable(
  filePath: string,
  data: string | Uint8Array,
  mode?: number,
): Promise<void> {
  const handle = await open(filePath, "w", mode);
  try {
    if (mode !== undefined) {
      await handle.chmod(mode & 0o7777);
    }
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function fsyncParentDirectory(filePath: string): Promise<void> {
  const handle = await open(path.dirname(filePath), "r");
  try {
    await handle.sync();
  } catch {
    // Directory fsync is best-effort durability after a successful rename.
  } finally {
    await handle.close();
  }
}
