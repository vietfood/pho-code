import { Type } from "@earendil-works/pi-ai";
import { getAgentDir, defineTool, type InlineExtension } from "@earendil-works/pi-coding-agent";
import type { ResourceDiagnostic } from "@pho-code/protocol";
import type { HarnessFeature } from "./features";
import {
  createOsTrashRemovalService,
  probeTrashFacility,
  type RecoverableRemovalService,
  type TrashMethod,
} from "./recoverable-removal";
import { TRASH_TOOL_NAME, TrashTargetError, validateTrashTarget } from "./trash-target";

export const TRASH_FEATURE_ID = "recoverable-trash";
export const TRASH_FEATURE_VERSION = "1.0.0";

export interface TrashFeatureOptions {
  removal?: RecoverableRemovalService;
  agentDir?: string;
  applicationDataDir?: string;
  resourcesRoot?: string;
}

export function createTrashFeature(options: TrashFeatureOptions = {}): HarnessFeature {
  const factory = createTrashExtension(options);
  return {
    id: TRASH_FEATURE_ID,
    version: TRASH_FEATURE_VERSION,
    extensionFactories: [factory],
    expected: { extensions: 1 },
  };
}

export function trashFacilityDiagnostics(): ResourceDiagnostic[] {
  const probe = probeTrashFacility();
  if (probe.available) {
    return [];
  }
  return [
    {
      type: "warning",
      message: probe.reason,
      path: TRASH_FEATURE_ID,
    },
  ];
}

export function createTrashExtension(options: TrashFeatureOptions = {}): InlineExtension {
  const removal = options.removal ?? createOsTrashRemovalService();
  return {
    name: TRASH_FEATURE_ID,
    factory(pi) {
      pi.registerTool(
        defineTool({
          name: TRASH_TOOL_NAME,
          label: "Move to Trash",
          description:
            "Move one workspace file or directory to the operating system Trash. Permanent removal commands such as rm are unavailable; this is the supported removal mechanism. The item remains recoverable through the OS Trash. Pass a single path relative to the workspace or an absolute path inside it.",
          promptSnippet: "Move one workspace path to the OS Trash (recoverable; never permanently deletes).",
          promptGuidelines: [
            "Permanent removal commands such as rm are unavailable.",
            "Use move_to_trash with one path per call to move a workspace file or directory to Trash.",
            "Do not claim an exact restored location after trashing.",
          ],
          parameters: Type.Object({
            path: Type.String({ description: "Workspace-relative or absolute path to move to Trash" }),
          }),
          async execute(_toolCallId, params, signal, _onUpdate, ctx) {
            const workspacePath = ctx.cwd;
            if (!workspacePath) {
              throw new Error("An active workspace is required before moving a path to Trash.");
            }
            const abortSignal = signal ?? ctx.signal ?? new AbortController().signal;
            try {
              const target = await validateTrashTarget(params.path, {
                workspacePath,
                agentDir: options.agentDir ?? getAgentDir(),
                ...(options.applicationDataDir ? { applicationDataDir: options.applicationDataDir } : {}),
                ...(options.resourcesRoot ? { resourcesRoot: options.resourcesRoot } : {}),
              });
              const result = await removal.moveToTrash({
                canonicalPath: target.canonicalPath,
                workspacePath,
                signal: abortSignal,
              });
              return {
                content: [
                  {
                    type: "text",
                    text: formatTrashSuccess(target.requestedPath, result.method),
                  },
                ],
                details: {
                  path: target.requestedPath,
                  workspaceRelative: target.workspaceRelative,
                  method: result.method,
                  recoverable: true,
                },
              };
            } catch (error) {
              if (error instanceof TrashTargetError || error instanceof Error) {
                throw error;
              }
              throw new Error("The Trash operation failed. The original path was left unchanged.");
            }
          },
        }),
      );
    },
  };
}

function formatTrashSuccess(originalPath: string, method: TrashMethod): string {
  return `Moved ${originalPath} to Trash using ${method}. The item is recoverable through the operating system Trash.`;
}
