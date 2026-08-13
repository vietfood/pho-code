import { isThemePreference, type RecentWorkspaceRecord, type ThemePreference } from "@pho-code/protocol";

export const METADATA_VERSION = 2 as const;
export const MAX_RECENT_WORKSPACES = 8;
const LEGACY_METADATA_VERSION = 1;

export interface AppMetadata {
  version: typeof METADATA_VERSION;
  recentWorkspaces: RecentWorkspaceRecord[];
  theme: ThemePreference;
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
    theme: "system",
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
  const others = metadata.recentWorkspaces.filter((entry) => entry.id !== record.id);
  return copySelection(
    {
      version: METADATA_VERSION,
      recentWorkspaces: [record, ...others].slice(0, MAX_RECENT_WORKSPACES),
      theme: metadata.theme,
      selectedWorkspaceId: record.id,
    },
    metadata.selectedSessionId,
  );
}

export function selectSession(metadata: AppMetadata, sessionId: string | undefined): AppMetadata {
  return copySelection(
    {
      version: METADATA_VERSION,
      recentWorkspaces: metadata.recentWorkspaces,
      theme: metadata.theme,
      ...(metadata.selectedWorkspaceId ? { selectedWorkspaceId: metadata.selectedWorkspaceId } : {}),
    },
    sessionId,
  );
}

export function setAppearanceTheme(metadata: AppMetadata, theme: ThemePreference): AppMetadata {
  return copySelection(
    {
      version: METADATA_VERSION,
      recentWorkspaces: metadata.recentWorkspaces,
      theme,
      ...(metadata.selectedWorkspaceId ? { selectedWorkspaceId: metadata.selectedWorkspaceId } : {}),
    },
    metadata.selectedSessionId,
  );
}

export function parseMetadata(value: unknown): AppMetadata {
  if (value === null || typeof value !== "object") {
    return emptyMetadata();
  }
  const candidate = value as Partial<AppMetadata> & { version?: number };
  if (!Array.isArray(candidate.recentWorkspaces)) {
    return emptyMetadata();
  }
  if (candidate.version !== METADATA_VERSION && candidate.version !== LEGACY_METADATA_VERSION) {
    return emptyMetadata();
  }

  const recentWorkspaces = candidate.recentWorkspaces.filter(isRecentRecord);
  const metadata: AppMetadata = {
    version: METADATA_VERSION,
    recentWorkspaces,
    theme: isThemePreference(candidate.theme) ? candidate.theme : "system",
  };
  if (typeof candidate.selectedWorkspaceId === "string") {
    metadata.selectedWorkspaceId = candidate.selectedWorkspaceId;
  }
  if (typeof candidate.selectedSessionId === "string") {
    metadata.selectedSessionId = candidate.selectedSessionId;
  }
  return metadata;
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
