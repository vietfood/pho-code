import { emptyGitHubMcpSettingsSnapshot, type GitHubMcpSettingsSnapshot } from "./github-mcp";
import { emptySandboxSettingsSnapshot, type SandboxSettingsSnapshot } from "./sandbox";
import { emptySkillSettingsSnapshot, type SkillSettingsSnapshot } from "./skills";

export const APPEARANCE_PALETTES = [
  "default",
  "gruvbox",
  "catppuccin",
  "flexoki",
  "github",
  "one-dark",
] as const;
export type AppearancePalette = (typeof APPEARANCE_PALETTES)[number];

export const APPEARANCE_MODES = ["system", "light", "dark"] as const;
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export const WORK_ENTRY_ICON_PACKS = ["pho", "lucide"] as const;
export type WorkEntryIconPack = (typeof WORK_ENTRY_ICON_PACKS)[number];
export const DEFAULT_WORK_ENTRY_ICONS: WorkEntryIconPack = "lucide";

/** Resolved light/dark after System follows the OS. */
export type ResolvedAppearance = "light" | "dark";

export const PERMISSION_PROFILE_IDS = ["guarded", "balanced", "developer", "custom"] as const;
export type PermissionProfileId = (typeof PERMISSION_PROFILE_IDS)[number];
export type ManagedPermissionProfileId = Exclude<PermissionProfileId, "custom">;

/** Root rem base for chrome/UI. Narrow range keeps layout intact. */
export const MIN_UI_FONT_SIZE = 12;
export const MAX_UI_FONT_SIZE = 20;
export const DEFAULT_UI_FONT_SIZE = 16;

/** Absolute px size for chat transcript and composer text. */
export const MIN_CHAT_FONT_SIZE = 12;
export const MAX_CHAT_FONT_SIZE = 20;
export const DEFAULT_CHAT_FONT_SIZE = 15;

/** Frosted chrome strength when glass is enabled (0 = opaque, 100 = strong). */
export const MIN_GLASS_STRENGTH = 0;
export const MAX_GLASS_STRENGTH = 100;
export const DEFAULT_GLASS_STRENGTH = 55;
export const DEFAULT_GLASS_ENABLED = false;

/** Empty string means the platform default stack. */
export const DEFAULT_UI_FONT_FAMILY = "";
export const DEFAULT_CODE_FONT_FAMILY = "";
export const DEFAULT_FONT_SMOOTHING = true;
export const MAX_FONT_FAMILY_CHARS = 80;

export interface AppearanceSettings {
  palette: AppearancePalette;
  mode: AppearanceMode;
  workEntryIcons: WorkEntryIconPack;
  glassEnabled: boolean;
  glassStrength: number;
  uiFontSize: number;
  chatFontSize: number;
  uiFontFamily: string;
  codeFontFamily: string;
  fontSmoothing: boolean;
}

export interface PermissionSettings {
  profile: PermissionProfileId;
  yoloMode: boolean;
  permissionReviewLog: boolean;
  projectOverridePresent: boolean;
  projectPermissionRulesTrusted: boolean;
  projectPermissionRulesRemembered: boolean;
  appliesToSharedPiAgentDir: boolean;
}

export interface HarnessSettingsSnapshot {
  appearance: AppearanceSettings;
  permission: PermissionSettings;
  skills: SkillSettingsSnapshot;
  githubMcp: GitHubMcpSettingsSnapshot;
  sandbox: SandboxSettingsSnapshot;
}

export interface UpdateAppearanceSettingsInput {
  palette?: AppearancePalette;
  mode?: AppearanceMode;
  workEntryIcons?: WorkEntryIconPack;
  glassEnabled?: boolean;
  glassStrength?: number;
  uiFontSize?: number;
  chatFontSize?: number;
  uiFontFamily?: string;
  codeFontFamily?: string;
  fontSmoothing?: boolean;
}

export interface UpdatePermissionSettingsInput {
  profile?: ManagedPermissionProfileId;
  yoloMode?: boolean;
  permissionReviewLog?: boolean;
}

