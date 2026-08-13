import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const TEST_FIXTURE_PREFIX = "pho-code-test-";

export class UnownedTestPathError extends Error {
  readonly code = "unowned_test_path";

  constructor(message: string) {
    super(message);
    this.name = "UnownedTestPathError";
  }
}

export async function assertOwnedTempFixture(directory: string): Promise<string> {
  if (typeof directory !== "string" || directory.trim() === "") {
    throw new UnownedTestPathError("Test artifact path must be a non-empty string.");
  }

  if (!path.isAbsolute(directory)) {
    throw new UnownedTestPathError("Test artifact path must be absolute.");
  }

  const resolved = path.resolve(directory);
  const basename = path.basename(resolved);
  if (!basename.startsWith(TEST_FIXTURE_PREFIX) || basename === TEST_FIXTURE_PREFIX) {
    throw new UnownedTestPathError("Test artifact basename must start with the exact fixture prefix.");
  }

  let canonicalTmp: string;
  try {
    canonicalTmp = await realpath(tmpdir());
  } catch {
    throw new UnownedTestPathError("Unable to canonicalize the OS temporary directory.");
  }

  const parent = path.dirname(resolved);
  let canonicalParent: string;
  try {
    canonicalParent = await realpath(parent);
  } catch {
    throw new UnownedTestPathError("Test artifact parent directory could not be canonicalized.");
  }

  if (canonicalParent !== canonicalTmp) {
    throw new UnownedTestPathError("Test artifact must be a direct child of the OS temporary directory.");
  }

  let stats;
  try {
    stats = await lstat(resolved);
  } catch {
    throw new UnownedTestPathError("Test artifact does not exist.");
  }

  if (stats.isSymbolicLink()) {
    throw new UnownedTestPathError("Test artifact must not be a symbolic link.");
  }

  if (!stats.isDirectory()) {
    throw new UnownedTestPathError("Test artifact must be a directory.");
  }

  const canonical = await realpath(resolved);
  if (path.dirname(canonical) !== canonicalTmp || path.basename(canonical) !== basename) {
    throw new UnownedTestPathError("Canonical test artifact escaped the temp-root ownership boundary.");
  }

  return canonical;
}

export async function recoverablyRemoveOwnedTempFixture(directory: string): Promise<void> {
  const owned = await assertOwnedTempFixture(directory);
  await moveToTrash(owned);
}

async function moveToTrash(absolutePath: string): Promise<void> {
  if (process.platform === "darwin") {
    await execTrash("/usr/bin/trash", [absolutePath], absolutePath);
    return;
  }

  if (process.platform === "linux") {
    try {
      await execTrash("trash-put", [absolutePath], absolutePath);
      return;
    } catch (first) {
      if (first instanceof UnownedTestPathError) {
        throw first;
      }
      await execTrash("gio", ["trash", absolutePath], absolutePath);
      return;
    }
  }

  throw new UnownedTestPathError(
    `No recoverable trash facility is available on ${process.platform}. Retained ${absolutePath}.`,
  );
}

async function execTrash(command: string, args: string[], absolutePath: string): Promise<void> {
  try {
    await execFileAsync(command, args);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new UnownedTestPathError(
      `Recoverable trash failed (${command}): ${detail}. Retained ${absolutePath}.`,
    );
  }
}
