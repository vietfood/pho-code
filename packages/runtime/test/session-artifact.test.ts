import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { HARNESS_ERROR_CODES } from "@pho-code/protocol";
import { createOsTrashRemovalService } from "../src/recoverable-removal";
import { validateSessionArtifact } from "../src/session-artifact";

async function makeDirs() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-session-artifact-"));
  const workspace = path.join(root, "workspace");
  const agentDir = path.join(root, "agent");
  const sessions = path.join(agentDir, "sessions");
  const appData = path.join(root, "app-data");
  await mkdir(workspace);
  await mkdir(sessions, { recursive: true });
  await mkdir(appData);
  return { root, workspace, agentDir, sessions, appData };
}

async function trashRoot(root: string): Promise<void> {
  try {
    const removal = createOsTrashRemovalService();
    await removal.moveToTrash({
      canonicalPath: root,
      workspacePath: path.dirname(root),
      signal: new AbortController().signal,
    });
  } catch {
    // Best-effort cleanup; sandboxed test runners may lack Trash permission.
  }
}

describe("session artifact validation", () => {
  test("accepts a regular JSONL file under the agent session directory", async () => {
    const dirs = await makeDirs();
    try {
      const artifact = path.join(dirs.sessions, "s1.jsonl");
      await writeFile(artifact, '{"type":"session"}\n');
      const validated = await validateSessionArtifact(artifact, "s1", {
        agentDir: dirs.agentDir,
        workspacePath: dirs.workspace,
        applicationDataDir: dirs.appData,
      });
      expect(validated.sessionId).toBe("s1");
      expect(validated.canonicalPath).toBe(await realpath(artifact));
      expect(validated.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    } finally {
      await trashRoot(dirs.root);
    }
  });

  test("rejects a symlink, workspace file, agent root, and directory", async () => {
    const dirs = await makeDirs();
    try {
      const artifact = path.join(dirs.sessions, "s1.jsonl");
      await writeFile(artifact, "x\n");
      const linked = path.join(dirs.sessions, "link.jsonl");
      await symlink(artifact, linked);
      await expect(
        validateSessionArtifact(linked, "s1", {
          agentDir: dirs.agentDir,
          workspacePath: dirs.workspace,
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.sessionArtifactInvalid });

      const workspaceFile = path.join(dirs.workspace, "notes.jsonl");
      await writeFile(workspaceFile, "x\n");
      await expect(
        validateSessionArtifact(workspaceFile, "s1", {
          agentDir: dirs.agentDir,
          workspacePath: dirs.workspace,
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.sessionArtifactInvalid });

      await expect(
        validateSessionArtifact(dirs.agentDir, "s1", {
          agentDir: dirs.agentDir,
          workspacePath: dirs.workspace,
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.sessionArtifactInvalid });

      await expect(
        validateSessionArtifact(dirs.sessions, "s1", {
          agentDir: dirs.agentDir,
          workspacePath: dirs.workspace,
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.sessionArtifactInvalid });
    } finally {
      await trashRoot(dirs.root);
    }
  });

  test("rejects a file reached through a directory symlink that leaves the agent dir", async () => {
    const dirs = await makeDirs();
    try {
      const outside = path.join(dirs.workspace, "escaped.jsonl");
      await writeFile(outside, "x\n");
      const trap = path.join(dirs.agentDir, "trap");
      await symlink(dirs.workspace, trap);
      await expect(
        validateSessionArtifact(path.join(trap, "escaped.jsonl"), "s1", {
          agentDir: dirs.agentDir,
          workspacePath: dirs.workspace,
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.sessionArtifactInvalid });
    } finally {
      await trashRoot(dirs.root);
    }
  });
});
