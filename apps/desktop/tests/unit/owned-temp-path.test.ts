import { mkdir, mkdtemp, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  assertOwnedTempFixture,
  recoverablyRemoveOwnedTempFixture,
  TEST_FIXTURE_PREFIX,
  UnownedTestPathError,
} from "../helpers/owned-temp-path";

async function expectRejected(directory: string): Promise<void> {
  await expect(assertOwnedTempFixture(directory)).rejects.toBeInstanceOf(UnownedTestPathError);
}

describe("owned temp fixture cleanup", () => {
  test("accepts a direct child of the canonical temp directory with the fixture prefix", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), TEST_FIXTURE_PREFIX));
    const owned = await assertOwnedTempFixture(directory);
    expect(path.basename(owned).startsWith(TEST_FIXTURE_PREFIX)).toBe(true);
    expect(path.dirname(owned)).toBe(await realpath(tmpdir()));
  });

  test("refuses an empty path", async () => {
    await expectRejected("");
  });

  test("refuses a relative path even when the basename matches", async () => {
    await expectRejected(`${TEST_FIXTURE_PREFIX}relative`);
  });

  test("refuses the temp root itself", async () => {
    await expectRejected(tmpdir());
  });

  test("refuses a matching substring outside the temp root", async () => {
    await expectRejected(path.resolve(tmpdir(), "..", `${TEST_FIXTURE_PREFIX}outside`));
  });

  test("refuses a nested descendant of an owned fixture", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), TEST_FIXTURE_PREFIX));
    const nested = path.join(directory, "child");
    await mkdir(nested);
    await expectRejected(nested);
  });

  test("refuses a symlink even when the name matches the fixture prefix", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), TEST_FIXTURE_PREFIX));
    const link = path.join(tmpdir(), `${TEST_FIXTURE_PREFIX}link-${process.pid}`);
    await symlink(directory, link);
    await expectRejected(link);
    await recoverablyRemoveOwnedTempFixture(directory);
  });
});
