import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { HARNESS_ERROR_CODES, RUNTIME_EVENT_TYPES, type RuntimeEvent } from "@pho-code/protocol";
import {
  PERMISSION_FEATURE_ID,
  TEST_PROMPT,
  TEST_TOOL_NAME,
  TRASH_FEATURE_ID,
  createDefaultFeatureManifest,
  createPhoCodeRuntime,
  createUnsupportedHostUiExtension,
  type RecoverableRemovalService,
} from "../src/index";

async function makeIsolatedDirs() {
  const root = await mkdtemp(path.join(tmpdir(), "pho-code-test-"));
  const agentDir = path.join(root, "agent");
  const workspaceDir = path.join(root, "workspace");
  await mkdir(agentDir);
  await mkdir(workspaceDir);
  return { agentDir, workspaceDir };
}

async function createTestRuntime(
  agentDir: string,
  options: {
    testHostUi?: boolean;
    useDefaultManifest?: boolean;
    removalService?: RecoverableRemovalService;
  } = {},
) {
  return createPhoCodeRuntime({
    agentDir,
    deterministicTestModel: true,
    ...(options.testHostUi ? { testHostUi: true } : {}),
    ...(options.useDefaultManifest ? { featureManifest: createDefaultFeatureManifest() } : {}),
    ...(options.removalService ? { removalService: options.removalService } : {}),
  });
}

const DIALOG_EXTENSION = `export default function harnessDialog(pi) {
  pi.registerCommand("harness-confirm", {
    description: "Open the representative harness confirm dialog",
    handler: async (_args, ctx) => {
      const confirmed = await ctx.ui.confirm("Confirm harness action?", "Approve this representative dialog.");
      ctx.ui.notify(confirmed ? "Confirm accepted" : "Confirm rejected", "info");
    },
  });
}
`;

const SKILL_MARKDOWN = `---
name: harness-note
description: A representative skill for the harness resource slice.
---

Leave a short note when this skill is relevant.
`;

async function writeProjectFeatureFixture(workspaceDir: string): Promise<void> {
  await mkdir(path.join(workspaceDir, ".pi", "extensions"), { recursive: true });
  await mkdir(path.join(workspaceDir, ".agents", "skills", "harness-note"), { recursive: true });
  await writeFile(path.join(workspaceDir, "AGENTS.md"), "# Workspace instructions\n");
  await writeFile(path.join(workspaceDir, ".pi", "extensions", "harness-dialog.ts"), DIALOG_EXTENSION);
  await writeFile(
    path.join(workspaceDir, ".pi", "extensions", "harness-broken.ts"),
    "throw new Error('intentional harness diagnostic');\n",
  );
  await writeFile(path.join(workspaceDir, ".agents", "skills", "harness-note", "SKILL.md"), SKILL_MARKDOWN);
}

