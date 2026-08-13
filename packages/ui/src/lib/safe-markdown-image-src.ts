const SAFE_DATA_IMAGE_MIME = /^(?:image\/(?:png|jpeg|gif|webp|svg\+xml))(?:;|$)/iu;

function safeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Returns a normalized src when the URL is safe for markdown `<img>` loads:
 * credential-less http(s), or data: with an allow-listed image MIME.
 * Rejects file:, javascript:, relative paths, and other schemes.
 */
export function safeMarkdownImageSrc(src: string | undefined | null): string | null {
  if (!src || typeof src !== "string") {
    return null;
  }
  const trimmed = src.trim();
  if (!trimmed) {
    return null;
  }

  const http = safeHttpUrl(trimmed);
  if (http) {
    return http;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol === "data:") {
    const payload = trimmed.slice("data:".length);
    if (!SAFE_DATA_IMAGE_MIME.test(payload)) {
      return null;
    }
    return trimmed;
  }

  return null;
}

/**
 * react-markdown urlTransform: defaultUrlTransform strips data: URLs.
 * Allow safe image data:/http(s) for `src`; credential-less http(s) only for other keys.
 */
export function markdownUrlTransform(url: string, key: string): string {
  if (key === "src") {
    return safeMarkdownImageSrc(url) ?? "";
  }
  return safeHttpUrl(url.trim()) ?? "";
}
