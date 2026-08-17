import {
  createBashTool,
  isToolCallEventType,
  type InlineExtension,
  type ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import type { HarnessFeature } from "./features";
import { bindSandboxPermissionAuthorizer } from "./sandbox-permission";
import type { AgentSandbox } from "./sandbox-runtime";

export const SANDBOX_FEATURE_ID = "agent-tool-sandbox";
export const SANDBOX_FEATURE_VERSION = "0.1.0";

export function createSandboxFeature(sandbox: AgentSandbox): HarnessFeature {
  return {
    id: SANDBOX_FEATURE_ID,
    version: SANDBOX_FEATURE_VERSION,
    extensionFactories: [createSandboxExtension(sandbox)],
    expected: { extensions: 1 },
  };
}

function createSandboxExtension(sandbox: AgentSandbox): InlineExtension {
  return {
    name: SANDBOX_FEATURE_ID,
    factory(pi) {
      bindSandboxPermissionAuthorizer(pi.events, sandbox);

      pi.on("session_start", async (_event, ctx) => {
        if (!sandbox.snapshot().enabled) {
          return;
        }
        await sandbox.initialize({ workspacePath: ctx.cwd });
      });

      pi.on("user_bash", () => {
        if (!sandbox.snapshot().enabled) {
          return;
        }
        return { operations: sandbox.bashOperations() };
      });

      pi.on("tool_call", async (event: ToolCallEvent, ctx) => {
        if (!isSandboxFileToolCall(event)) {
          return undefined;
        }
        const requestedPath = fileToolPath(event.input);
        const verdict = await sandbox.evaluateFileTool({
          toolName: event.toolName,
          requestedPath: requestedPath ?? "",
          cwd: ctx.cwd,
        });
        if (verdict.action !== "deny") {
          return undefined;
        }
        return { block: true, reason: verdict.reason };
      });

      if (!sandbox.snapshot().enabled) {
        return;
      }

      const template = createBashTool(process.cwd());
      pi.registerTool({
        ...template,
        async execute(id, params, signal, onUpdate, ctx) {
          const cwd = ctx.cwd || process.cwd();
          const tool = createBashTool(cwd, { operations: sandbox.bashOperations() });
          return tool.execute(id, params, signal, onUpdate);
        },
      });
    },
  };
}

function isSandboxFileToolCall(
  event: ToolCallEvent,
): event is ToolCallEvent & { toolName: "read" | "write" | "edit"; input: { path?: string } } {
  return (
    isToolCallEventType("read", event) || isToolCallEventType("write", event) || isToolCallEventType("edit", event)
  );
}

function fileToolPath(input: { path?: string }): string | undefined {
  if (typeof input.path !== "string" || input.path.trim() === "") {
    return undefined;
  }
  return input.path.trim();
}