export interface PermissionStatusPayload {
  yoloMode: boolean;
}

const PALETTE_SET = new Set<string>(APPEARANCE_PALETTES);
const MODE_SET = new Set<string>(APPEARANCE_MODES);
const WORK_ENTRY_ICON_PACK_SET = new Set<string>(WORK_ENTRY_ICON_PACKS);

/** Palettes that only expose dark tokens. Light and System are unavailable. */
const DARK_ONLY_PALETTES = new Set<AppearancePalette>(["one-dark"]);

/** Opaque window fill colors for Electron chrome (hex). */
const WINDOW_BACKGROUNDS: Record<AppearancePalette, Record<ResolvedAppearance, string>> = {
  default: { light: "#fafafa", dark: "#0a0a0a" },
  gruvbox: { light: "#fbf1c7", dark: "#282828" },
  catppuccin: { light: "#eff1f5", dark: "#1e1e2e" },
  flexoki: { light: "#fffcf0", dark: "#100f0f" },
  github: { light: "#ffffff", dark: "#0d1117" },
  "one-dark": { light: "#282c34", dark: "#282c34" },
};

export function isAppearancePalette(value: unknown): value is AppearancePalette {
  return typeof value === "string" && PALETTE_SET.has(value);
}

export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return typeof value === "string" && MODE_SET.has(value);
}

export function isWorkEntryIconPack(value: unknown): value is WorkEntryIconPack {
  return typeof value === "string" && WORK_ENTRY_ICON_PACK_SET.has(value);
}

export function isManagedPermissionProfileId(value: unknown): value is ManagedPermissionProfileId {
  return value === "guarded" || value === "balanced" || value === "developer";
}

export function isUiFontSize(value: unknown): value is number {
  return isIntegerInRange(value, MIN_UI_FONT_SIZE, MAX_UI_FONT_SIZE);
}

export function isChatFontSize(value: unknown): value is number {
  return isIntegerInRange(value, MIN_CHAT_FONT_SIZE, MAX_CHAT_FONT_SIZE);
}

export function isGlassStrength(value: unknown): value is number {
  return isIntegerInRange(value, MIN_GLASS_STRENGTH, MAX_GLASS_STRENGTH);
}

export function clampUiFontSize(value: number): number {
  return clampInteger(value, MIN_UI_FONT_SIZE, MAX_UI_FONT_SIZE, DEFAULT_UI_FONT_SIZE);
}

export function clampChatFontSize(value: number): number {
  return clampInteger(value, MIN_CHAT_FONT_SIZE, MAX_CHAT_FONT_SIZE, DEFAULT_CHAT_FONT_SIZE);
}

export function clampGlassStrength(value: number): number {
  return clampInteger(value, MIN_GLASS_STRENGTH, MAX_GLASS_STRENGTH, DEFAULT_GLASS_STRENGTH);
}

