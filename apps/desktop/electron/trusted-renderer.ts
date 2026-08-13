import path from "node:path";
import { fileURLToPath } from "node:url";

export type TrustedRendererLocation =
  | {
      kind: "file";
      directory: string;
      entryFile: string;
    }
  | {
      kind: "dev";
      origin: string;
      protocol: "http:" | "https:";
      hostname: string;
      port: string;
      pathname: string;
    };

export function resolveTrustedRendererLocation(input: {
  rendererDirectory: string;
  devServerUrl?: string;
}): TrustedRendererLocation {
  const devServerUrl = input.devServerUrl?.trim();
  if (devServerUrl) {
    let parsed: URL;
    try {
      parsed = new URL(devServerUrl);
    } catch {
      throw new Error("Development renderer URL is malformed.");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Development renderer URL must be http or https.");
    }
    if (parsed.username || parsed.password) {
      throw new Error("Development renderer URL must not include credentials.");
    }
    if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new Error("Development renderer URL must use a loopback hostname.");
    }

    return {
      kind: "dev",
      origin: parsed.origin,
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      pathname: parsed.pathname || "/",
    };
  }

  const directory = path.resolve(input.rendererDirectory);
  return {
    kind: "file",
    directory,
    entryFile: path.join(directory, "index.html"),
  };
}

export function isTrustedRendererUrl(url: string, trusted: TrustedRendererLocation): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.username || parsed.password) {
    return false;
  }

  if (trusted.kind === "dev") {
    if (parsed.protocol !== trusted.protocol) {
      return false;
    }
    if (parsed.origin !== trusted.origin) {
      return false;
    }
    return isHttpPathAllowed(parsed.pathname, trusted.pathname);
  }

  if (parsed.protocol !== "file:") {
    return false;
  }

  let filePath: string;
  try {
    filePath = fileURLToPath(parsed);
  } catch {
    return false;
  }

  return isContainedFilePath(trusted.directory, filePath);
}

export function isTrustedSenderFrame(input: {
  frameUrl: string | undefined;
  isMainFrame: boolean;
  trusted: TrustedRendererLocation;
}): boolean {
  if (!input.isMainFrame || !input.frameUrl) {
    return false;
  }

  return isTrustedRendererUrl(input.frameUrl, input.trusted);
}

function isHttpPathAllowed(pathname: string, basePathname: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }

  const normalized = path.posix.normalize(decoded);
  if (normalized.startsWith("..") || normalized.includes("/../")) {
    return false;
  }

  const base = path.posix.normalize(basePathname || "/");
  if (base === "/") {
    return normalized.startsWith("/");
  }

  return normalized === base || normalized.startsWith(base.endsWith("/") ? base : `${base}/`);
}

function isContainedFilePath(rootDirectory: string, candidatePath: string): boolean {
  const resolvedRoot = path.resolve(rootDirectory);
  const resolvedCandidate = path.resolve(candidatePath);
  if (resolvedCandidate === resolvedRoot) {
    return true;
  }

  const relative = path.relative(resolvedRoot, resolvedCandidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
