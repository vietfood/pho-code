import type { AgentSession } from "@pho-agent/runtime/feature-api";
import {
  isImageMimeType,
  type TranscriptBlock,
  type TranscriptMessage,
} from "@pho-code/protocol";
import { previewToolResult, previewUnknown } from "./preview";
import { isHiddenPlanExecutePrompt } from "./plan-agent-state";
import { stripWorkspaceReferenceAppendix } from "./workspace-reference";

type SessionMessage = AgentSession["messages"][number];

export function projectMessages(messages: readonly SessionMessage[]): TranscriptMessage[] {
  const toolResults = new Map<string, { output: string; isError: boolean }>();
  for (const message of messages) {
    if (message.role !== "toolResult") {
      continue;
    }
    toolResults.set(message.toolCallId, {
      output: previewToolResult({ content: message.content }),
      isError: message.isError,
    });
  }

  const projected: TranscriptMessage[] = [];
  messages.forEach((message, index) => {
    switch (message.role) {
      case "user": {
        const createdAt = toCreatedAt(message.timestamp);
        const blocks = projectUserContentBlocks(message.content);
        if (isHiddenPlanExecuteUserBlocks(blocks)) {
          return;
        }
        projected.push({
          id: `user:${message.timestamp}:${index}`,
          role: "user",
          blocks: blocks.length > 0 ? blocks : [{ type: "text", text: "" }],
          ...(createdAt ? { createdAt } : {}),
        });
        return;
      }
      case "assistant": {
        const blocks: TranscriptBlock[] = [];
        for (const part of message.content) {
          switch (part.type) {
            case "text":
              if (part.text.length > 0) {
                blocks.push({ type: "text", text: part.text });
              }
              break;
            case "thinking":
              if (part.thinking.length > 0) {
                blocks.push({ type: "thinking", text: part.thinking });
              }
              break;
            case "toolCall": {
              const result = toolResults.get(part.id);
              let status: "running" | "completed" | "failed" = "running";
              if (result?.isError) {
                status = "failed";
              } else if (result) {
                status = "completed";
              }
              blocks.push({
                type: "tool",
                callId: part.id,
                name: part.name,
                status,
                inputPreview: previewUnknown(part.arguments),
                outputPreview: result?.output ?? "",
              });
              break;
            }
            default: {
              const exhaustive: never = part;
              void exhaustive;
            }
          }
        }
        const createdAt = toCreatedAt(message.timestamp);
        projected.push({
          id: `assistant:${message.timestamp}:${index}`,
          role: "assistant",
          blocks,
          ...(createdAt ? { createdAt } : {}),
        });
        return;
      }
      case "toolResult":
      case "bashExecution":
      case "custom":
      case "branchSummary":
      case "compactionSummary":
        return;
      default: {
        const exhaustive: never = message;
        void exhaustive;
      }
    }
  });

  return projected;
}

function isHiddenPlanExecuteUserBlocks(blocks: readonly TranscriptBlock[]): boolean {
  return blocks.length === 1 && blocks[0]?.type === "text" && isHiddenPlanExecutePrompt(blocks[0].text);
}

function toCreatedAt(timestamp: unknown): string | undefined {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    return new Date(timestamp).toISOString();
  }
  if (typeof timestamp === "string" && timestamp.length > 0) {
    if (/^\d+$/u.test(timestamp)) {
      const asNumber = Number(timestamp);
      if (Number.isFinite(asNumber)) {
        return new Date(asNumber).toISOString();
      }
    }
    const parsed = Date.parse(timestamp);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return undefined;
}

export function projectUserContentBlocks(
  content: string | Array<{ type: string; text?: string; mimeType?: string; data?: string }>,
): TranscriptBlock[] {
  if (typeof content === "string") {
    const text = stripWorkspaceReferenceAppendix(content);
    return text.length > 0 ? [{ type: "text", text }] : [];
  }

  const blocks: TranscriptBlock[] = [];
  let imageIndex = 0;
  for (const part of content) {
    if (part.type === "text" && typeof part.text === "string" && part.text.length > 0) {
      const text = stripWorkspaceReferenceAppendix(part.text);
      if (text.length > 0) {
        blocks.push({ type: "text", text });
      }
      continue;
    }
    if (part.type === "image") {
      imageIndex += 1;
      const mimeType = isImageMimeType(part.mimeType) ? part.mimeType : "image/png";
      const previewDataUrl = transcriptImagePreviewDataUrl(part.data, mimeType);
      blocks.push({
        type: "image",
        name: `image-${imageIndex}`,
        mimeType,
        ...(previewDataUrl ? { previewDataUrl } : {}),
      });
    }
  }
  return blocks;
}

/** Cap preview payload so session snapshots stay bounded for IPC. */
const MAX_TRANSCRIPT_IMAGE_PREVIEW_BASE64_CHARS = 400_000;

function transcriptImagePreviewDataUrl(
  data: string | undefined,
  mimeType: string,
): string | undefined {
  if (typeof data !== "string" || data.length === 0) {
    return undefined;
  }
  const compact = data.replace(/\s+/gu, "");
  if (compact.length === 0 || compact.length > MAX_TRANSCRIPT_IMAGE_PREVIEW_BASE64_CHARS) {
    return undefined;
  }
  if (!/^[A-Za-z0-9+/]+=*$/u.test(compact)) {
    return undefined;
  }
  return `data:${mimeType};base64,${compact}`;
}

function userText(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") {
    return stripWorkspaceReferenceAppendix(content);
  }

  return content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => stripWorkspaceReferenceAppendix(part.text ?? ""))
    .join("");
}

export function firstUserText(messages: readonly SessionMessage[]): string | undefined {
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }
    const raw = firstUserTextFromContent(message.content);
    if (raw) {
      return raw;
    }
  }
  return undefined;
}

function firstUserTextFromContent(content: string | Array<{ type: string; text?: string }>): string | undefined {
  const raw = userText(content).trim();
  if (isHiddenPlanExecutePrompt(raw) || raw.length === 0) {
    return undefined;
  }
  return raw;
}
