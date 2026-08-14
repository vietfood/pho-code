const SVG_MAX_CHARS = 256_000;
const SVG_ROOT =
  /^\s*(?:<\?xml\b[^>]*>\s*)?<svg(?:\s|>)/iu;

/**
 * Turns fenced SVG source into a data URL for `<img>`.
 * SVG-as-image does not run scripts or load external resources in Chromium.
 * Rejects DOCTYPE/ENTITY (XXE), xml-stylesheet, oversized payloads, and
 * sources that are not an `<svg>` root.
 */
export function svgSourceToDataUrl(source: string): string | null {
  const trimmed = source.replace(/^\uFEFF/u, "").trim();
  if (!trimmed || trimmed.length > SVG_MAX_CHARS) {
    return null;
  }
  if (/<!DOCTYPE/iu.test(trimmed) || /<!ENTITY/iu.test(trimmed)) {
    return null;
  }
  if (/<\?xml-stylesheet/iu.test(trimmed)) {
    return null;
  }
  if (!SVG_ROOT.test(trimmed)) {
    return null;
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
}
