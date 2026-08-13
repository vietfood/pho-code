export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const PERMISSION_PROFILE_IDS = ["guarded", "balanced", "custom"] as const;
export type PermissionProfileId = (typeof PERMISSION_PROFILE_IDS)[number];
export type ManagedPermissionProfileId = Exclude<PermissionProfileId, "custom">;

export interface AppearanceSettings {
  theme: ThemePreference;
}

export interface PermissionSettings {
  profile: PermissionProfileId;
  yoloMode: boolean;
  permissionReviewLog: boolean;
  projectOverridePresent: boolean;
  appliesToSharedPiAgentDir: boolean;
}

export interface HarnessSettingsSnapshot {
  appearance: AppearanceSettings;
  permission: PermissionSettings;
}

export interface UpdateAppearanceSettingsInput {
  theme: ThemePreference;
}

export interface UpdatePermissionSettingsInput {
  profile?: ManagedPermissionProfileId;
  yoloMode?: boolean;
  permissionReviewLog?: boolean;
}

export interface PermissionStatusPayload {
  yoloMode: boolean;
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function isManagedPermissionProfileId(value: unknown): value is ManagedPermissionProfileId {
  return value === "guarded" || value === "balanced";
}

export function emptySettingsSnapshot(): HarnessSettingsSnapshot {
  return {
    appearance: { theme: "system" },
    permission: {
      profile: "custom",
      yoloMode: false,
      permissionReviewLog: true,
      projectOverridePresent: false,
      appliesToSharedPiAgentDir: false,
    },
  };
}
