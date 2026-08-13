import {
  clampChatFontSize,
  clampGlassStrength,
  clampUiFontSize,
  coerceAppearance,
  DEFAULT_CHAT_FONT_SIZE,
  DEFAULT_GLASS_ENABLED,
  DEFAULT_GLASS_STRENGTH,
  DEFAULT_UI_FONT_SIZE,
  isAppearanceMode,
  isAppearancePalette,
  isChatFontSize,
  isGlassStrength,
  isUiFontSize,
  type AppearanceMode,
  type AppearancePalette,
  type RecentWorkspaceRecord,
} from "@pho-code/protocol";

export const METADATA_VERSION = 4 as const;
export const MAX_RECENT_WORKSPACES = 8;
const LEGACY_METADATA_VERSIONS = new Set([1, 2, 3]);

export interface AppMetadata {
  version: typeof METADATA_VERSION;
  recentWorkspaces: RecentWorkspaceRecord[];
  palette: AppearancePalette;
  mode: AppearanceMode;
  glassEnabled: boolean;
  glassStrength: number;
  uiFontSize: number;
  chatFontSize: number;
  trustedPermissionWorkspaceIds: string[];
  selectedWorkspaceId?: string;
  selectedSessionId?: string;
}

export interface AppMetadataStore {
  load(): AppMetadata;
  save(metadata: AppMetadata): Promise<void>;
}

export function emptyMetadata(): AppMetadata {
  return {
    version: METADATA_VERSION,
    recentWorkspaces: [],
    palette: "default",
    mode: "system",
    glassEnabled: DEFAULT_GLASS_ENABLED,
    glassStrength: DEFAULT_GLASS_STRENGTH,
    uiFontSize: DEFAULT_UI_FONT_SIZE,
    chatFontSize: DEFAULT_CHAT_FONT_SIZE,
    trustedPermissionWorkspaceIds: [],
  };
}

export function createMemoryMetadataStore(initial: AppMetadata = emptyMetadata()): AppMetadataStore {
  let current = cloneMetadata(initial);
  return {
    load() {
      return cloneMetadata(current);
    },
    async save(metadata) {
      current = cloneMetadata(metadata);
    },
  };
}

export function rememberWorkspace(metadata: AppMetadata, record: RecentWorkspaceRecord): AppMetadata {
  const index = metadata.recentWorkspaces.findIndex((entry) => entry.id === record.id);
  const recentWorkspaces =
    index >= 0
      ? metadata.recentWorkspaces.map((entry, entryIndex) => (entryIndex === index ? record : entry))
      : [...metadata.recentWorkspaces, record].slice(-MAX_RECENT_WORKSPACES);
  return copySelection(
    {
      version: METADATA_VERSION,
      recentWorkspaces,
      palette: metadata.palette,
      mode: metadata.mode,
      glassEnabled: metadata.glassEnabled,
      glassStrength: metadata.glassStrength,
      uiFontSize: metadata.uiFontSize,
      chatFontSize: metadata.chatFontSize,
      trustedPermissionWorkspaceIds: metadata.trustedPermissionWorkspaceIds,
      selectedWorkspaceId: record.id,
    },
    metadata.selectedSessionId,
  );
}

/** Rewrite recent workspace order. `workspaceIds` must be a permutation of the current ids. */
export function reorderRecentWorkspaces(metadata: AppMetadata, workspaceIds: readonly string[]): AppMetadata {
  const current = metadata.recentWorkspaces;
  if (workspaceIds.length !== current.length) {
    return metadata;
  }
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  if (new Set(workspaceIds).size !== workspaceIds.length) {
    return metadata;
  }
  const next: RecentWorkspaceRecord[] = [];
  for (const id of workspaceIds) {
    const record = byId.get(id);
    if (!record) {
      return metadata;
    }
    next.push(record);
  }
  return {
    ...metadata,
    recentWorkspaces: next,
  };
}

export function selectSession(metadata: AppMetadata, sessionId: string | undefined): AppMetadata {
  return copySelection(
    {
      version: METADATA_VERSION,
      recentWorkspaces: metadata.recentWorkspaces,
      palette: metadata.palette,
      mode: metadata.mode,
      glassEnabled: metadata.glassEnabled,
      glassStrength: metadata.glassStrength,
      uiFontSize: metadata.uiFontSize,
      chatFontSize: metadata.chatFontSize,
      trustedPermissionWorkspaceIds: metadata.trustedPermissionWorkspaceIds,
      ...(metadata.selectedWorkspaceId ? { selectedWorkspaceId: metadata.selectedWorkspaceId } : {}),
    },
    sessionId,
  );
}

export function setAppearanceTheme(metadata: AppMetadata, mode: AppearanceMode): AppMetadata {
  return setAppearance(metadata, { mode });
}

