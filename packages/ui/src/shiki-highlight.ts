// Shiki cache/highlight helpers adapted from refs/t3code ChatMarkdown.tsx +
// lib/syntaxHighlighting.ts (MIT, T3 Tools Inc., 6bc6cb6). Suspense/use() and
// Pierre Diffs highlighter omitted; direct shiki createHighlighter + Map cache.

import { createHighlighter, type BundledLanguage, type Highlighter } from "shiki";

export type ShikiThemeName = "github-light" | "github-dark";

const MAX_CACHE_ENTRIES = 64;
const highlightCache = new Map<string, string>();

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light", "github-dark"],
      langs: ["text", "typescript", "javascript", "tsx", "jsx", "json", "bash", "shell", "markdown", "python", "css", "html", "yaml", "toml", "diff", "rust", "go"],
    });
  }
  return highlighterPromise;
}

function cacheKey(code: string, language: string, theme: ShikiThemeName): string {
  return `${theme}\0${language}\0${code}`;
}

function remember(key: string, html: string): string {
  if (highlightCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = highlightCache.keys().next().value;
    if (oldest !== undefined) {
      highlightCache.delete(oldest);
    }
  }
  highlightCache.set(key, html);
  return html;
}

export function preferredShikiTheme(prefersDark: boolean): ShikiThemeName {
  return prefersDark ? "github-dark" : "github-light";
}

export async function highlightCode(code: string, language: string, theme: ShikiThemeName): Promise<string> {
  const key = cacheKey(code, language || "text", theme);
  const cached = highlightCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const highlighter = await getHighlighter();
  const lang = language || "text";
  const loaded = highlighter.getLoadedLanguages();
  if (!loaded.includes(lang as BundledLanguage) && lang !== "text") {
    try {
      await highlighter.loadLanguage(lang as BundledLanguage);
    } catch {
      return remember(key, highlighter.codeToHtml(code, { lang: "text", theme }));
    }
  }

  try {
    return remember(key, highlighter.codeToHtml(code, { lang: lang as BundledLanguage, theme }));
  } catch {
    return remember(key, highlighter.codeToHtml(code, { lang: "text", theme }));
  }
}
