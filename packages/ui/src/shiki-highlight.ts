// Shiki cache/highlight helpers adapted from refs/t3code ChatMarkdown.tsx +
// lib/syntaxHighlighting.ts (MIT, T3 Tools Inc., 6bc6cb6). Suspense/use() and
// Pierre Diffs highlighter omitted; direct shiki createHighlighter + Map cache.
// Theme choice follows the harness palette (bundled Shiki themes; Flexoki uses
// Solarized as the nearest warm stand-in).

import type { AppearancePalette } from "@pho-code/protocol";
import type { BundledLanguage, Highlighter } from "shiki";

export type ShikiThemeName =
  | "github-light"
  | "github-dark"
  | "gruvbox-light-medium"
  | "gruvbox-dark-medium"
  | "catppuccin-latte"
  | "catppuccin-mocha"
  | "solarized-light"
  | "solarized-dark"
  | "one-dark-pro";

const MAX_CACHE_ENTRIES = 64;
const highlightCache = new Map<string, string>();

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((mod) =>
      mod.createHighlighter({
        themes: ["github-light", "github-dark"],
        langs: ["text"],
      }),
    );
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

function isDarkShikiTheme(theme: ShikiThemeName): boolean {
  switch (theme) {
    case "github-dark":
    case "gruvbox-dark-medium":
    case "catppuccin-mocha":
    case "solarized-dark":
    case "one-dark-pro":
      return true;
    case "github-light":
    case "gruvbox-light-medium":
    case "catppuccin-latte":
    case "solarized-light":
      return false;
    default: {
      const exhaustive: never = theme;
      return exhaustive;
    }
  }
}

async function ensureTheme(highlighter: Highlighter, theme: ShikiThemeName): Promise<ShikiThemeName> {
  const loaded = highlighter.getLoadedThemes();
  if (loaded.includes(theme)) {
    return theme;
  }
  try {
    await highlighter.loadTheme(theme);
    return theme;
  } catch {
    return isDarkShikiTheme(theme) ? "github-dark" : "github-light";
  }
}

export function preferredShikiTheme(
  prefersDark: boolean,
  palette: AppearancePalette = "default",
): ShikiThemeName {
  switch (palette) {
    case "default":
    case "github":
      return prefersDark ? "github-dark" : "github-light";
    case "gruvbox":
      return prefersDark ? "gruvbox-dark-medium" : "gruvbox-light-medium";
    case "catppuccin":
      return prefersDark ? "catppuccin-mocha" : "catppuccin-latte";
    case "flexoki":
      return prefersDark ? "solarized-dark" : "solarized-light";
    case "one-dark":
      return "one-dark-pro";
    default: {
      const exhaustive: never = palette;
      return exhaustive;
    }
  }
}

const tokenCache = new Map<string, { content: string; color?: string }[]>();

export async function tokenizeCode(
  code: string,
  language: string,
  theme: ShikiThemeName,
): Promise<{ content: string; color?: string }[]> {
  const key = `tok\0${theme}\0${language || "text"}\0${code}`;
  const cached = tokenCache.get(key);
  if (cached) {
    return cached;
  }
  const highlighter = await getHighlighter();
  const resolvedTheme = await ensureTheme(highlighter, theme);
  const lang = language || "text";
  const loaded = highlighter.getLoadedLanguages();
  if (!loaded.includes(lang as BundledLanguage) && lang !== "text") {
    try {
      await highlighter.loadLanguage(lang as BundledLanguage);
    } catch {
      return rememberTokens(key, [{ content: code }]);
    }
  }
  try {
    const result = highlighter.codeToTokens(code, { lang: lang as BundledLanguage, theme: resolvedTheme });
    const tokens = result.tokens.flat().map((token) => {
      const item: { content: string; color?: string } = { content: token.content };
      if (token.color) {
        item.color = token.color;
      }
      return item;
    });
    return rememberTokens(key, tokens.length > 0 ? tokens : [{ content: code }]);
  } catch {
    return rememberTokens(key, [{ content: code }]);
  }
}

function rememberTokens(key: string, tokens: { content: string; color?: string }[]): { content: string; color?: string }[] {
  if (tokenCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = tokenCache.keys().next().value;
    if (oldest !== undefined) {
      tokenCache.delete(oldest);
    }
  }
  tokenCache.set(key, tokens);
  return tokens;
}

export async function highlightCode(code: string, language: string, theme: ShikiThemeName): Promise<string> {
  const key = cacheKey(code, language || "text", theme);
  const cached = highlightCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const highlighter = await getHighlighter();
  const resolvedTheme = await ensureTheme(highlighter, theme);
  const lang = language || "text";
  const loaded = highlighter.getLoadedLanguages();
  if (!loaded.includes(lang as BundledLanguage) && lang !== "text") {
    try {
      await highlighter.loadLanguage(lang as BundledLanguage);
    } catch {
      return remember(key, highlighter.codeToHtml(code, { lang: "text", theme: resolvedTheme }));
    }
  }

  try {
    return remember(key, highlighter.codeToHtml(code, { lang: lang as BundledLanguage, theme: resolvedTheme }));
  } catch {
    return remember(key, highlighter.codeToHtml(code, { lang: "text", theme: resolvedTheme }));
  }
}