export function setAppearance(
  metadata: AppMetadata,
  patch: {
    palette?: AppearancePalette;
    mode?: AppearanceMode;
    glassEnabled?: boolean;
    glassStrength?: number;
    uiFontSize?: number;
    chatFontSize?: number;
  },
): AppMetadata {
  const coerced = coerceAppearance({
    palette: patch.palette ?? metadata.palette,
    mode: patch.mode ?? metadata.mode,
  });
  return copySelection(
    {
      version: METADATA_VERSION,
      recentWorkspaces: metadata.recentWorkspaces,
      palette: coerced.palette,
      mode: coerced.mode,
      glassEnabled: patch.glassEnabled ?? metadata.glassEnabled,
      glassStrength: patch.glassStrength ?? metadata.glassStrength,
      uiFontSize: patch.uiFontSize ?? metadata.uiFontSize,
      chatFontSize: patch.chatFontSize ?? metadata.chatFontSize,
      trustedPermissionWorkspaceIds: metadata.trustedPermissionWorkspaceIds,
      ...(metadata.selectedWorkspaceId ? { selectedWorkspaceId: metadata.selectedWorkspaceId } : {}),
    },
    metadata.selectedSessionId,
  );
}

export function parseMetadata(value: unknown): AppMetadata {
  if (value === null || typeof value !== "object") {
    return emptyMetadata();
  }
  const candidate = value as Partial<AppMetadata> & {
    version?: number;
    theme?: unknown;
  };
  if (!Array.isArray(candidate.recentWorkspaces)) {
    return emptyMetadata();
  }
  if (candidate.version !== METADATA_VERSION && !LEGACY_METADATA_VERSIONS.has(candidate.version ?? -1)) {
    return emptyMetadata();
  }

  const recentWorkspaces = candidate.recentWorkspaces.filter(isRecentRecord);
  const legacyMode = isAppearanceMode(candidate.theme) ? candidate.theme : undefined;
  const coerced = coerceAppearance({
    palette: isAppearancePalette(candidate.palette) ? candidate.palette : "default",
    mode: isAppearanceMode(candidate.mode) ? candidate.mode : (legacyMode ?? "system"),
  });

  const metadata: AppMetadata = {
    version: METADATA_VERSION,
    recentWorkspaces,
    palette: coerced.palette,
    mode: coerced.mode,
    glassEnabled: typeof candidate.glassEnabled === "boolean" ? candidate.glassEnabled : DEFAULT_GLASS_ENABLED,
    glassStrength: isGlassStrength(candidate.glassStrength)
      ? candidate.glassStrength
      : typeof candidate.glassStrength === "number"
        ? clampGlassStrength(candidate.glassStrength)
        : DEFAULT_GLASS_STRENGTH,
    uiFontSize: isUiFontSize(candidate.uiFontSize)
      ? candidate.uiFontSize
      : typeof candidate.uiFontSize === "number"
        ? clampUiFontSize(candidate.uiFontSize)
        : DEFAULT_UI_FONT_SIZE,
    chatFontSize: isChatFontSize(candidate.chatFontSize)
      ? candidate.chatFontSize
      : typeof candidate.chatFontSize === "number"
        ? clampChatFontSize(candidate.chatFontSize)
        : DEFAULT_CHAT_FONT_SIZE,
    trustedPermissionWorkspaceIds: Array.isArray(candidate.trustedPermissionWorkspaceIds)
      ? [...new Set(candidate.trustedPermissionWorkspaceIds.filter((entry): entry is string => typeof entry === "string"))]
      : [],
  };
  if (typeof candidate.selectedWorkspaceId === "string") {
    metadata.selectedWorkspaceId = candidate.selectedWorkspaceId;
  }
  if (typeof candidate.selectedSessionId === "string") {
    metadata.selectedSessionId = candidate.selectedSessionId;
  }
  return metadata;
}

export function trustPermissionWorkspace(metadata: AppMetadata, workspaceId: string): AppMetadata {
  if (metadata.trustedPermissionWorkspaceIds.includes(workspaceId)) {
    return metadata;
  }
  return {
    ...metadata,
    trustedPermissionWorkspaceIds: [...metadata.trustedPermissionWorkspaceIds, workspaceId],
  };
}

export function isPermissionWorkspaceTrusted(metadata: AppMetadata, workspaceId: string): boolean {
  return metadata.trustedPermissionWorkspaceIds.includes(workspaceId);
}

function copySelection(base: AppMetadata, sessionId: string | undefined): AppMetadata {
  if (!sessionId) {
    return base;
  }
  return { ...base, selectedSessionId: sessionId };
}

function isRecentRecord(value: unknown): value is RecentWorkspaceRecord {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<RecentWorkspaceRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.displayName === "string" &&
    typeof candidate.lastOpenedAt === "string"
  );
}

function cloneMetadata(metadata: AppMetadata): AppMetadata {
  return parseMetadata(JSON.parse(JSON.stringify(metadata)));
}
