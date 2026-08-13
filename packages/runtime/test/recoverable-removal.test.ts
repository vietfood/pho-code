import { describe, expect, test } from "bun:test";
import type { ArgvProcessLaunchInput, ArgvProcessLaunchResult, ArgvProcessLauncher } from "../src/process-launch";
import { createOsTrashRemovalService, probeTrashFacility } from "../src/recoverable-removal";

function recordingLauncher(result: ArgvProcessLaunchResult): {
  launcher: ArgvProcessLauncher;
  calls: ArgvProcessLaunchInput[];
} {
  const calls: ArgvProcessLaunchInput[] = [];
  return {
    calls,
    launcher: {
      async run(input) {
        calls.push(input);
        return result;
      },
    },
  };
}

describe("recoverable removal adapter", () => {
  test("selects macOS trash without adding --", async () => {
    const { launcher, calls } = recordingLauncher({ code: 0, stdout: "", stderr: "" });
    const service = createOsTrashRemovalService({
      platform: "darwin",
      macosTrashPath: "/usr/bin/trash",
      launcher,
    });
    const moved = await service.moveToTrash({
      canonicalPath: "/tmp/pho-code-test-fixture/notes.txt",
      workspacePath: "/tmp/pho-code-test-fixture",
      signal: new AbortController().signal,
    });
    expect(moved.method).toBe("macos-trash");
    expect(calls[0]?.executable).toBe("/usr/bin/trash");
    expect(calls[0]?.args).toEqual(["/tmp/pho-code-test-fixture/notes.txt"]);
    expect(calls[0]?.args.includes("--")).toBe(false);
  });

  test("selects linux trash-put argv without a permanent fallback", async () => {
    const { launcher, calls } = recordingLauncher({ code: 0, stdout: "", stderr: "" });
    const service = createOsTrashRemovalService({
      platform: "linux",
      pathEnv: "/usr/bin:/bin",
      launcher,
    });
    const probe = probeTrashFacility({ platform: "linux", pathEnv: "/usr/bin:/bin" });
    if (!probe.available) {
      return;
    }
    const moved = await service.moveToTrash({
      canonicalPath: "/tmp/a",
      workspacePath: "/tmp",
      signal: new AbortController().signal,
    });
    expect(moved.method === "linux-trash-put" || moved.method === "linux-gio").toBe(true);
    expect(calls[0]?.args.at(-1)).toBe("/tmp/a");
    expect(calls[0]?.executable).not.toBe("rm");
  });

  test("fails closed when a Linux Trash facility is missing", async () => {
    const { launcher, calls } = recordingLauncher({ code: 0, stdout: "", stderr: "" });
    const service = createOsTrashRemovalService({
      platform: "linux",
      pathEnv: "/missing-trash-facility",
      launcher,
    });
    await expect(
      service.moveToTrash({
        canonicalPath: "/tmp/a",
        workspacePath: "/tmp",
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/unavailable-on-platform/);
    expect(calls).toEqual([]);
    expect(probeTrashFacility({ platform: "linux", pathEnv: "/missing-trash-facility" }).available).toBe(false);
  });

  test("fails closed on Windows and never invokes a permanent fallback", async () => {
    const { launcher, calls } = recordingLauncher({ code: 0, stdout: "", stderr: "" });
    const service = createOsTrashRemovalService({ platform: "win32", launcher });
    await expect(
      service.moveToTrash({
        canonicalPath: "C:\\tmp\\a",
        workspacePath: "C:\\tmp",
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/unavailable-on-platform/);
    expect(calls).toEqual([]);
  });

  test("propagates cancellation without spawning a fallback", async () => {
    const { launcher, calls } = recordingLauncher({ code: null, stdout: "", stderr: "", failure: "aborted" });
    const service = createOsTrashRemovalService({
      platform: "darwin",
      macosTrashPath: "/usr/bin/trash",
      launcher,
    });
    await expect(
      service.moveToTrash({
        canonicalPath: "/tmp/a",
        workspacePath: "/tmp",
        signal: AbortSignal.abort(),
      }),
    ).rejects.toThrow(/cancelled/);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.executable).not.toBe("rm");
  });
});
