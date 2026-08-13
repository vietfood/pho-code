import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { validateTrashTarget } from "../src/trash-target";
import { createOsTrashRemovalService } from "../src/recoverable-removal";

async function makeWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-test-"));
  const workspace = path.join(root, "workspace");
  const agentDir = path.join(root, "agent");
  const appData = path.join(root, "app-data");
  await mkdir(workspace);
  await mkdir(agentDir);
  await mkdir(appData);
  return { root, workspace, agentDir, appData };
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

describe("trash target validation", () => {
  test("accepts an owned workspace file", async () => {
    const { root, workspace, agentDir, appData } = await makeWorkspace();
    try {
      const filePath = path.join(workspace, "notes.txt");
      await writeFile(filePath, "ok\n");
      const target = await validateTrashTarget("notes.txt", {
        workspacePath: workspace,
        agentDir,
        applicationDataDir: appData,
      });
      expect(target.canonicalPath).toBe(await realpath(filePath));
      expect(target.workspaceRelative).toBe("notes.txt");
    } finally {
      await trashRoot(root);
    }
  });

  test("refuses workspace root, filesystem root, missing paths, and outside paths", async () => {
    const { root, workspace, agentDir } = await makeWorkspace();
    try {
      await expect(validateTrashTarget(workspace, { workspacePath: workspace, agentDir })).rejects.toThrow(/workspace root/);
      await expect(validateTrashTarget("/", { workspacePath: workspace, agentDir })).rejects.toThrow(/outside|root/);
      await expect(validateTrashTarget("missing.txt", { workspacePath: workspace, agentDir })).rejects.toThrow(/does not exist/);
      await expect(validateTrashTarget(agentDir, { workspacePath: workspace, agentDir })).rejects.toThrow(/outside|protected/);
    } finally {
      await trashRoot(root);
    }
  });

  test("refuses reference submodules and agent-data files", async () => {
    const { root, workspace, agentDir, appData } = await makeWorkspace();
    try {
      const submodule = path.join(workspace, "refs", "pi-gui");
      await mkdir(submodule, { recursive: true });
      await writeFile(path.join(submodule, "README.md"), "ref\n");
      await expect(
        validateTrashTarget(path.join("refs", "pi-gui", "README.md"), { workspacePath: workspace, agentDir }),
      ).rejects.toThrow(/Reference submodules/);

      const nestedAgent = path.join(workspace, "agent-data");
      await mkdir(nestedAgent);
      await writeFile(path.join(nestedAgent, "auth.json"), "{}\n");
      await expect(
        validateTrashTarget(path.join("agent-data", "auth.json"), {
          workspacePath: workspace,
          agentDir: nestedAgent,
          applicationDataDir: appData,
        }),
      ).rejects.toThrow(/protected/);
    } finally {
      await trashRoot(root);
    }
  });

  test("refuses a path that canonicalizes outside the workspace through a directory symlink", async () => {
    const { root, workspace, agentDir } = await makeWorkspace();
    try {
      const outside = path.join(root, "secret.txt");
      await writeFile(outside, "nope\n");
      const aliasDir = path.join(workspace, "alias");
      await symlink(root, aliasDir);
      await expect(validateTrashTarget(path.join("alias", "secret.txt"), { workspacePath: workspace, agentDir })).rejects.toThrow(
        /outside/,
      );
    } finally {
      await trashRoot(root);
    }
  });
});
