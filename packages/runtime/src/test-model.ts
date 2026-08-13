import {
  Type,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
  fauxToolCall,
  type Context,
  type FauxProviderHandle,
} from "@earendil-works/pi-ai";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";

export const TEST_PROVIDER_ID = "harness-test";
export const TEST_MODEL_ID = "slice";
export const TEST_TOOL_NAME = "harness_mark";

export const TEST_PROMPT = {
  useTool: "USE_TOOL",
  failAfter: "FAIL_AFTER",
  abortMe: "ABORT_ME",
} as const;

const ABORT_TEXT =
  "BEGIN_ABORT_STREAM " +
  Array.from({ length: 80 }, (_, index) => `chunk-${index}`).join(" ") +
  " END_ABORT_STREAM";

export function createHarnessMarkTool(): ToolDefinition {
  return defineTool({
    name: TEST_TOOL_NAME,
    label: "Harness mark",
    description: "Marks that a tool ran during the harness vertical-slice test.",
    parameters: Type.Object({
      note: Type.String({ description: "Short note to echo" }),
    }),
    execute: async (_toolCallId, params) => ({
      content: [{ type: "text", text: `marked:${params.note}` }],
      details: { note: params.note },
    }),
  });
}

export function createDeterministicTestProvider(): FauxProviderHandle {
  const faux = fauxProvider({
    provider: TEST_PROVIDER_ID,
    api: "harness-test-api",
    models: [
      {
        id: TEST_MODEL_ID,
        name: "Harness test model",
        reasoning: true,
        input: ["text"],
        contextWindow: 32_000,
        maxTokens: 2_048,
      },
    ],
    tokensPerSecond: 80,
  });

  const factory = (context: Context) => {
    faux.appendResponses([factory]);
    return buildTestResponse(context);
  };
  faux.setResponses([factory]);

  return faux;
}

function buildTestResponse(context: Context) {
  if (hasToolResult(context)) {
    return fauxAssistantMessage(fauxText("Tool completed."));
  }

  const prompt = lastUserText(context);
  if (prompt.includes(TEST_PROMPT.failAfter)) {
    return fauxAssistantMessage("synthetic failure after admission", {
      stopReason: "error",
      errorMessage: "synthetic failure after admission",
    });
  }
  if (prompt.includes(TEST_PROMPT.abortMe)) {
    return fauxAssistantMessage(ABORT_TEXT);
  }
  if (prompt.includes(TEST_PROMPT.useTool)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Calling the mark tool."),
        fauxToolCall(TEST_TOOL_NAME, { note: "ok" }, { id: "call_harness_mark" }),
      ],
      { stopReason: "toolUse" },
    );
  }

  return fauxAssistantMessage([
    fauxThinking("Preparing a short reply."),
    fauxText("Hello from the test model."),
  ]);
}

function lastUserText(context: Context): string {
  for (let index = context.messages.length - 1; index >= 0; index -= 1) {
    const message = context.messages[index];
    if (!message || message.role !== "user") {
      continue;
    }
    if (typeof message.content === "string") {
      return message.content;
    }
    return message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
  }
  return "";
}

function hasToolResult(context: Context): boolean {
  let lastUserIndex = -1;
  for (let index = 0; index < context.messages.length; index += 1) {
    if (context.messages[index]?.role === "user") {
      lastUserIndex = index;
    }
  }
  return context.messages.slice(lastUserIndex + 1).some((message) => message.role === "toolResult");
}
