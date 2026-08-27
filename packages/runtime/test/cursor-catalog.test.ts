import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { HARNESS_ERROR_CODES } from "@pho-code/protocol";
import { CURSOR_API_KEY_ENV_VAR } from "../src/cursor-sdk-policy";
import { createPhoCodeRuntime } from "../src/pi-runtime";

async function makeIsolatedDirs() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-cursor-catalog-"));
  const agentDir = path.join(root, "agent");
  const workspaceDir = path.join(root, "workspace");
  await mkdir(agentDir);
  await mkdir(workspaceDir);
  return { agentDir, workspaceDir };
}

async function withoutCursorApiKey<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env[CURSOR_API_KEY_ENV_VAR];
  delete process.env[CURSOR_API_KEY_ENV_VAR];
  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env[CURSOR_API_KEY_ENV_VAR];
    } else {
      process.env[CURSOR_API_KEY_ENV_VAR] = previous;
    }
  }
}

describe("cursor model catalog", () => {
  test(
    "hides Cursor models until an API key is imported, then hides them again after logout",
    async () => {
      await withoutCursorApiKey(async () => {
        const { agentDir, workspaceDir } = await makeIsolatedDirs();
        const runtime = await createPhoCodeRuntime({ agentDir });
        try {
          const workspace = await runtime.inspectWorkspace({
            path: workspaceDir,
            approveProjectResources: true,
          });
          const created = await runtime.createSession(workspace.workspace.id);
          expect(created.models.some((model) => model.provider === "cursor")).toBe(false);
          expect(created.model?.provider).not.toBe("cursor");

          const before = await runtime.listProviderAccounts();
          expect(before.providers.find((provider) => provider.id === "cursor")).toMatchObject({
            configured: false,
          });

          const secret = "key_pho_code_cursor_catalog_test";
          await runtime.importProviderApiKey({ providerId: "cursor", apiKey: secret });
          const afterImport = await runtime.getSessionSnapshot({
            workspaceId: created.workspace.id,
            sessionId: created.session.id,
          });
          const cursorModels = afterImport.models.filter((model) => model.provider === "cursor");
          expect(cursorModels.length).toBeGreaterThan(0);

          const selected = cursorModels[0]!;
          const switched = await runtime.setSessionModel({
            sessionId: created.session.id,
            provider: selected.provider,
            id: selected.id,
          });
          expect(switched.model).toMatchObject({ provider: "cursor", id: selected.id });

          await runtime.logoutProvider({ providerId: "cursor" });
          const afterLogout = await runtime.getSessionSnapshot({
            workspaceId: created.workspace.id,
            sessionId: created.session.id,
          });
          expect(afterLogout.models.some((model) => model.provider === "cursor")).toBe(false);
          expect(afterLogout.model?.provider).not.toBe("cursor");
          await expect(
            runtime.setSessionModel({
              sessionId: created.session.id,
              provider: selected.provider,
              id: selected.id,
            }),
          ).rejects.toMatchObject({
            code: HARNESS_ERROR_CODES.noAuthenticatedModel,
          });
        } finally {
          await runtime.dispose();
        }
      });
    },
    60_000,
  );
});
