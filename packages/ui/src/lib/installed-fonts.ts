export function uniqueFontFamilies(fonts: ReadonlyArray<{ readonly family: string }>): string[] {
  return [...new Set(fonts.map((font) => font.family))]
    .filter((family) => family.length > 0 && !family.startsWith("."))
    .sort((left, right) => left.localeCompare(right));
}

type QueryLocalFonts = () => Promise<ReadonlyArray<{ readonly family: string }>>;

let cachedQuery: Promise<readonly string[]> | null = null;

/**
 * Installed family names via Chromium Local Font Access. Family names only —
 * never FontData.blob(). Empty when the API is missing or the permission is denied.
 */
export async function queryInstalledFontFamilies(): Promise<readonly string[]> {
  cachedQuery ??= loadInstalledFontFamilies();
  return cachedQuery;
}

async function loadInstalledFontFamilies(): Promise<readonly string[]> {
  const query = (globalThis as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts;
  if (typeof query !== "function") {
    return [];
  }
  try {
    return uniqueFontFamilies(await query.call(globalThis));
  } catch {
    return [];
  }
}
