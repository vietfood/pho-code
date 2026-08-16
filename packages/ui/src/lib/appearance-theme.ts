import {
  glassCssTokens,
  isAppearancePalette,
  resolveAppearanceMode,
  type AppearancePalette,
  type AppearanceSettings,
  type ResolvedAppearance,
} from "@pho-code/protocol";

export type { ResolvedAppearance };

let systemMedia: MediaQueryList | null = null;
let systemListener: ((event: MediaQueryListEvent) => void) | null = null;
let lastAppearance: AppearanceSettings | null = null;

/**
 * Apply palette, resolved light/dark, and glass CSS tokens to the document root.
 * System mode listens to prefers-color-scheme until the next apply call.
 */
export function applyAppearanceTheme(
  appearance: AppearanceSettings,
  root: HTMLElement = document.documentElement,
  options: { prefersDark?: boolean; matchMedia?: (query: string) => MediaQueryList } = {},
): ResolvedAppearance {
  lastAppearance = appearance;
  detachSystemListener();

  const prefersDark =
    options.prefersDark ??
    (typeof options.matchMedia === "function"
      ? options.matchMedia("(prefers-color-scheme: dark)").matches
      : typeof window !== "undefined"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
        : false);

  const resolved = resolveAppearanceMode(appearance.mode, prefersDark);
  root.dataset.palette = appearance.palette;
  root.dataset.appearance = resolved;
  root.style.colorScheme = resolved;

  if (appearance.glassEnabled) {
    root.dataset.glass = "on";
    const tokens = glassCssTokens(appearance.glassStrength);
    root.style.setProperty("--glass-blur", `${tokens.blurPx}px`);
    root.style.setProperty("--sidebar-glass-blur", `${tokens.sidebarBlurPx}px`);
    root.style.setProperty("--glass-opacity", `${tokens.opacityPercent}%`);
    root.style.setProperty("--sidebar-glass-opacity", `${tokens.sidebarOpacityPercent}%`);
    root.style.setProperty("--composer-glass-opacity", `${tokens.composerOpacityPercent}%`);
  } else {
    root.dataset.glass = "off";
    root.style.setProperty("--glass-blur", "0px");
    root.style.setProperty("--sidebar-glass-blur", "0px");
    root.style.setProperty("--glass-opacity", "100%");
    root.style.setProperty("--sidebar-glass-opacity", "100%");
    root.style.setProperty("--composer-glass-opacity", "100%");
  }

  if (appearance.mode === "system") {
    attachSystemListener(root, options.matchMedia);
  }

  return resolved;
}

export function readResolvedAppearance(root: HTMLElement = document.documentElement): ResolvedAppearance {
  return root.dataset.appearance === "dark" ? "dark" : "light";
}

export function readAppearancePalette(root: HTMLElement = document.documentElement): AppearancePalette {
  return isAppearancePalette(root.dataset.palette) ? root.dataset.palette : "default";
}

function attachSystemListener(
  root: HTMLElement,
  matchMediaFn?: (query: string) => MediaQueryList,
): void {
  const media =
    typeof matchMediaFn === "function"
      ? matchMediaFn("(prefers-color-scheme: dark)")
      : typeof window !== "undefined"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
  if (!media) {
    return;
  }
  systemMedia = media;
  systemListener = () => {
    if (lastAppearance) {
      applyAppearanceTheme(lastAppearance, root, {
        prefersDark: media.matches,
        matchMedia: matchMediaFn,
      });
    }
  };
  media.addEventListener("change", systemListener);
}

function detachSystemListener(): void {
  if (systemMedia && systemListener) {
    systemMedia.removeEventListener("change", systemListener);
  }
  systemMedia = null;
  systemListener = null;
}
