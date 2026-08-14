import { spawnSync } from "node:child_process";
import { createHarnessError, HARNESS_ERROR_CODES } from "@pho-code/protocol";

export const GITHUB_MCP_SECRET_SERVICE = "dev.vietfood.phocode.github-mcp";
export const GITHUB_MCP_SECRET_ACCOUNT = "pat";

export interface SecretStore {
  get(service: string, account: string): Promise<string | undefined>;
  set(service: string, account: string, secret: string): Promise<void>;
  delete(service: string, account: string): Promise<void>;
}

export function createMemorySecretStore(initial: Record<string, string> = {}): SecretStore {
  const values = new Map(Object.entries(initial));
  return {
    async get(service, account) {
      return values.get(secretKey(service, account));
    },
    async set(service, account, secret) {
      values.set(secretKey(service, account), secret);
    },
    async delete(service, account) {
      values.delete(secretKey(service, account));
    },
  };
}

export function createOsSecretStore(
  platform: NodeJS.Platform = process.platform,
  run: typeof spawnSync = spawnSync,
): SecretStore {
  if (platform === "darwin") {
    return createMacosKeychainStore(run);
  }
  if (platform === "linux") {
    return createLinuxSecretServiceStore(run);
  }
  return unavailableSecretStore(platform);
}

function createMacosKeychainStore(run: typeof spawnSync): SecretStore {
  return {
    async get(service, account) {
      const result = run("/usr/bin/security", ["find-generic-password", "-s", service, "-a", account, "-w"], {
        encoding: "utf8",
      });
      if (result.status !== 0) {
        return undefined;
      }
      const secret = result.stdout.trim();
      return secret.length > 0 ? secret : undefined;
    },
    async set(service, account, secret) {
      const result = run(
        "/usr/bin/security",
        ["add-generic-password", "-U", "-s", service, "-a", account, "-w", secret, "-l", "Pho Code GitHub MCP"],
        { encoding: "utf8" },
      );
      if (result.status !== 0) {
        throw secretStoreError("Could not store the GitHub token in the macOS Keychain.", result.stderr);
      }
    },
    async delete(service, account) {
      run("/usr/bin/security", ["delete-generic-password", "-s", service, "-a", account], { encoding: "utf8" });
    },
  };
}

function createLinuxSecretServiceStore(run: typeof spawnSync): SecretStore {
  const available = run("secret-tool", ["--version"], { encoding: "utf8" });
  if (available.status !== 0 && available.error) {
    return unavailableSecretStore("linux");
  }
  return {
    async get(service, account) {
      const result = run("secret-tool", ["lookup", "service", service, "account", account], { encoding: "utf8" });
      if (result.status !== 0) {
        return undefined;
      }
      const secret = result.stdout.trim();
      return secret.length > 0 ? secret : undefined;
    },
    async set(service, account, secret) {
      const result = run(
        "secret-tool",
        ["store", "--label=Pho Code GitHub MCP", "service", service, "account", account],
        { encoding: "utf8", input: secret },
      );
      if (result.status !== 0) {
        throw secretStoreError("Could not store the GitHub token in the Secret Service keyring.", result.stderr);
      }
    },
    async delete(service, account) {
      run("secret-tool", ["clear", "service", service, "account", account], { encoding: "utf8" });
    },
  };
}

function unavailableSecretStore(platform: string): SecretStore {
  const error = () =>
    Promise.reject(
      createHarnessError({
        code: HARNESS_ERROR_CODES.secretStoreUnavailable,
        message:
          platform === "linux"
            ? "GitHub login requires a Secret Service keyring. No keyring is available, so the token was not stored."
            : "GitHub login cannot persist a token on this platform.",
        operation: "githubMcp",
        recoverable: true,
      }),
    );
  return {
    get: () => Promise.resolve(undefined),
    set: () => error(),
    delete: () => Promise.resolve(),
  };
}

function secretStoreError(message: string, stderr: string | null | undefined) {
  return createHarnessError({
    code: HARNESS_ERROR_CODES.secretStoreUnavailable,
    message,
    operation: "githubMcp",
    recoverable: true,
    details: { reason: "secret_store_write_failed", stderrBytes: stderr?.length ?? 0 },
  });
}

function secretKey(service: string, account: string): string {
  return `${service}\0${account}`;
}
