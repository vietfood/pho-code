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
  useSafeShell: "USE_SAFE_SHELL",
  useDangerousShell: "USE_DANGEROUS_SHELL",
  useCompoundSafe: "USE_COMPOUND_SAFE",
  useCompoundDangerous: "USE_COMPOUND_DANGEROUS",
  useWrapper: "USE_WRAPPER",
  useTrash: "USE_TRASH",
  useWrite: "USE_WRITE",
  useEdit: "USE_EDIT",
  useWriteFail: "USE_WRITE_FAIL",
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
        cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
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
  if (prompt.includes(TEST_PROMPT.useSafeShell)) {
    return fauxAssistantMessage(
      [fauxThinking("Inspecting the repository."), fauxToolCall("bash", { command: "git status" }, { id: "call_safe_shell" })],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes(TEST_PROMPT.useDangerousShell)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Attempting a permanent removal."),
        fauxToolCall("bash", { command: "rm -rf disposable-fixture.txt" }, { id: "call_dangerous_shell" }),
      ],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes(TEST_PROMPT.useCompoundSafe)) {
    return fauxAssistantMessage(
      [fauxThinking("Running a compound inspection."), fauxToolCall("bash", { command: "pwd && git status" }, { id: "call_compound_safe" })],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes(TEST_PROMPT.useCompoundDangerous)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Mixing inspection with removal."),
        fauxToolCall("bash", { command: "pwd && rm -rf disposable-fixture.txt" }, { id: "call_compound_dangerous" }),
      ],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes(TEST_PROMPT.useWrapper)) {
    return fauxAssistantMessage(
      [fauxThinking("Hiding a command behind a wrapper."), fauxToolCall("bash", { command: "bash -c 'pwd'" }, { id: "call_wrapper" })],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes(TEST_PROMPT.useTrash)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Moving the fixture to Trash."),
        fauxToolCall("move_to_trash", { path: "disposable-fixture.txt" }, { id: "call_move_to_trash" }),
      ],
      { stopReason: "toolUse" },
    );
  }

  if (prompt.includes(TEST_PROMPT.useWriteFail)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Writing over a directory."),
        fauxToolCall("write", { path: "blocked-dir", content: "should fail\n" }, { id: "call_write_fail" }),
      ],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes(TEST_PROMPT.useWrite)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Creating a tracked file."),
        fauxToolCall("write", { path: "agent-note.txt", content: "hello from agent\n" }, { id: "call_write" }),
      ],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes(TEST_PROMPT.useEdit)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Editing the tracked file."),
        fauxToolCall(
          "edit",
          { path: "tracked.txt", edits: [{ oldText: "before\n", newText: "after from agent\n" }] },
          { id: "call_edit" },
        ),
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
