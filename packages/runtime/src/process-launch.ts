import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const PROCESS_LAUNCH_TIMEOUT_MS = 15_000;
export const PROCESS_TERMINATION_GRACE_MS = 1_000;

export type ProcessLaunchFailure = "not-found" | "aborted" | "timeout" | "spawn";

export interface ArgvProcessLaunchInput {
  executable: string;
  args: readonly string[];
  signal?: AbortSignal;
  timeoutMs?: number;
  terminationGraceMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ArgvProcessLaunchResult {
  code: number | null;
  stdout: string;
  stderr: string;
  failure?: ProcessLaunchFailure;
}

export interface ArgvProcessLauncher {
  run(input: ArgvProcessLaunchInput): Promise<ArgvProcessLaunchResult>;
}

export function minimalProcessEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
  };
  if (process.env.HOME) {
    env.HOME = process.env.HOME;
  }
  if (process.env.LANG) {
    env.LANG = process.env.LANG;
  }
  if (process.env.TMPDIR) {
    env.TMPDIR = process.env.TMPDIR;
  }
  return env;
}

export function findExecutableOnPath(name: string, pathEnv = process.env.PATH ?? ""): string | undefined {
  if (name.includes("/") || name.includes("\\")) {
    return undefined;
  }
  for (const directory of pathEnv.split(path.delimiter)) {
    if (!directory) {
      continue;
    }
    const candidate = path.join(directory, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function createArgvProcessLauncher(): ArgvProcessLauncher {
  return {
    run(input) {
      return runArgvCommand(input);
    },
  };
}

export function runArgvCommand(input: ArgvProcessLaunchInput): Promise<ArgvProcessLaunchResult> {
  const timeoutMs = input.timeoutMs ?? PROCESS_LAUNCH_TIMEOUT_MS;
  const terminationGraceMs = input.terminationGraceMs ?? PROCESS_TERMINATION_GRACE_MS;
  const env = input.env ?? minimalProcessEnv();

  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const timeout = { id: undefined as ReturnType<typeof setTimeout> | undefined };
    const forceKill = { id: undefined as ReturnType<typeof setTimeout> | undefined };
    let requestedFailure: "aborted" | "timeout" | undefined;
    const child = spawn(input.executable, [...input.args], {
      cwd: input.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (result: ArgvProcessLaunchResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout.id !== undefined) {
        clearTimeout(timeout.id);
      }
      if (forceKill.id !== undefined) {
        clearTimeout(forceKill.id);
      }
      input.signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const requestTermination = (failure: "aborted" | "timeout") => {
      if (requestedFailure) {
        return;
      }
      requestedFailure = failure;
      if (timeout.id !== undefined) {
        clearTimeout(timeout.id);
      }
      child.kill("SIGTERM");
      forceKill.id = setTimeout(() => {
        child.kill("SIGKILL");
      }, terminationGraceMs);
    };

    const onAbort = () => requestTermination("aborted");

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (requestedFailure) {
        finish({ code: null, stdout, stderr: stderr || error.message, failure: requestedFailure });
        return;
      }
      finish({
        code: null,
        stdout,
        stderr: stderr || error.message,
        failure: error.code === "ENOENT" ? "not-found" : "spawn",
      });
    });
    child.on("close", (code) => {
      finish(requestedFailure ? { code, stdout, stderr, failure: requestedFailure } : { code, stdout, stderr });
    });

    if (input.signal?.aborted) {
      onAbort();
      return;
    }
    input.signal?.addEventListener("abort", onAbort, { once: true });
    timeout.id = setTimeout(() => {
      requestTermination("timeout");
    }, timeoutMs);
  });
}
