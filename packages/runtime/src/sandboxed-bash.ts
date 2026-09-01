import { isSandboxBashToolName, type TranscriptMessage } from "@pho-code/protocol";

/** Pi custom session entry type. Display overlay only; ignored by LLM context. */
export const SANDBOXED_BASH_CUSTOM_TYPE = "pho-code.sandboxed-bash";

export interface SandboxedBashCustomEntry {
  type: string;
  customType?: string;
  data?: unknown;
}

export function collectSandboxedBashCallIds(entries: readonly SandboxedBashCustomEntry[]): Set<string> {
  const callIds = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== SANDBOXED_BASH_CUSTOM_TYPE) {
      continue;
    }
    const callId = parseSandboxedBashCallId(entry.data);
    if (callId) {
      callIds.add(callId);
    }
  }
  return callIds;
}

export function applySandboxedBashOverlay(
  messages: readonly TranscriptMessage[],
  callIds: ReadonlySet<string>,
): TranscriptMessage[] {
  if (callIds.size === 0) {
    return [...messages];
  }
  return messages.map((message) => applySandboxedBashOverlayToMessage(message, callIds));
}

export function applySandboxedBashOverlayToMessage(
  message: TranscriptMessage,
  callIds: ReadonlySet<string>,
): TranscriptMessage {
  if (callIds.size === 0 || message.role !== "assistant") {
    return message;
  }
  let changed = false;
  const blocks = message.blocks.map((block) => {
    if (block.type !== "tool" || block.sandboxed === true) {
      return block;
    }
    if (!callIds.has(block.callId) || !isSandboxBashToolName(block.name)) {
      return block;
    }
    changed = true;
    return { ...block, sandboxed: true };
  });
  return changed ? { ...message, blocks } : message;
}

function parseSandboxedBashCallId(value: unknown): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const callId = (value as { callId?: unknown }).callId;
  if (typeof callId !== "string" || callId.length === 0) {
    return undefined;
  }
  return callId;
}
