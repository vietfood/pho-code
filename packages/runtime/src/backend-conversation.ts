import {
  createHarnessError,
  HARNESS_ERROR_CODES,
  idleRunState,
  type AgentSessionSnapshot,
  type AgentToolBlock,
  type AgentTranscriptMessage,
  type RunState,
  type TranscriptMessage,
  type TranscriptToolBlock,
} from "@pho-code/protocol";

export interface BackendConversationProjection {
  messages: TranscriptMessage[];
  run: RunState;
}

/** Projects the common Pho Agent transcript into Pho Code's existing conversation rows. */
export function projectBackendConversation(snapshot: AgentSessionSnapshot): BackendConversationProjection {
  const messages = [...snapshot.messages];
  const liveAssistant = snapshot.run.status === "running" && messages.at(-1)?.role === "assistant"
    ? messages.pop()
    : undefined;

  return {
    messages: messages.map(projectMessage),
    run: projectRun(snapshot, liveAssistant),
  };
}

function projectMessage(message: AgentTranscriptMessage): TranscriptMessage {
  return {
    id: message.id,
    role: message.role,
    blocks: message.blocks.map((block) => block.type === "text"
      ? { type: "text", text: block.text }
      : projectTool(block)),
  };
}

function projectTool(block: AgentToolBlock): TranscriptToolBlock {
  return {
    type: "tool",
    callId: block.id,
    name: block.title?.trim() || block.name,
    ...(block.kind ? { kind: block.kind } : {}),
    status: block.status,
    inputPreview: block.input ?? "",
    outputPreview: block.output ?? "",
  };
}

function projectRun(
  snapshot: AgentSessionSnapshot,
  liveAssistant: AgentTranscriptMessage | undefined,
): RunState {
  const runId = snapshot.run.runId;
  if (snapshot.run.status === "running") {
    const blocks = liveAssistant?.blocks ?? [];
    return {
      ...(runId ? { runId } : {}),
      status: "streaming",
      streamingText: blocks
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join(""),
      work: blocks.filter((block): block is AgentToolBlock => block.type === "tool").map(projectTool),
    };
  }
  if (snapshot.run.status === "failed") {
    return {
      ...(runId ? { runId } : {}),
      status: "failed",
      streamingText: "",
      work: [],
      error: createHarnessError({
        code: HARNESS_ERROR_CODES.runFailed,
        message: snapshot.run.error ?? "The backend run failed.",
        operation: "sendPrompt",
        recoverable: true,
      }),
    };
  }
  if (snapshot.run.status === "cancelled") {
    return {
      ...(runId ? { runId } : {}),
      status: "cancelled",
      streamingText: "",
      work: [],
    };
  }
  return idleRunState();
}
