import type { TranscriptBlock, TranscriptMessage, TranscriptTextBlock } from "@pho-code/protocol";

/** Pi custom session entry type. Display overlay only; ignored by LLM context. */
export const ASSISTANT_REWRITE_CUSTOM_TYPE = "pho-code.assistant-rewrite";

export interface RewriteCustomEntry {
  type: string;
  customType?: string;
  data?: unknown;
}

export interface AssistantRewriteRecord {
  messageId: string;
  /** Rewritten markdown, or `null` to restore the Pi original. */
  text: string | null;
}

export function collectRewriteOverlays(entries: readonly RewriteCustomEntry[]): Map<string, string> {
  const overlays = new Map<string, string>();
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== ASSISTANT_REWRITE_CUSTOM_TYPE) {
      continue;
    }
    const record = parseRewriteRecord(entry.data);
    if (!record) {
      continue;
    }
    if (record.text === null) {
      overlays.delete(record.messageId);
      continue;
    }
    overlays.set(record.messageId, record.text);
  }
  return overlays;
}

export function applyRewriteOverlays(
  messages: readonly TranscriptMessage[],
  overlays: ReadonlyMap<string, string>,
): TranscriptMessage[] {
  if (overlays.size === 0) {
    return [...messages];
  }
  return messages.map((message) => applyRewriteOverlay(message, overlays));
}

/**
 * Apply one message's rewrite overlay. `fallbackIds` carries the legacy
 * `role:timestamp:index` candidates the message had before display ids became
 * Pi entry ids, so overlays persisted by earlier builds keep applying.
 */
export function applyRewriteOverlay(
  message: TranscriptMessage,
  overlays: ReadonlyMap<string, string>,
  fallbackIds: readonly string[] = [],
): TranscriptMessage {
  if (overlays.size === 0 || message.role !== "assistant") {
    return message;
  }
  let overlay = overlays.get(message.id);
  if (overlay === undefined) {
    for (const candidate of fallbackIds) {
      overlay = overlays.get(candidate);
      if (overlay !== undefined) {
        break;
      }
    }
  }
  if (overlay === undefined) {
    return message;
  }
  const original = joinedText(message.blocks);
  if (overlay === original) {
    return message;
  }
  return { ...message, blocks: replaceAssistantText(message.blocks, overlay, original) };
}

export function joinedText(blocks: readonly TranscriptBlock[]): string {
  return blocks
    .filter((block): block is TranscriptTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
}

export function originalJoinedText(blocks: readonly TranscriptBlock[]): string {
  const textBlocks = blocks.filter((block): block is TranscriptTextBlock => block.type === "text");
  const original = textBlocks.find((block) => block.originalText !== undefined)?.originalText;
  return original ?? joinedText(blocks);
}

function parseRewriteRecord(value: unknown): AssistantRewriteRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as { messageId?: unknown; text?: unknown };
  if (typeof candidate.messageId !== "string" || candidate.messageId.length === 0) {
    return undefined;
  }
  if (candidate.text !== null && typeof candidate.text !== "string") {
    return undefined;
  }
  return {
    messageId: candidate.messageId,
    text: candidate.text,
  };
}

function replaceAssistantText(
  blocks: readonly TranscriptBlock[],
  overlay: string,
  original: string,
): TranscriptBlock[] {
  let replaced = false;
  const next: TranscriptBlock[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "text":
        if (replaced) {
          break;
        }
        replaced = true;
        next.push({ type: "text", text: overlay, originalText: original });
        break;
      case "thinking":
      case "tool":
      case "image":
        next.push(block);
        break;
      default: {
        const exhaustive: never = block;
        void exhaustive;
      }
    }
  }
  if (!replaced) {
    next.push({ type: "text", text: overlay, originalText: original });
  }
  return next;
}
