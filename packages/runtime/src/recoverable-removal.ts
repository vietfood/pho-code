import { existsSync } from "node:fs";
import { homedir } from "node:os";
import {
  PROCESS_LAUNCH_TIMEOUT_MS,
  createArgvProcessLauncher,
  findExecutableOnPath,
  type ArgvProcessLauncher,
} from "./process-launch";

export type TrashMethod = "macos-trash" | "linux-trash-put" | "linux-gio";

export interface RecoverableRemovalService {
  moveToTrash(input: {
    canonicalPath: string;
    workspacePath: string;
    signal: AbortSignal;
  }): Promise<{ method: TrashMethod }>;
}

export type TrashFacilityProbe =
  | { available: true; method: TrashMethod; executable: string; argsPrefix: readonly string[] }
  | { available: false; reason: string };

export interface OsTrashRemovalOptions {
  platform?: NodeJS.Platform;
  launcher?: ArgvProcessLauncher;
  macosTrashPath?: string;
  pathEnv?: string;
  homeDir?: string;
}

const MACOS_TRASH = "/usr/bin/trash";

export function probeTrashFacility(options: OsTrashRemovalOptions = {}): TrashFacilityProbe {
  const platform = options.platform ?? process.platform;
  if (platform === "darwin") {
    const executable = options.macosTrashPath ?? MACOS_TRASH;
    if (!existsSync(executable)) {
      return {
        available: false,
        reason: `macOS Trash facility ${executable} is missing. Install it or restore the system trash command. unavailable-on-platform`,
      };
    }
    return { available: true, method: "macos-trash", executable, argsPrefix: [] };
  }

  if (platform === "linux") {
    const pathEnv = options.pathEnv ?? process.env.PATH ?? "";
    const trashPut = findExecutableOnPath("trash-put", pathEnv);
    if (trashPut) {
      return { available: true, method: "linux-trash-put", executable: trashPut, argsPrefix: [] };
    }
    const gio = findExecutableOnPath("gio", pathEnv);
    if (gio) {
      return { available: true, method: "linux-gio", executable: gio, argsPrefix: ["trash"] };
    }
    return {
      available: false,
      reason:
        "No Linux Trash facility was found. Install trash-cli (trash-put) or ensure gio is on PATH. unavailable-on-platform",
    };
  }

  return {
    available: false,
    reason: `Recoverable Trash is not supported on ${platform}. unavailable-on-platform`,
  };
}

export function createOsTrashRemovalService(options: OsTrashRemovalOptions = {}): RecoverableRemovalService {
  const launcher = options.launcher ?? createArgvProcessLauncher();
  const home = options.homeDir ?? homedir();

  return {
    async moveToTrash(input) {
      const facility = probeTrashFacility(options);
      if (!facility.available) {
        throw new Error(facility.reason);
      }

      const result = await launcher.run({
        executable: facility.executable,
        args: [...facility.argsPrefix, input.canonicalPath],
        signal: input.signal,
        timeoutMs: PROCESS_LAUNCH_TIMEOUT_MS,
        cwd: home,
      });

      if (result.failure === "aborted") {
        throw new Error("The Trash operation was cancelled.");
      }
      if (result.failure === "timeout") {
        throw new Error("The Trash operation timed out.");
      }
      if (result.failure === "not-found") {
        throw new Error(
          `Trash executable ${facility.executable} was not found. unavailable-on-platform. The original path was left unchanged.`,
        );
      }
      if (result.failure === "spawn") {
        throw new Error(normalizeStderr(result.stderr) || "The Trash process failed to start.");
      }
      if (result.code !== 0) {
        throw new Error(
          normalizeStderr(result.stderr) || `Trash exited with code ${result.code ?? "unknown"}. The original path was left unchanged.`,
        );
      }
      return { method: facility.method };
    },
  };
}

function normalizeStderr(stderr: string): string {
  return stderr.replace(/\s+/g, " ").trim().slice(0, 500);
}
