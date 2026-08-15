import {
  isToolCallEventType,
  type InlineExtension,
  type ToolCallEvent,
  type ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import type { ChangeScope } from "@pho-code/protocol";
import type { HarnessFeature } from "./features";
import type { ChangeCaptureService } from "./change-capture";

export const CHANGE_CAPTURE_FEATURE_ID = "change-capture";
export const CHANGE_CAPTURE_FEATURE_VERSION = "1.0.0";

export interface ChangeCaptureHost {
  capture: ChangeCaptureService | undefined;
  resolveScope: (cwd: string, sessionId: string) => (ChangeScope & { workspacePath: string }) | undefined;
}

export function createChangeCaptureFeature(host: ChangeCaptureHost): HarnessFeature {
  return {
    id: CHANGE_CAPTURE_FEATURE_ID,
    version: CHANGE_CAPTURE_FEATURE_VERSION,
    extensionFactories: [createChangeCaptureExtension(host)],
    expected: { extensions: 1 },
  };
}

export function createChangeCaptureExtension(host: ChangeCaptureHost): InlineExtension {
  return {
    name: CHANGE_CAPTURE_FEATURE_ID,
    hidden: true,
    factory(pi) {
      pi.on("tool_call", async (event: ToolCallEvent, ctx) => {
        if (!isWriteOrEdit(event)) {
          return undefined;
        }
        const capture = host.capture;
        const scope = host.resolveScope(ctx.cwd, ctx.sessionManager.getSessionId());
        if (!capture || !scope) {
          return undefined;
        }
        try {
          await capture.begin({
            ...scope,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.input,
          });
        } catch (error) {
          console.error("Change capture begin failed:", error);
          try {
            await capture.recordCaptureFailure({
              ...scope,
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.input,
            });
          } catch (failureError) {
            console.error("Change capture failure record failed:", failureError);
          }
        }
        return undefined;
      });
      pi.on("tool_result", async (event: ToolResultEvent, ctx) => {
        if (event.toolName !== "write" && event.toolName !== "edit") {
          return undefined;
        }
        const capture = host.capture;
        const scope = host.resolveScope(ctx.cwd, ctx.sessionManager.getSessionId());
        if (!capture || !scope) {
          return undefined;
        }
        try {
          await capture.settle({
            ...scope,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.input,
            isError: event.isError,
          });
        } catch (error) {
          console.error("Change capture settle failed:", error);
          try {
            await capture.recordCaptureFailure({
              ...scope,
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.input,
            });
          } catch (failureError) {
            console.error("Change capture failure record failed:", failureError);
          }
        }
        return undefined;
      });
    },
  };
}

function isWriteOrEdit(
  event: ToolCallEvent,
): event is ToolCallEvent & { toolName: "write" | "edit"; input: { path?: string } } {
  return isToolCallEventType("write", event) || isToolCallEventType("edit", event);
}