const FONT_FAMILY_FORBIDDEN = /url\s*\(|[;{}<>"'`\\]|,/i;

/**
 * One installed family name, or empty for the system stack.
 * Rejects CSS/HTML injection; does not accept a font-family list.
 */
export function sanitizeFontFamilyName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (trimmed.length > MAX_FONT_FAMILY_CHARS) {
    return null;
  }
  if (/[\n\r\t]/.test(trimmed) || FONT_FAMILY_FORBIDDEN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/** Quote a sanitized family for CSS `font-family` when it is not a CSS ident. */
export function cssQuotedFontFamily(name: string): string {
  const sanitized = sanitizeFontFamilyName(name);
  if (!sanitized) {
    return "";
  }
  if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(sanitized)) {
    return sanitized;
  }
  return `"${sanitized}"`;
}

/** Custom family before a default stack, or null when the default should stand. */
export function appearanceFontStack(custom: string, defaultStack: string): string | null {
  const quoted = cssQuotedFontFamily(custom);
  return quoted.length === 0 ? null : `${quoted}, ${defaultStack}`;
}

export function paletteSupportsMode(palette: AppearancePalette, mode: AppearanceMode): boolean {
  if (!DARK_ONLY_PALETTES.has(palette)) {
    return true;
  }
  return mode === "dark";
}

/**
 * Coerce palette/mode so dark-only palettes never keep light or system.
 * Unknown values fall back to defaults before coercion.
 */
export function coerceAppearance(input: {
  palette?: unknown;
  mode?: unknown;
}): Pick<AppearanceSettings, "palette" | "mode"> {
  const palette = isAppearancePalette(input.palette) ? input.palette : "default";
  let mode = isAppearanceMode(input.mode) ? input.mode : "system";
  if (!paletteSupportsMode(palette, mode)) {
    mode = "dark";
  }
  return { palette, mode };
}

/** Native/Electron themeSource for a stored mode after palette coercion. */
export function nativeThemeSourceForAppearance(
  palette: AppearancePalette,
  mode: AppearanceMode,
): AppearanceMode {
  return coerceAppearance({ palette, mode }).mode;
}

export function resolveAppearanceMode(
  mode: AppearanceMode,
  prefersDark: boolean,
): ResolvedAppearance {
  switch (mode) {
    case "light":
      return "light";
    case "dark":
      return "dark";
    case "system":
      return prefersDark ? "dark" : "light";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function windowBackgroundForAppearance(
  palette: AppearancePalette,
  resolved: ResolvedAppearance,
): string {
  const coerced = coerceAppearance({ palette, mode: resolved });
  return WINDOW_BACKGROUNDS[coerced.palette][resolved];
}

/** CSS blur/opacity tokens derived from the glass strength slider. */
export function glassCssTokens(strength: number): {
  blurPx: number;
  sidebarBlurPx: number;
  opacityPercent: number;
  sidebarOpacityPercent: number;
  composerOpacityPercent: number;
} {
  const clamped = clampGlassStrength(strength);
  const t = clamped / 100;
  // Interpolate from the opaque baseline so 0% matches glass-off exactly. Keep
  // fills readable at full strength so wallpaper tints chrome instead of
  // dominating it. Sidebar and pane share one fill opacity so every surface
  // reads as the same color (owner request); the sidebar keeps a stronger blur
  // for depth without a hue shift. The composer matches that fill and gets CSS
  // blur when glass is on so the field reads as frost rather than a solid card.
  // Extra CSS blur stays off the transcript and right bar.
  const blurPx = Math.round(t * 24);
  const sidebarBlurPx = Math.round(blurPx * 1.2);
  const opacityPercent = Math.round(100 - t * 36);
  const sidebarOpacityPercent = opacityPercent;
  const composerOpacityPercent = opacityPercent;
  return { blurPx, sidebarBlurPx, opacityPercent, sidebarOpacityPercent, composerOpacityPercent };
}

export function emptyAppearanceSettings(): AppearanceSettings {
  return {
    palette: "default",
    mode: "system",
    workEntryIcons: DEFAULT_WORK_ENTRY_ICONS,
    glassEnabled: DEFAULT_GLASS_ENABLED,
    glassStrength: DEFAULT_GLASS_STRENGTH,
    uiFontSize: DEFAULT_UI_FONT_SIZE,
    chatFontSize: DEFAULT_CHAT_FONT_SIZE,
    uiFontFamily: DEFAULT_UI_FONT_FAMILY,
    codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
    fontSmoothing: DEFAULT_FONT_SMOOTHING,
  };
}

export function emptySettingsSnapshot(): HarnessSettingsSnapshot {
  return {
    appearance: emptyAppearanceSettings(),
    permission: {
      profile: "custom",
      yoloMode: false,
      permissionReviewLog: true,
      projectOverridePresent: false,
      projectPermissionRulesTrusted: false,
      projectPermissionRulesRemembered: false,
      appliesToSharedPiAgentDir: false,
    },
    skills: emptySkillSettingsSnapshot(),
    githubMcp: emptyGitHubMcpSettingsSnapshot(),
    sandbox: emptySandboxSettingsSnapshot(),
  };
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}
