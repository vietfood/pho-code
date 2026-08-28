import type { AgentSession, FauxProviderHandle, SessionInfo } from "@pho-agent/runtime/feature-api";
import {
  sessionCatalogCopy,
  type ModelSummary,
  type SessionSummary,
  type WorkspaceSummary,
} from "@pho-code/protocol";
import { filterCursorModelsUnlessAuthenticated } from "./cursor-sdk-policy";
import { projectModelSummary } from "./model-summary";
import { firstUserText } from "./transcript";
import { displayNameForPath } from "./workspace-path";
import type { WorkspaceCatalog, WorkspaceCatalogCache } from "./workspace-catalog-cache";

const NO_AUTHENTICATED_MODEL =
  "No authenticated model is available. Sign in to a provider account in Settings.";

export interface ModelListing {
  models: ModelSummary[];
  modelError?: string;
}

/** The model surface this port needs; narrower than Pi's full runtime. */
export interface CatalogModelRuntime {
  getAvailable(): Promise<readonly Parameters<typeof projectModelSummary>[0][]>;
}

/** A resident controller, as the catalog sees it when overlaying live sessions. */
export interface CatalogResidentSession {
  key: { workspaceId: string };
  runtime: { session: AgentSession };
}

export function liveSessionSummary(workspaceId: string, session: AgentSession): SessionSummary {
  const catalog = sessionCatalogCopy(session.sessionName, firstUserText(session.messages));
  return {
    id: session.sessionId,
    workspaceId,
    title: catalog.title,
    updatedAt: new Date().toISOString(),
    ...(catalog.preview ? { preview: catalog.preview } : {}),
  };
}

export function sessionSummaryFromInfo(workspaceId: string, info: SessionInfo): SessionSummary {
  const catalog = sessionCatalogCopy(info.name, info.firstMessage);
  return {
    id: info.id,
    workspaceId,
    title: catalog.title,
    updatedAt: info.modified.toISOString(),
    ...(catalog.preview ? { preview: catalog.preview } : {}),
  };
}

export function mergeActiveSession(sessions: SessionSummary[], active: SessionSummary): SessionSummary[] {
  if (sessions.some((session) => session.id === active.id)) {
    return sessions.map((session) => (session.id === active.id ? { ...session, ...active } : session));
  }
  return [active, ...sessions];
}

export interface WorkspaceCatalogPort {
  /**
   * The advertised model catalog. Never throws: a provider failure becomes a
   * `modelError` the snapshot can show, because an unusable catalog must still
   * render a session rather than fail the command that asked for one.
   */
  listModels(): Promise<ModelListing>;
  listSessions(cwd: string): Promise<SessionSummary[]>;
  workspaceSummary(cwd: string): WorkspaceSummary;
  /** Overlay resident controllers onto the on-disk listing for one workspace. */
  mergeResidentSessions(sessions: SessionSummary[], workspaceId: string): SessionSummary[];
  resolve(workspacePath: string, refreshCatalog: boolean): Promise<WorkspaceCatalog>;
  clear(): void;
}

/**
 * Owns the model and session catalog for a workspace.
 *
 * Extracted from `createPhoCodeRuntime` as a named seam rather than as a
 * relocated cluster. It reads the model runtime, the deterministic test
 * provider, and two narrow views of runtime state, so it can be constructed
 * once and exercised without a Pi session — the model listing's Cursor
 * filtering, empty-catalog message, and provider-failure fallback previously
 * had no way to be tested at all.
 */
export function createWorkspaceCatalogPort(deps: {
  modelRuntime: CatalogModelRuntime;
  testProvider?: FauxProviderHandle | undefined;
  cache: WorkspaceCatalogCache;
  listSessionInfos(cwd: string): Promise<readonly SessionInfo[]>;
  listResident(): readonly CatalogResidentSession[];
  isProjectApproved(cwd: string): boolean;
  cursorAuthenticated(): Promise<boolean>;
}): WorkspaceCatalogPort {
  async function listModels(): Promise<ModelListing> {
    const testProvider = deps.testProvider;
    if (testProvider) {
      return { models: [projectModelSummary(testProvider.getModel())] };
    }
    try {
      const available = await deps.modelRuntime.getAvailable();
      const models = filterCursorModelsUnlessAuthenticated(
        available.map((model) => projectModelSummary(model)),
        await deps.cursorAuthenticated(),
      );
      return models.length === 0 ? { models, modelError: NO_AUTHENTICATED_MODEL } : { models };
    } catch (error) {
      return {
        models: [],
        modelError: error instanceof Error ? error.message : "Unable to list models.",
      };
    }
  }

  async function listSessions(cwd: string): Promise<SessionSummary[]> {
    const infos = await deps.listSessionInfos(cwd);
    return infos.map((info) => sessionSummaryFromInfo(cwd, info));
  }

  return {
    listModels,
    listSessions,
    workspaceSummary(cwd) {
      return {
        id: cwd,
        path: cwd,
        displayName: displayNameForPath(cwd),
        lastOpenedAt: new Date().toISOString(),
        projectResourcesApproved: deps.isProjectApproved(cwd),
      };
    },
    mergeResidentSessions(sessions, workspaceId) {
      let merged = sessions;
      for (const live of deps.listResident()) {
        if (live.key.workspaceId !== workspaceId) {
          continue;
        }
        merged = mergeActiveSession(merged, liveSessionSummary(workspaceId, live.runtime.session));
      }
      return merged;
    },
    async resolve(workspacePath, refreshCatalog) {
      if (!refreshCatalog) {
        const cached = deps.cache.get(workspacePath);
        if (cached) {
          return cached;
        }
      }
      const { models, modelError } = await listModels();
      const sessions = await listSessions(workspacePath);
      return deps.cache.set(workspacePath, { models, sessions, ...(modelError ? { modelError } : {}) });
    },
    clear() {
      deps.cache.clear();
    },
  };
}
