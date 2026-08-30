import { mkdir, stat } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  ModelRuntime,
  SessionManager,
  SettingsManager,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  type AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
} from "@earendil-works/pi-coding-agent";
import { TEST_PROMPT, TEST_TOOL_NAME, createDeterministicTestProvider, createHarnessMarkTool } from "../src/test-model";
import { projectMessages } from "../src/transcript";

async function makeIsolatedDirs() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-session-id-"));
  const agentDir = path.join(root, "agent");
  const workspaceDir = path.join(root, "workspace");
  await mkdir(agentDir);
  await mkdir(workspaceDir);
  return { agentDir, workspaceDir };
}

async function createSharedRuntimePair(agentDir: string, cwd: string) {
  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(agentDir, "auth.json"),
    modelsPath: path.join(agentDir, "models.json"),
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  const testProvider = createDeterministicTestProvider();
  modelRuntime.registerNativeProvider(testProvider.provider);
  const testTool = createHarnessMarkTool();

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd: runtimeCwd,
    agentDir: runtimeAgentDir,
    sessionManager,
    sessionStartEvent,
  }) => {
    const services = await createAgentSessionServices({
      cwd: runtimeCwd,
      agentDir: runtimeAgentDir,
      modelRuntime,
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: false },
      }),
      resourceLoaderOptions: {
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
      },
    });
    return {
      ...(await createAgentSessionFromServices({
        services,
        sessionManager,
        sessionStartEvent,
        model: testProvider.getModel(),
        thinkingLevel: "off",
        customTools: [testTool],
        tools: [TEST_TOOL_NAME, "bash", "read", "write", "edit", "ls", "grep", "find"],
      })),
      services,
      diagnostics: services.diagnostics,
    };
  };

  const first = await createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir,
    sessionManager: SessionManager.create(cwd),
  });
  const second = await createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir,
    sessionManager: SessionManager.create(cwd),
  });
  return { first, second, modelRuntime };
}

function userText(runtime: AgentSessionRuntime): string {
  return projectMessages(runtime.session.messages)
    .filter((message) => message.role === "user")
    .flatMap((message) => message.blocks)
    .map((block) => (block.type === "text" ? block.text : ""))
    .join(" ");
}

async function promptAndWait(runtime: AgentSessionRuntime, text: string): Promise<void> {
  await runtime.session.prompt(text, { source: "interactive" });
}

describe("Pi 0.84.4 session identity", () => {
  test("two independent runtimes share ModelRuntime, persist distinct JSONL artifacts, and dispose without cross-talk", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    const { first, second, modelRuntime } = await createSharedRuntimePair(agentDir, workspaceDir);
    let reopened: AgentSessionRuntime | undefined;

    try {
      expect(first.session.sessionId).not.toBe(second.session.sessionId);
      expect(first.cwd).toBe(workspaceDir);
      expect(second.cwd).toBe(workspaceDir);

      await promptAndWait(first, TEST_PROMPT.useTool);
      await promptAndWait(second, "hello from the second chat");

      const listed = await SessionManager.list(workspaceDir);
      expect(listed).toHaveLength(2);
      const firstInfo = listed.find((entry) => entry.id === first.session.sessionId);
      const secondInfo = listed.find((entry) => entry.id === second.session.sessionId);
      expect(firstInfo).toBeDefined();
      expect(secondInfo).toBeDefined();
      expect(firstInfo?.path).not.toBe(secondInfo?.path);

      const firstStats = await stat(firstInfo!.path);
      const secondStats = await stat(secondInfo!.path);
      expect(firstStats.isFile()).toBe(true);
      expect(secondStats.isFile()).toBe(true);
      expect(firstInfo!.path.startsWith(agentDir)).toBe(true);
      expect(secondInfo!.path.startsWith(agentDir)).toBe(true);
      expect(firstInfo!.path.endsWith(".jsonl")).toBe(true);
      expect(path.dirname(firstInfo!.path)).toBe(path.dirname(secondInfo!.path));
      expect(first.session.sessionManager.getCwd()).toBe(workspaceDir);

      expect(userText(first)).toContain("USE_TOOL");
      expect(userText(second)).toContain("hello from the second chat");
      expect(userText(first)).not.toContain("hello from the second chat");
      expect(userText(second)).not.toContain("USE_TOOL");

      await first.dispose();
      expect(second.session.sessionId).toBe(secondInfo!.id);
      await promptAndWait(second, "still alive");
      expect(userText(second)).toContain("still alive");

      await second.dispose();
      reopened = await createAgentSessionRuntime(
        async (input) => {
          const services = await createAgentSessionServices({
            cwd: input.cwd,
            agentDir: input.agentDir,
            modelRuntime,
            settingsManager: SettingsManager.inMemory({
              compaction: { enabled: false },
              retry: { enabled: false },
            }),
            resourceLoaderOptions: {
              noExtensions: true,
              noSkills: true,
              noPromptTemplates: true,
              noThemes: true,
            },
          });
          return {
            ...(await createAgentSessionFromServices({
              services,
              sessionManager: input.sessionManager,
              sessionStartEvent: input.sessionStartEvent,
            })),
            services,
            diagnostics: services.diagnostics,
          };
        },
        {
          cwd: workspaceDir,
          agentDir,
          sessionManager: SessionManager.open(secondInfo!.path),
        },
      );
      expect(reopened.session.sessionId).toBe(secondInfo!.id);
      expect(userText(reopened)).toContain("hello from the second chat");
      expect(userText(reopened)).toContain("still alive");
    } finally {
      await reopened?.dispose();
      if (previousAgentDir === undefined) {
        delete process.env.PI_CODING_AGENT_DIR;
      } else {
        process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      }
    }
  }, 60_000);
});
