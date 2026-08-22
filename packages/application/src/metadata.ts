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
  isWorkEntryIconPack,
  DEFAULT_WORK_ENTRY_ICONS,
  isGlassStrength,
  isSessionKey,
  isSessionOutcome,
  isUiFontSize,
  isExternalSkillSourceId,
  MAX_GITHUB_MCP_LOGIN_CHARS,
  sessionKeyEquals,
  type AppearanceMode,
  type AppearancePalette,
  type WorkEntryIconPack,
  type RecentWorkspaceRecord,
  type SessionKey,
  type SessionOutcome,
} from "@pho-code/protocol";

export const METADATA_VERSION = 6 as const;
export const MAX_RECENT_WORKSPACES = 8;
const LEGACY_METADATA_VERSIONS = new Set([1, 2, 3, 4, 5]);

export interface SessionLifecycleRecord extends SessionKey {
  archivedAt?: string;
  lastViewedAt?: string;
  lastOutcome?: SessionOutcome;
  lastOutcomeAt?: string;
}

export interface AppMetadata {
  version: typeof METADATA_VERSION;
  recentWorkspaces: RecentWorkspaceRecord[];
  palette: AppearancePalette;
  mode: AppearanceMode;
  workEntryIcons: WorkEntryIconPack;
  glassEnabled: boolean;
  glassStrength: number;
  uiFontSize: number;
  chatFontSize: number;
  trustedPermissionWorkspaceIds: string[];
  sessionLifecycle: SessionLifecycleRecord[];
  enabledSkillSources: string[];
  githubMcpEnabled: boolean;
  githubMcpAccountLogin?: string;
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
    workEntryIcons: DEFAULT_WORK_ENTRY_ICONS,
    glassEnabled: DEFAULT_GLASS_ENABLED,
    glassStrength: DEFAULT_GLASS_STRENGTH,
    uiFontSize: DEFAULT_UI_FONT_SIZE,
    chatFontSize: DEFAULT_CHAT_FONT_SIZE,
    trustedPermissionWorkspaceIds: [],
    sessionLifecycle: [],
    enabledSkillSources: [],
    githubMcpEnabled: false,
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
  return { ...metadata, recentWorkspaces, selectedWorkspaceId: record.id };
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
  const next = { ...metadata };
  delete next.selectedSessionId;
  if (sessionId) {
    next.selectedSessionId = sessionId;
  }
  return next;
}

