export const SETTINGS_SECTIONS = [
  {
    id: "appearance",
    label: "Appearance",
    description: "Palette, mode, glass, and fonts.",
  },
  {
    id: "accounts",
    label: "Accounts",
    description: "Provider API keys and sign-in.",
  },
  {
    id: "github",
    label: "GitHub",
    description: "Read-only GitHub MCP connection and login.",
  },
  {
    id: "skills",
    label: "Skills",
    description: "Built-in and trusted instruction sources.",
  },
  {
    id: "archived",
    label: "Archived",
    description: "Restore or move archived chats to Trash.",
  },
  {
    id: "permissions",
    label: "Permissions",
    description: "What the agent may do in a workspace.",
  },
  {
    id: "sandbox",
    label: "Sandbox",
    description: "OS box for agent bash. Workspace files stay allowed.",
  },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = "appearance";

const STORAGE_KEY = "pho-code.settingsSection";

export function isSettingsSectionId(value: unknown): value is SettingsSectionId {
  return SETTINGS_SECTIONS.some((section) => section.id === value);
}

export function readSettingsSection(): SettingsSectionId {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (isSettingsSectionId(stored)) {
      return stored;
    }
  } catch {
    // Ignore quota / private-mode failures; in-memory state still works.
  }
  return DEFAULT_SETTINGS_SECTION;
}

export function writeSettingsSection(section: SettingsSectionId): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, section);
  } catch {
    // Ignore quota / private-mode failures; in-memory state still works.
  }
}

export function initialSettingsSection(options: { flowActive?: boolean } = {}): SettingsSectionId {
  if (options.flowActive) {
    return "accounts";
  }
  return readSettingsSection();
}

export function adjacentSettingsSection(current: SettingsSectionId, delta: -1 | 1): SettingsSectionId {
  const index = SETTINGS_SECTIONS.findIndex((section) => section.id === current);
  const next = (index + delta + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length;
  const section = SETTINGS_SECTIONS[next];
  if (!section) {
    return current;
  }
  return section.id;
}
