export function contentSecurityPolicy(isDev: boolean): string {
  if (isDev) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
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
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      return false;
    }
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
