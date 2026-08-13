import { createHarnessError, HARNESS_ERROR_CODES } from "./errors";

export function isJsonSafeValue(value: unknown, seen: WeakSet<object> = new WeakSet()): boolean {
  if (value === null) {
    return true;
  }

  switch (typeof value) {
    case "string":
      return true;
    case "number":
      return Number.isFinite(value);
    case "boolean":
      return true;
    case "object":
      break;
    default:
      return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  let safe: boolean;
  if (Array.isArray(value)) {
    safe = isDenseJsonArray(value) && value.every((entry) => isJsonSafeValue(entry, seen));
  } else {
    safe =
      Object.getPrototypeOf(value) === Object.prototype &&
      typeof (value as { toJSON?: unknown }).toJSON !== "function" &&
      Object.getOwnPropertySymbols(value).length === 0 &&
      Object.values(value).every((entry) => isJsonSafeValue(entry, seen));
  }

  seen.delete(value);
  return safe;
}

export function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function parseNodeVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
} {
  const cleaned = version.trim().replace(/^v/, "");
  const core = cleaned.split("-")[0] ?? "0.0.0";
  const [majorText = "0", minorText = "0", patchText = "0"] = core.split(".");
  return {
    major: Number.parseInt(majorText, 10) || 0,
    minor: Number.parseInt(minorText, 10) || 0,
    patch: Number.parseInt(patchText, 10) || 0,
  };
}

export function compareNodeVersions(left: string, right: string): number {
  const a = parseNodeVersion(left);
  const b = parseNodeVersion(right);
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }
  return a.patch - b.patch;
}

export function nodeVersionMeetsMinimum(version: string, minimum: string): boolean {
  return compareNodeVersions(version, minimum) >= 0;
}

function isDenseJsonArray(value: unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      return false;
    }
  }

  return Object.keys(value).every((key) => key === String(Number(key)));
}

export function assertJsonSafe(value: unknown, operation: string): void {
  if (!isJsonSafeValue(value)) {
    const unsafePath = findUnsafeJsonPath(value);
    throw createHarnessError({
      code: HARNESS_ERROR_CODES.invalidSnapshot,
      message: unsafePath ? `Value at ${unsafePath} is not JSON-safe.` : "Value is not JSON-safe.",
      operation,
    });
  }
}

function findUnsafeJsonPath(value: unknown): string | undefined {
  const seen = new WeakSet<object>();

  function visit(candidate: unknown, path: string): string | undefined {
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") {
      return undefined;
    }
    if (typeof candidate === "number") {
      return Number.isFinite(candidate) ? undefined : path;
    }
    if (typeof candidate !== "object") {
      return path;
    }
    if (seen.has(candidate)) {
      return path;
    }
    seen.add(candidate);

    if (Array.isArray(candidate)) {
      if (!isDenseJsonArray(candidate)) {
        return path;
      }
      for (let index = 0; index < candidate.length; index += 1) {
        const unsafePath = visit(candidate[index], `${path}[${index}]`);
        if (unsafePath) {
          return unsafePath;
        }
      }
      seen.delete(candidate);
      return undefined;
    }

    if (
      Object.getPrototypeOf(candidate) !== Object.prototype ||
      typeof (candidate as { toJSON?: unknown }).toJSON === "function" ||
      Object.getOwnPropertySymbols(candidate).length > 0
    ) {
      return path;
    }

    for (const [key, entry] of Object.entries(candidate)) {
      const unsafePath = visit(entry, `${path}.${key}`);
      if (unsafePath) {
        return unsafePath;
      }
    }
    seen.delete(candidate);
    return undefined;
  }

  return visit(value, "$");
}
