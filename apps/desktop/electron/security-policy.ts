/**
 * Narrow Chromium permission allowlist for the trusted renderer.
 * `clipboard-sanitized-write` is required for `navigator.clipboard.writeText`
 * (async Clipboard API). `local-fonts` lets Appearance list installed families
 * via `queryLocalFonts` (family names only). Both request and check handlers
 * must allow listed permissions.
 */
import { isSafeHttpUrl } from "@pho-code/protocol";

export const ALLOWED_WEB_PERMISSIONS = new Set<string>(["clipboard-sanitized-write", "local-fonts"]);

export function isAllowedWebPermission(permission: string): boolean {
  return ALLOWED_WEB_PERMISSIONS.has(permission);
}

export function contentSecurityPolicy(isDev: boolean): string {
  if (isDev) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: http:",
      "connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:* ws://localhost:* http://localhost:*",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: http:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

export function isSafeExternalUrl(url: string): boolean {
  return isSafeHttpUrl(url);
}
