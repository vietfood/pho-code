import { describe, expect, test } from "bun:test";
import type { SessionInfo } from "@pho-agent/runtime/feature-api";
import { createWorkspaceCatalogCache } from "../src/workspace-catalog-cache";
import {
  createWorkspaceCatalogPort,
  mergeActiveSession,
  sessionSummaryFromInfo,
  type CatalogResidentSession,
} from "../src/workspace-catalog";

const COST = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 };
const ANTHROPIC = { provider: "anthropic", id: "claude-opus-5", contextWindow: 200_000, cost: COST };
const CURSOR = { provider: "cursor", id: "composer-1.5", contextWindow: 100_000, cost: COST };

function info(id: string, name?: string): SessionInfo {
  return {
    id,
    path: `/tmp/ws/.pi/${id}.jsonl`,
    modified: new Date("2026-08-28T00:00:00.000Z"),
    ...(name ? { name } : {}),
  } as SessionInfo;
}

function portFor(overrides: Partial<Parameters<typeof createWorkspaceCatalogPort>[0]> = {}) {
  return createWorkspaceCatalogPort({
    modelRuntime: { getAvailable: async () => [ANTHROPIC] },
    cache: createWorkspaceCatalogCache(),
    listSessionInfos: async () => [info("s1")],
    listResident: () => [],
    isProjectApproved: () => true,
    cursorAuthenticated: async () => false,
    ...overrides,
  });
}

describe("workspace catalog port", () => {
  test("hides Cursor models until the owner has credentials", async () => {
    const runtime = { getAvailable: async () => [ANTHROPIC, CURSOR] };

    const hidden = await portFor({ modelRuntime: runtime }).listModels();
    expect(hidden.models.map((model) => model.provider)).toEqual(["anthropic"]);

    const shown = await portFor({ modelRuntime: runtime, cursorAuthenticated: async () => true }).listModels();
    expect(shown.models.map((model) => model.provider)).toEqual(["anthropic", "cursor"]);
  });

  test("reports an empty catalog as a sign-in prompt rather than an error", async () => {
    const result = await portFor({ modelRuntime: { getAvailable: async () => [] } }).listModels();
    expect(result.models).toEqual([]);
    expect(result.modelError).toContain("Sign in to a provider account");
  });

  test("turns a provider failure into a modelError instead of throwing", async () => {
    const result = await portFor({
      modelRuntime: {
        getAvailable: async () => {
          throw new Error("provider unreachable");
        },
      },
    }).listModels();
    expect(result.models).toEqual([]);
    expect(result.modelError).toBe("provider unreachable");
  });

  test("advertises only the deterministic test model when one is registered", async () => {
    const port = portFor({
      testProvider: { getModel: () => ANTHROPIC } as never,
      modelRuntime: {
        getAvailable: async () => {
          throw new Error("must not be consulted");
        },
      },
    });
    const result = await port.listModels();
    expect(result.models).toHaveLength(1);
    expect(result.modelError).toBeUndefined();
  });

  test("serves a cached catalog until a refresh is requested", async () => {
    let listings = 0;
    const port = portFor({
      listSessionInfos: async () => {
        listings += 1;
        return [info("s1")];
      },
    });

    await port.resolve("/tmp/ws", true);
    await port.resolve("/tmp/ws", false);
    expect(listings).toBe(1);

    await port.resolve("/tmp/ws", true);
    expect(listings).toBe(2);

    port.clear();
    await port.resolve("/tmp/ws", false);
    expect(listings).toBe(3);
  });

  test("marks a workspace summary with its project-trust decision", () => {
    expect(portFor().workspaceSummary("/tmp/ws").projectResourcesApproved).toBe(true);
    expect(portFor({ isProjectApproved: () => false }).workspaceSummary("/tmp/ws").projectResourcesApproved).toBe(false);
  });

  test("overlays resident controllers onto the on-disk listing for their own workspace only", () => {
    const resident = (workspaceId: string, sessionId: string): CatalogResidentSession => ({
      key: { workspaceId },
      runtime: {
        session: { sessionId, sessionName: `live ${sessionId}`, messages: [] } as never,
      },
    });
    const port = portFor({ listResident: () => [resident("/tmp/ws", "s1"), resident("/tmp/other", "s9")] });

    const merged = port.mergeResidentSessions([sessionSummaryFromInfo("/tmp/ws", info("s1", "stored"))], "/tmp/ws");

    expect(merged).toHaveLength(1);
    expect(merged[0]?.title).toBe("live s1");
  });

  test("mergeActiveSession replaces a listed session and prepends an unlisted one", () => {
    const stored = { id: "s1", workspaceId: "/tmp/ws", title: "stored", updatedAt: "2026-08-28T00:00:00.000Z" };
    const live = { id: "s1", workspaceId: "/tmp/ws", title: "live", updatedAt: "2026-08-28T01:00:00.000Z" };
    expect(mergeActiveSession([stored], live)).toEqual([live]);

    const fresh = { ...live, id: "s2" };
    expect(mergeActiveSession([stored], fresh).map((entry) => entry.id)).toEqual(["s2", "s1"]);
  });
});
