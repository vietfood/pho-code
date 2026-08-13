import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";
import { MAX_WEB_REDIRECTS, WEB_REQUEST_TIMEOUT_MS } from "@pho-code/protocol";

// Public-HTTP SSRF policy informed by pi-web-access 0.22.0 ssrf-protection.ts (MIT).
// This module is application-owned: no config file, no env-proxy trust, no allowRanges.

export type LookupAddress = { address: string; family: number };
export type DnsLookup = (hostname: string) => Promise<LookupAddress[]>;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class WebResearchError extends Error {
  readonly stage: string;
  readonly retryable: boolean;

  constructor(stage: string, message: string, retryable: boolean) {
    super(`[${stage}] ${message}${retryable ? " Retryable." : ""}`);
    this.name = "WebResearchError";
    this.stage = stage;
    this.retryable = retryable;
  }
}

export interface ValidatePublicHttpUrlOptions {
  lookup?: DnsLookup;
  stage?: string;
}

export function sanitizePublicHttpUrl(raw: string, stage: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new WebResearchError(stage, "The URL is not valid.", false);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new WebResearchError(stage, "Only http: and https: URLs are allowed.", false);
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new WebResearchError(stage, "URLs with userinfo credentials are denied.", false);
  }
  parsed.hash = "";
  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname) {
    throw new WebResearchError(stage, "The URL must include a hostname.", false);
  }
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new WebResearchError(stage, `Blocked internal hostname: ${hostname}`, false);
  }
  parsed.hostname = hostname;
  return parsed;
}

export async function validatePublicHttpUrl(
  raw: string | URL,
  options: ValidatePublicHttpUrlOptions = {},
): Promise<URL> {
  const stage = options.stage ?? "web/ssrf";
  const url = raw instanceof URL ? sanitizePublicHttpUrl(raw.toString(), stage) : sanitizePublicHttpUrl(raw, stage);
  const hostname = normalizeHostname(url.hostname);
  if (net.isIP(hostname)) {
    assertPublicAddress(hostname, hostname, stage);
    return url;
  }
  let addresses: LookupAddress[];
  try {
    addresses = await (options.lookup ?? defaultLookup)(hostname);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WebResearchError(stage, `Failed to resolve ${hostname}: ${message}`, true);
  }
  if (addresses.length === 0) {
    throw new WebResearchError(stage, `Failed to resolve ${hostname}: no addresses returned`, true);
  }
  for (const { address } of addresses) {
    assertPublicAddress(address, hostname, stage);
  }
  return url;
}

export async function fetchPublicHttpUrl(
  raw: string,
  init: RequestInit,
  options: ValidatePublicHttpUrlOptions & { fetch?: typeof fetch; maxRedirects?: number; signal?: AbortSignal } = {},
): Promise<{ response: Response; finalUrl: string }> {
  const stage = options.stage ?? "web/fetch";
  const fetchImpl = options.fetch ?? fetch;
  const maxRedirects = options.maxRedirects ?? MAX_WEB_REDIRECTS;
  let current = await validatePublicHttpUrl(raw, options);
  let requestInit: RequestInit = { ...init, redirect: "manual" };

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    let response: Response;
    try {
      response = await fetchImpl(current, requestInit);
    } catch (error) {
      if (options.signal?.aborted || isAbortError(error)) {
        throw new WebResearchError(stage, "The request was aborted.", false);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new WebResearchError(stage, `Network request failed: ${message}`, true);
    }
    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, finalUrl: current.toString() };
    }
    const location = response.headers.get("location");
    if (!location) {
      return { response, finalUrl: current.toString() };
    }
    if (redirects === maxRedirects) {
      throw new WebResearchError(stage, `Too many redirects fetching ${current.toString()}`, false);
    }
    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw new WebResearchError(stage, "Redirect target is not a valid URL.", false);
    }
    current = await validatePublicHttpUrl(next, options);
    if (response.status === 303) {
      const { body: _body, ...rest } = requestInit;
      requestInit = { ...rest, method: "GET" };
    }
  }
  throw new WebResearchError(stage, `Too many redirects fetching ${current.toString()}`, false);
}

export function combineAbortSignals(signal: AbortSignal | undefined, timeoutMs = WEB_REQUEST_TIMEOUT_MS): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("abort");
}

function defaultLookup(hostname: string): Promise<LookupAddress[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/u, "").replace(/\.$/u, "");
}

function assertPublicAddress(address: string, hostname: string, stage: string): void {
  const normalized = normalizeHostname(address);
  const ipVersion = net.isIP(normalized);
  if (ipVersion === 0) {
    throw new WebResearchError(stage, `Resolved non-IP address for ${hostname}: ${address}`, false);
  }
  if (ipVersion === 4 && isBlockedIPv4(normalized)) {
    throw new WebResearchError(stage, `Blocked internal address for ${hostname}: ${normalized}`, false);
  }
  if (ipVersion === 6 && isBlockedIPv6(normalized)) {
    throw new WebResearchError(stage, `Blocked internal address for ${hostname}: ${normalized}`, false);
  }
}

function isBlockedIPv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIPv6(address: string): boolean {
  const groups = parseIPv6(address);
  if (!groups) {
    return true;
  }
  const first = groups[0] ?? 0;
  if (groups.every((group) => group === 0)) {
    return true;
  }
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) {
    return true;
  }
  if ((first & 0xfe00) === 0xfc00) {
    return true;
  }
  if ((first & 0xffc0) === 0xfe80) {
    return true;
  }
  const mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (mapped) {
    const ipv4 = `${(groups[6] ?? 0) >> 8}.${(groups[6] ?? 0) & 0xff}.${(groups[7] ?? 0) >> 8}.${(groups[7] ?? 0) & 0xff}`;
    return isBlockedIPv4(ipv4);
  }
  return false;
}

function parseIPv6(address: string): number[] | null {
  let value = address;
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const ipv4 = value.slice(lastColon + 1);
    if (net.isIP(ipv4) !== 4) {
      return null;
    }
    const octets = ipv4.split(".").map((part) => Number(part));
    const high = ((octets[0] ?? 0) << 8) | (octets[1] ?? 0);
    const low = ((octets[2] ?? 0) << 8) | (octets[3] ?? 0);
    value = `${value.slice(0, lastColon)}:${high.toString(16)}:${low.toString(16)}`;
  }
  const pieces = value.split("::");
  if (pieces.length > 2) {
    return null;
  }
  const left = pieces[0] ? pieces[0].split(":") : [];
  const right = pieces.length === 2 && pieces[1] ? pieces[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (pieces.length === 1 && missing !== 0) {
    return null;
  }
  if (pieces.length === 2 && missing < 0) {
    return null;
  }
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right].map((part) => {
    if (!/^[0-9a-f]{1,4}$/iu.test(part)) {
      return -1;
    }
    return Number.parseInt(part, 16);
  });
  return groups.length === 8 && groups.every((group) => group >= 0 && group <= 0xffff) ? groups : null;
}
