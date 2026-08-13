import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { TranscriptBlock, TranscriptMessage } from "@pho-code/protocol";
import { previewText, previewUnknown } from "./preview";

type SessionMessage = AgentSession["messages"][number];

export function projectMessages(messages: readonly SessionMessage[]): TranscriptMessage[] {
  const toolResults = new Map<string, { output: string; isError: boolean }>();
  for (const message of messages) {
    if (message.role !== "toolResult") {
      continue;
    }
    toolResults.set(message.toolCallId, {
      output: previewUnknown(textFromToolContent(message.content)),
      isError: message.isError,
    });
  }

  const projected: TranscriptMessage[] = [];
  messages.forEach((message, index) => {
    switch (message.role) {
      case "user":
        projected.push({
          id: `user:${message.timestamp}:${index}`,
          role: "user",
          blocks: [{ type: "text", text: userText(message.content) }],
        });
        return;
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
        projected.push({
          id: `assistant:${message.timestamp}:${index}`,
          role: "assistant",
          blocks,
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

function userText(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("");
}

function textFromToolContent(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("\n");
}

export function firstUserPreview(messages: readonly SessionMessage[]): string | undefined {
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }
    const text = previewText(userText(message.content).trim());
    if (text.length > 0) {
      return text;
    }
  }
  return undefined;
}