export function setAppearance(
  metadata: AppMetadata,
  patch: {
    palette?: AppearancePalette;
    mode?: AppearanceMode;
    workEntryIcons?: WorkEntryIconPack;
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
  return {
    ...metadata,
    palette: coerced.palette,
    mode: coerced.mode,
    workEntryIcons: patch.workEntryIcons ?? metadata.workEntryIcons,
    glassEnabled: patch.glassEnabled ?? metadata.glassEnabled,
    glassStrength: patch.glassStrength ?? metadata.glassStrength,
    uiFontSize: patch.uiFontSize ?? metadata.uiFontSize,
    chatFontSize: patch.chatFontSize ?? metadata.chatFontSize,
  };
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
    workEntryIcons: isWorkEntryIconPack(candidate.workEntryIcons)
      ? candidate.workEntryIcons
      : DEFAULT_WORK_ENTRY_ICONS,
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
    sessionLifecycle: parseSessionLifecycle(candidate.sessionLifecycle),
    enabledSkillSources: parseEnabledSkillSources(candidate.enabledSkillSources),
    githubMcpEnabled: candidate.githubMcpEnabled === true,
  };
  const accountLogin = parseGitHubAccountLogin(candidate.githubMcpAccountLogin);
  if (accountLogin) {
    metadata.githubMcpAccountLogin = accountLogin;
  }
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

export function getSessionLifecycle(
  metadata: AppMetadata,
  key: SessionKey,
): SessionLifecycleRecord | undefined {
  return metadata.sessionLifecycle.find((entry) => sessionKeyEquals(entry, key));
}

export function archiveSessionMetadata(
  metadata: AppMetadata,
  key: SessionKey,
  archivedAt: string,
): AppMetadata {
  return upsertSessionLifecycle(metadata, key, (current) => ({
    ...current,
    archivedAt: current.archivedAt ?? archivedAt,
  }));
}

export function restoreSessionMetadata(metadata: AppMetadata, key: SessionKey): AppMetadata {
  const current = getSessionLifecycle(metadata, key);
  if (!current?.archivedAt) {
    return metadata;
  }
  const next = { ...current };
  delete next.archivedAt;
  if (!next.lastViewedAt && !next.lastOutcome && !next.lastOutcomeAt) {
    return {
      ...metadata,
      sessionLifecycle: metadata.sessionLifecycle.filter((entry) => !sessionKeyEquals(entry, key)),
    };
  }
  return upsertSessionLifecycle(metadata, key, () => next);
}

export function markSessionViewed(metadata: AppMetadata, key: SessionKey, viewedAt: string): AppMetadata {
  return upsertSessionLifecycle(metadata, key, (current) => {
    const next: SessionLifecycleRecord = {
      ...current,
      lastViewedAt: viewedAt,
    };
    delete next.lastOutcome;
    delete next.lastOutcomeAt;
    return next;
  });
}

export function recordSessionOutcome(
  metadata: AppMetadata,
  key: SessionKey,
  outcome: SessionOutcome,
  occurredAt: string,
): AppMetadata {
  return upsertSessionLifecycle(metadata, key, (current) => ({
    ...current,
    lastOutcome: outcome,
    lastOutcomeAt: occurredAt,
  }));
}

export function pruneOrphanSessionLifecycle(
  metadata: AppMetadata,
  existing: readonly SessionKey[],
): AppMetadata {
  const known = existing.filter(isSessionKey);
  const sessionLifecycle = metadata.sessionLifecycle.filter((entry) =>
    known.some((candidate) => sessionKeyEquals(candidate, entry)),
  );
  if (sessionLifecycle.length === metadata.sessionLifecycle.length) {
    return metadata;
  }
  return { ...metadata, sessionLifecycle };
}

export function setEnabledSkillSources(metadata: AppMetadata, sourceIds: readonly string[]): AppMetadata {
  return {
    ...metadata,
    enabledSkillSources: parseEnabledSkillSources(sourceIds),
  };
}

export function setGitHubMcpEnabled(metadata: AppMetadata, enabled: boolean): AppMetadata {
  if (metadata.githubMcpEnabled === enabled) {
    return metadata;
  }
  return { ...metadata, githubMcpEnabled: enabled };
}

export function setGitHubMcpAccountLogin(metadata: AppMetadata, login: string | undefined): AppMetadata {
  const parsed = parseGitHubAccountLogin(login);
  if (parsed === metadata.githubMcpAccountLogin) {
    return metadata;
  }
  const next = { ...metadata };
  if (parsed) {
    next.githubMcpAccountLogin = parsed;
  } else {
    delete next.githubMcpAccountLogin;
  }
  return next;
}

export function forgetSessionLifecycle(metadata: AppMetadata, key: SessionKey): AppMetadata {
  const sessionLifecycle = metadata.sessionLifecycle.filter((entry) => !sessionKeyEquals(entry, key));
  if (sessionLifecycle.length === metadata.sessionLifecycle.length) {
    return metadata;
  }
  const next = { ...metadata, sessionLifecycle };
  if (
    metadata.selectedSessionId === key.sessionId &&
    (metadata.selectedWorkspaceId === undefined || metadata.selectedWorkspaceId === key.workspaceId)
  ) {
    return selectSession(next, undefined);
  }
  return next;
}

/** Drop a recent project and its session-lifecycle annotations. The folder on disk is unchanged. */
export function forgetWorkspace(metadata: AppMetadata, workspaceId: string): AppMetadata {
  const recentWorkspaces = metadata.recentWorkspaces.filter((entry) => entry.id !== workspaceId);
  if (recentWorkspaces.length === metadata.recentWorkspaces.length) {
    return metadata;
  }
  const next: AppMetadata = {
    ...metadata,
    recentWorkspaces,
    sessionLifecycle: metadata.sessionLifecycle.filter((entry) => entry.workspaceId !== workspaceId),
    trustedPermissionWorkspaceIds: metadata.trustedPermissionWorkspaceIds.filter((id) => id !== workspaceId),
  };
  if (next.selectedWorkspaceId === workspaceId) {
    delete next.selectedWorkspaceId;
    delete next.selectedSessionId;
  }
  return next;
}

function upsertSessionLifecycle(
  metadata: AppMetadata,
  key: SessionKey,
  update: (current: SessionLifecycleRecord) => SessionLifecycleRecord,
): AppMetadata {
  if (!isSessionKey(key)) {
    return metadata;
  }
  const index = metadata.sessionLifecycle.findIndex((entry) => sessionKeyEquals(entry, key));
  const current: SessionLifecycleRecord =
    index >= 0 ? metadata.sessionLifecycle[index]! : { workspaceId: key.workspaceId, sessionId: key.sessionId };
  const next = update(current);
  const sessionLifecycle =
    index >= 0
      ? metadata.sessionLifecycle.map((entry, entryIndex) => (entryIndex === index ? next : entry))
      : [...metadata.sessionLifecycle, next];
  return { ...metadata, sessionLifecycle };
}

function parseEnabledSkillSources(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (isExternalSkillSourceId(entry)) {
      seen.add(entry);
    }
  }
  return [...seen];
}

function parseGitHubAccountLogin(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const login = value.trim();
  if (login.length === 0 || login.length > MAX_GITHUB_MCP_LOGIN_CHARS) {
    return undefined;
  }
  if (/^(github_pat_|ghp_|gho_|ghu_|ghs_|ghr_)/u.test(login) || login.includes(" ")) {
    return undefined;
  }
  return login;
}

function parseSessionLifecycle(value: unknown): SessionLifecycleRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const records: SessionLifecycleRecord[] = [];
  for (const entry of value) {
    const parsed = parseLifecycleRecord(entry);
    if (parsed) {
      records.push(parsed);
    }
  }
  return records;
}

function parseLifecycleRecord(value: unknown): SessionLifecycleRecord | undefined {
  if (!isSessionKey(value)) {
    return undefined;
  }
  const candidate = value as SessionLifecycleRecord & Record<string, unknown>;
  const record: SessionLifecycleRecord = {
    workspaceId: candidate.workspaceId,
    sessionId: candidate.sessionId,
  };
  if (typeof candidate.archivedAt === "string" && candidate.archivedAt.trim() !== "") {
    record.archivedAt = candidate.archivedAt;
  }
  if (typeof candidate.lastViewedAt === "string" && candidate.lastViewedAt.trim() !== "") {
    record.lastViewedAt = candidate.lastViewedAt;
  }
  if (isSessionOutcome(candidate.lastOutcome)) {
    record.lastOutcome = candidate.lastOutcome;
  }
  if (typeof candidate.lastOutcomeAt === "string" && candidate.lastOutcomeAt.trim() !== "") {
    record.lastOutcomeAt = candidate.lastOutcomeAt;
  }
  return record;
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