describe("Pi harness runtime", () => {
  test("creates a persistent session, streams a tool run, and reconstructs the transcript on reopen", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createTestRuntime(agentDir);
    const events: RuntimeEvent[] = [];

    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      expect(workspace.models).toEqual([
        {
          provider: "harness-test",
          id: "slice",
          name: "Harness test model",
          contextWindow: 32_000,
          cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
        },
      ]);

      const created = await runtime.createSession(workspace.workspace.id);
      expect(created.messages).toEqual([]);
      expect(created.usage).toEqual({
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
        costUsd: 0,
      });
      expect(created.contextUsage?.contextWindow).toBe(32_000);
      expect(created.sessions.some((session) => session.id === created.session.id)).toBe(true);
      expect(created.thinkingLevel).toBeDefined();
      expect(created.availableThinkingLevels.length).toBeGreaterThan(0);
      const listedWithoutSwap = await runtime.listWorkspaceSessions(workspace.workspace.id);
      expect(listedWithoutSwap.some((session) => session.id === created.session.id)).toBe(true);
      const nextThinking = created.availableThinkingLevels.includes("off")
        ? "off"
        : created.availableThinkingLevels[0]!;
      const afterThinking = await runtime.setThinkingLevel({
        sessionId: created.session.id,
        level: nextThinking,
      });
      expect(afterThinking.session.id).toBe(created.session.id);
      expect(afterThinking.thinkingLevel).toBe(nextThinking);
      expect(afterThinking.models).toEqual(created.models);
      expect(afterThinking.supportsThinking).toBe(created.supportsThinking);
      const afterModel = await runtime.setSessionModel({
        sessionId: created.session.id,
        provider: created.model!.provider,
        id: created.model!.id,
      });
      expect(afterModel.model).toEqual(created.model);
      expect(afterModel.models).toEqual(created.models);
      expect(afterModel.thinkingLevel).toBe(nextThinking);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });

      const admission = await runtime.sendPrompt({
        sessionId: created.session.id,
        text: TEST_PROMPT.useTool,
      });
      expect(admission.admitted).toBe(true);
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled);

      const types = events.map((event) => event.type);
      const admittedAt = types.indexOf(RUNTIME_EVENT_TYPES.runAdmitted);
      const settledAt = types.indexOf(RUNTIME_EVENT_TYPES.runSettled);
      expect(admittedAt).toBeGreaterThan(-1);
      expect(settledAt).toBeGreaterThan(admittedAt);
      expect(types.slice(0, admittedAt)).toContain(RUNTIME_EVENT_TYPES.sessionSnapshot);
      expect(types.slice(admittedAt, settledAt)).toContain(RUNTIME_EVENT_TYPES.toolEvent);
      expect(types.slice(settledAt + 1)).not.toContain(RUNTIME_EVENT_TYPES.runFailed);

      const afterTool = await runtime.openSession(workspace.workspace.id, created.session.id);
      expect(afterTool.usage).toBeDefined();
      expect(afterTool.usage!.total).toBeGreaterThan(0);
      expect(afterTool.contextUsage?.contextWindow).toBe(32_000);
      expect(afterTool.messages.some((message) => message.role === "user")).toBe(true);
      expect(
        afterTool.messages.some((message) =>
          message.blocks.some(
            (block) =>
              block.type === "tool" && block.name === TEST_TOOL_NAME && block.status === "completed",
          ),
        ),
      ).toBe(true);
      expect(afterTool.messages.some((message) => message.blocks.some((block) => block.type === "text" && block.text.includes("Tool completed.")))).toBe(
        true,
      );

      events.length = 0;
      const second = await runtime.sendPrompt({
        sessionId: created.session.id,
        text: "hello",
      });
      expect(second.admitted).toBe(true);
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled);
      const afterHello = await runtime.openSession(workspace.workspace.id, created.session.id);
      expect(
        afterHello.messages.some((message) =>
          message.blocks.some((block) => block.type === "text" && block.text.includes("Hello from the test model.")),
        ),
      ).toBe(true);
      stop();
    } finally {
      await runtime.dispose();
    }

    const reopened = await createTestRuntime(agentDir);
    try {
      const listed = await reopened.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      expect(listed.sessions.length).toBe(1);
      const sessionId = listed.sessions[0]?.id;
      expect(sessionId).toBeDefined();
      const resumed = await reopened.openSession(listed.workspace.id, sessionId ?? "");
      expect(resumed.messages.some((message) => message.role === "user")).toBe(true);
      expect(
        resumed.messages.some((message) =>
          message.blocks.some((block) => block.type === "text" && block.text.includes("Tool completed.")),
        ),
      ).toBe(true);
    } finally {
      await reopened.dispose();
    }
  }, 30_000);

  test("rewrites settled assistant text as a display overlay that survives reopen", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createTestRuntime(agentDir);
    const events: RuntimeEvent[] = [];

    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      const admission = await runtime.sendPrompt({
        sessionId: created.session.id,
        text: "hello",
      });
      expect(admission.admitted).toBe(true);
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled);
      stop();

      const settled = await runtime.openSession(workspace.workspace.id, created.session.id);
      const assistant = settled.messages.find(
        (message) =>
          message.role === "assistant" &&
          message.blocks.some((block) => block.type === "text" && block.text.includes("Hello from the test model.")),
      );
      expect(assistant).toBeDefined();
      const rewritten = await runtime.rewriteAssistantOutput({
        sessionId: created.session.id,
        messageId: assistant!.id,
        text: "Hello with $$x^2$$.",
      });
      const rewrittenBlock = rewritten.messages
        .find((message) => message.id === assistant!.id)
        ?.blocks.find((block) => block.type === "text");
      expect(rewrittenBlock).toMatchObject({
        type: "text",
        text: "Hello with $$x^2$$.",
        originalText: "Hello from the test model.",
      });
    } finally {
      await runtime.dispose();
    }

    const reopened = await createTestRuntime(agentDir);
    try {
      const listed = await reopened.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const sessionId = listed.sessions[0]?.id;
      expect(sessionId).toBeDefined();
      const resumed = await reopened.openSession(listed.workspace.id, sessionId ?? "");
      const rewrittenBlock = resumed.messages
        .filter((message) => message.role === "assistant")
        .flatMap((message) => message.blocks)
        .find((block) => block.type === "text" && block.text.includes("x^2"));
      expect(rewrittenBlock).toMatchObject({
        type: "text",
        text: "Hello with $$x^2$$.",
        originalText: "Hello from the test model.",
      });
      const assistant = resumed.messages.find((message) =>
        message.blocks.some((block) => block.type === "text" && block.originalText === "Hello from the test model."),
      );
      expect(assistant).toBeDefined();
      const restored = await reopened.rewriteAssistantOutput({
        sessionId: resumed.session.id,
        messageId: assistant!.id,
        text: "Hello from the test model.",
      });
      const restoredBlock = restored.messages
        .find((message) => message.id === assistant!.id)
        ?.blocks.find((block) => block.type === "text");
      expect(restoredBlock).toEqual({ type: "text", text: "Hello from the test model." });
    } finally {
      await reopened.dispose();
    }
  }, 30_000);

  test("rejects a missing session before admission and reports a model error after admission", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createTestRuntime(agentDir);
    const events: RuntimeEvent[] = [];

    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      await expect(
        runtime.sendPrompt({ sessionId: "missing", text: "hello" }),
      ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.sessionNotFound });

      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      const admission = await runtime.sendPrompt({
        sessionId: created.session.id,
        text: TEST_PROMPT.failAfter,
      });
      expect(admission.admitted).toBe(true);
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runFailed);
      expect(events.some((event) => event.type === RUNTIME_EVENT_TYPES.runFailed)).toBe(true);
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  test("abort settles the run and allows another prompt", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createTestRuntime(agentDir);
    const events: RuntimeEvent[] = [];

    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });

      const first = await runtime.sendPrompt({
        sessionId: created.session.id,
        text: TEST_PROMPT.abortMe,
      });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runAdmitted);
      await expect(
        runtime.sendPrompt({ sessionId: created.session.id, text: "hello" }),
      ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.sessionBusy });

      await runtime.abortRun({ sessionId: created.session.id, runId: first.runId });
      const settled = await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled);
      expect(settled.payload).toMatchObject({ run: { status: "cancelled" } });

      const second = await runtime.sendPrompt({
        sessionId: created.session.id,
        text: "hello",
      });
      expect(second.admitted).toBe(true);
      const completed = await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled, (event) => event.runId === second.runId);
      expect(completed.payload).toMatchObject({ run: { status: "settled" } });
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  test("steers an active run through Pi's native queue and rejects a stale run id", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createTestRuntime(agentDir);
    const events: RuntimeEvent[] = [];

    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      const first = await runtime.sendPrompt({
        sessionId: created.session.id,
        text: TEST_PROMPT.abortMe,
      });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runAdmitted);
      await expect(
        runtime.steerRun({ sessionId: created.session.id, runId: "stale", text: "nope" }),
      ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.invalidCommand });
      const steered = await runtime.steerRun({
        sessionId: created.session.id,
        runId: first.runId,
        text: "go left",
      });
      expect(steered.admitted).toBe(true);
      expect(steered.queue.steering.some((item) => item.text.includes("go left"))).toBe(true);
      await runtime.abortRun({ sessionId: created.session.id, runId: first.runId });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled);
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  test("rejects images on a text-only model before admission and keeps the draft id", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createTestRuntime(agentDir);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );

    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const created = await runtime.createSession(workspace.workspace.id);
      expect(created.model?.supportsImages).toBeUndefined();
      const prepared = await runtime.prepareImage({
        name: "dot.png",
        mimeType: "image/png",
        data: png.toString("base64"),
        width: 1,
        height: 1,
        previewDataUrl: `data:image/png;base64,${png.toString("base64")}`,
      });
      await expect(
        runtime.sendPrompt({
          sessionId: created.session.id,
          text: "describe this",
          imageIds: [prepared.id],
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.imagesUnsupported });
      await runtime.removePreparedImage({ imageId: prepared.id });
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  test("dispose ends subscriptions and refuses later prompts", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createTestRuntime(agentDir);
    let receivedAfterDispose = 0;
    const stop = runtime.subscribe(() => {
      receivedAfterDispose += 1;
    });

    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      await runtime.createSession(workspace.workspace.id);
      receivedAfterDispose = 0;
      await runtime.dispose();
      stop();
      expect(receivedAfterDispose).toBe(0);
      await expect(
        runtime.sendPrompt({ sessionId: "any", text: "hello" }),
      ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.shuttingDown });
    } finally {
      await runtime.dispose();
    }
  });

  test("project permission approval is process-lifetime in runtime and does not write trust.json", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    await mkdir(path.join(workspaceDir, ".pi", "extensions"), { recursive: true });
    const runtime = await createTestRuntime(agentDir);

    try {
      const remembered = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: false,
      });
      expect(remembered.workspace.projectResourcesApproved).toBe(false);
      const trusted = await runtime.trustProjectPermissionRules(workspaceDir);
      expect(trusted.projectPermissionRulesTrusted).toBe(true);
      const approved = await runtime.inspectWorkspace({ path: workspaceDir, approveProjectResources: false });
      expect(approved.workspace.projectResourcesApproved).toBe(true);
    } finally {
      await runtime.dispose();
    }

    await expect(access(path.join(agentDir, "trust.json"))).rejects.toMatchObject({ code: "ENOENT" });

    const nextProcess = await createTestRuntime(agentDir);
    try {
      const afterRestart = await nextProcess.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: false,
      });
      expect(afterRestart.workspace.projectResourcesApproved).toBe(false);
    } finally {
      await nextProcess.dispose();
    }
  });

  test("ignores project extensions and skills while keeping workspace context files", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    await writeProjectFeatureFixture(workspaceDir);
    const runtime = await createTestRuntime(agentDir);

    try {
      const trusted = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      expect(trusted.features.features.some((feature) => feature.id === "harness-note")).toBe(false);
      expect(trusted.features.diagnostics.some((diagnostic) => diagnostic.message.includes("intentional harness diagnostic"))).toBe(false);

      const created = await runtime.createSession(trusted.workspace.id);
      const loader = created.features;
      expect(loader.features.some((feature) => feature.id.includes("harness"))).toBe(false);
      const settingsPath = path.join(workspaceDir, "AGENTS.md");
      await access(settingsPath);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  test("select and input host dialogs settle and rebind after session replacement", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createTestRuntime(agentDir, { testHostUi: true });
    const events: RuntimeEvent[] = [];

    try {
      const trusted = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const created = await runtime.createSession(trusted.workspace.id);
      expect(created.sessions.some((session) => session.id === created.session.id)).toBe(true);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });

      const firstPrompt = runtime.sendPrompt({
        sessionId: created.session.id,
        text: TEST_PROMPT.useTool,
      });
      const dialog = await waitForEvent(events, RUNTIME_EVENT_TYPES.extensionDialogRequest);
      expect(dialog.payload).toMatchObject({ kind: "select", title: "Allow harness_mark?" });
      const requestId = (dialog.payload as { requestId: string }).requestId;
      await runtime.resolveHostDialog({ requestId, selected: "not-an-option" });
      expect(events.some((event) => event.type === RUNTIME_EVENT_TYPES.extensionDialogSettled)).toBe(false);
      await runtime.resolveHostDialog({ requestId, selected: "Yes" });
      await firstPrompt;
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled);

      const replacement = await runtime.createSession(trusted.workspace.id);
      expect(replacement.session.id).not.toBe(created.session.id);
      expect(replacement.sessions.some((session) => session.id === replacement.session.id)).toBe(true);
      events.length = 0;
      const secondPrompt = runtime.sendPrompt({
        sessionId: replacement.session.id,
        text: TEST_PROMPT.useTool,
      });
      const secondDialog = await waitForEvent(events, RUNTIME_EVENT_TYPES.extensionDialogRequest);
      await runtime.resolveHostDialog({
        requestId: (secondDialog.payload as { requestId: string }).requestId,
        selected: "No, provide reason",
      });
      const inputDialog = await waitForEvent(
        events,
        RUNTIME_EVENT_TYPES.extensionDialogRequest,
        (event) => (event.payload as { kind?: string }).kind === "input",
      );
      await runtime.resolveHostDialog({
        requestId: (inputDialog.payload as { requestId: string }).requestId,
        value: "not now",
      });
      await secondPrompt;
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  test("unsupported host UI throws a useful Error instead of a stringified object", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createPhoCodeRuntime({
      agentDir,
      deterministicTestModel: true,
      featureManifest: {
        features: [
          {
            id: "harness-unsupported-ui",
            version: "test",
            extensionFactories: [createUnsupportedHostUiExtension()],
          },
        ],
      },
    });
    const events: RuntimeEvent[] = [];

    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      await runtime.sendPrompt({
        sessionId: created.session.id,
        text: TEST_PROMPT.useTool,
      });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled);
      const after = await runtime.openSession(workspace.workspace.id, created.session.id);
      const tool = after.messages
        .flatMap((message) => message.blocks)
        .find((block) => block.type === "tool" && block.name === TEST_TOOL_NAME);
      expect(tool && "outputPreview" in tool ? tool.outputPreview : "").not.toContain("[object Object]");
      expect(
        after.features.diagnostics.some((diagnostic) => diagnostic.message.includes("Unsupported host UI capability: custom")) ||
          (tool && "outputPreview" in tool && tool.outputPreview.includes("Unsupported host UI capability: custom")),
      ).toBe(true);
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  test("default manifest loads the baked permission and Trash features", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    await writeProjectFeatureFixture(workspaceDir);
    const runtime = await createTestRuntime(agentDir, { useDefaultManifest: true });
    const events: RuntimeEvent[] = [];

    try {
      const trusted = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      expect(trusted.features.features.some((feature) => feature.id === PERMISSION_FEATURE_ID)).toBe(true);
      expect(trusted.features.features.some((feature) => feature.id === TRASH_FEATURE_ID)).toBe(true);
      expect(trusted.features.features.some((feature) => feature.id === "harness-note")).toBe(false);
      const created = await runtime.createSession(trusted.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      const prompt = runtime.sendPrompt({
        sessionId: created.session.id,
        text: TEST_PROMPT.useTool,
      });
      const dialog = await waitForEvent(events, RUNTIME_EVENT_TYPES.extensionDialogRequest);
      expect(dialog.payload).toMatchObject({ kind: "select" });
      const dialogTitle = (dialog.payload as { title?: string }).title ?? "";
      const dialogMessage = (dialog.payload as { message?: string }).message ?? "";
      expect(`${dialogTitle}\n${dialogMessage}`).toContain(TEST_TOOL_NAME);
      const options = (dialog.payload as { options?: string[] }).options ?? [];
      expect(options).toContain("Yes");
      expect(options).toContain("No");
      expect(options.some((option) => option.includes("this session"))).toBe(true);
      await runtime.resolveHostDialog({
        requestId: (dialog.payload as { requestId: string }).requestId,
        selected: "Yes",
      });
      await prompt;
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled);
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 45_000);

  test("dispose settles a pending permission dialog without hanging", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createTestRuntime(agentDir, { useDefaultManifest: true });
    const events: RuntimeEvent[] = [];

    try {
      const trusted = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const created = await runtime.createSession(trusted.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      void runtime.sendPrompt({
        sessionId: created.session.id,
        text: TEST_PROMPT.useTool,
      });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.extensionDialogRequest);
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 45_000);

  test("a background prompt continues after creating and using another session", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createTestRuntime(agentDir);
    const events: RuntimeEvent[] = [];

    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const first = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      const firstPrompt = runtime.sendPrompt({
        sessionId: first.session.id,
        text: TEST_PROMPT.abortMe,
      });
      const second = await runtime.createSession(workspace.workspace.id);
      expect(second.session.id).not.toBe(first.session.id);
      const secondPrompt = runtime.sendPrompt({
        sessionId: second.session.id,
        text: "hello from the second chat",
      });
      await secondPrompt;
      await waitForEvent(
        events,
        RUNTIME_EVENT_TYPES.runSettled,
        (event) => event.sessionId === second.session.id,
      );
      await firstPrompt;
      await waitForEvent(
        events,
        RUNTIME_EVENT_TYPES.runSettled,
        (event) => event.sessionId === first.session.id,
      );

      const firstReopened = await runtime.openSession(workspace.workspace.id, first.session.id);
      const secondReopened = await runtime.openSession(workspace.workspace.id, second.session.id);
      expect(
        firstReopened.messages.some((message) =>
          message.blocks.some((block) => block.type === "text" && block.text.includes("ABORT")),
        ),
      ).toBe(true);
      expect(
        secondReopened.messages.some((message) =>
          message.blocks.some((block) => block.type === "text" && block.text.includes("hello from the second chat")),
        ),
      ).toBe(true);
      expect(firstReopened.session.id).toBe(first.session.id);
      expect(secondReopened.session.id).toBe(second.session.id);
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 60_000);

  test("getSessionSnapshot does not steal selection from another live chat", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createTestRuntime(agentDir);
    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const first = await runtime.createSession(workspace.workspace.id);
      const second = await runtime.createSession(workspace.workspace.id);
      expect(runtime.listSessionActivity().find((entry) => entry.sessionId === second.session.id)?.selected).toBe(true);

      const snapshot = await runtime.getSessionSnapshot({
        workspaceId: first.workspace.id,
        sessionId: first.session.id,
      });
      expect(snapshot.session.id).toBe(first.session.id);
      const activity = runtime.listSessionActivity();
      expect(activity.find((entry) => entry.sessionId === second.session.id)?.selected).toBe(true);
      expect(activity.find((entry) => entry.sessionId === first.session.id)?.selected).toBe(false);
    } finally {
      await runtime.dispose();
    }
  }, 60_000);

  test("refuses to remove a session while a prompt is running", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const runtime = await createTestRuntime(agentDir);
    const events: RuntimeEvent[] = [];
    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      const prompt = runtime.sendPrompt({
        sessionId: created.session.id,
        workspaceId: created.workspace.id,
        text: TEST_PROMPT.abortMe,
      });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runAdmitted, (event) => event.sessionId === created.session.id);
      await expect(
        runtime.inspectRemovableSession({
          workspaceId: created.workspace.id,
          sessionId: created.session.id,
        }),
      ).rejects.toMatchObject({ code: HARNESS_ERROR_CODES.sessionRemovalRefused });
      await prompt;
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 60_000);

  test("keeps the Pi artifact when injected Trash fails", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const removal: RecoverableRemovalService = {
      async moveToTrash() {
        throw new Error("injected trash failure");
      },
    };
    const runtime = await createTestRuntime(agentDir, { removalService: removal });
    const events: RuntimeEvent[] = [];
    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      await runtime.sendPrompt({
        sessionId: created.session.id,
        workspaceId: created.workspace.id,
        text: "hello",
      });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled, (event) => event.sessionId === created.session.id);
      const listed = await SessionManager.list(created.workspace.path);
      const info = listed.find((entry) => entry.id === created.session.id);
      expect(info).toBeDefined();
      await access(info!.path);
      const inspected = await runtime.inspectRemovableSession({
        workspaceId: created.workspace.id,
        sessionId: created.session.id,
      });
      await expect(
        runtime.removeValidatedSession({
          workspaceId: created.workspace.id,
          sessionId: created.session.id,
          fingerprint: inspected.fingerprint,
        }),
      ).rejects.toMatchObject({
        code: HARNESS_ERROR_CODES.runtimeUnavailable,
        message: expect.stringContaining("injected trash failure"),
        recoverable: true,
      });
      await access(info!.path);
      const listedAfter = await SessionManager.list(created.workspace.path);
      expect(listedAfter.some((entry) => entry.id === created.session.id)).toBe(true);
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 60_000);

  test("moves a settled session through an injected Trash service", async () => {
    const { agentDir, workspaceDir } = await makeIsolatedDirs();
    const simulatedTrashDir = path.join(agentDir, "simulated-os-trash");
    let trashedPath = "";
    const removal: RecoverableRemovalService = {
      async moveToTrash(input) {
        await mkdir(simulatedTrashDir, { recursive: true });
        trashedPath = path.join(simulatedTrashDir, path.basename(input.canonicalPath));
        await rename(input.canonicalPath, trashedPath);
        return { method: "macos-trash" };
      },
    };
    const runtime = await createTestRuntime(agentDir, { removalService: removal });
    const events: RuntimeEvent[] = [];
    try {
      const workspace = await runtime.inspectWorkspace({
        path: workspaceDir,
        approveProjectResources: true,
      });
      const created = await runtime.createSession(workspace.workspace.id);
      const stop = runtime.subscribe((event) => {
        events.push(event);
      });
      await runtime.sendPrompt({
        sessionId: created.session.id,
        workspaceId: created.workspace.id,
        text: "hello",
      });
      await waitForEvent(events, RUNTIME_EVENT_TYPES.runSettled, (event) => event.sessionId === created.session.id);
      const listed = await SessionManager.list(created.workspace.path);
      expect(listed.some((entry) => entry.id === created.session.id)).toBe(true);
      const inspected = await runtime.inspectRemovableSession({
        workspaceId: created.workspace.id,
        sessionId: created.session.id,
      });
      const removed = await runtime.removeValidatedSession({
        workspaceId: created.workspace.id,
        sessionId: created.session.id,
        fingerprint: inspected.fingerprint,
      });
      expect(removed.method).toBe("macos-trash");
      await access(trashedPath);
      const listedAfter = await SessionManager.list(created.workspace.path);
      expect(listedAfter.some((entry) => entry.id === created.session.id)).toBe(false);
      stop();
    } finally {
      await runtime.dispose();
    }
  }, 60_000);
});

async function waitForEvent(
  events: RuntimeEvent[],
  type: RuntimeEvent["type"],
  predicate: (event: RuntimeEvent) => boolean = () => true,
  timeoutMs = 15_000,
): Promise<RuntimeEvent> {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const match = events.find((event) => event.type === type && predicate(event));
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${type}. Saw: ${events.map((event) => event.type).join(", ")}`);
}
