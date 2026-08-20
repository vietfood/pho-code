import { homedir } from "node:os";
import path from "node:path";
import {
  Type,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
  fauxToolCall,
  type Context,
  type FauxProviderHandle,
  defineTool,
  type ToolDefinition,
} from "@pho-agent/runtime/testing";
import { PLAN_EXECUTE_PROMPT } from "./plan-agent-state";

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
  useAskUser: "USE_ASK_USER",
  useTodo: "USE_TODO",
  usePlanDoc: "USE_PLAN_DOC",
  useSandboxTouch: "USE_SANDBOX_TOUCH",
  useSandboxPwd: "USE_SANDBOX_PWD",
  useSandboxCurl: "USE_SANDBOX_CURL",
  useSandboxWriteEnv: "USE_SANDBOX_WRITE_ENV",
  useSandboxWriteMcp: "USE_SANDBOX_WRITE_MCP",
  useSandboxWriteSsh: "USE_SANDBOX_WRITE_SSH",
  useSandboxWriteAbs: "USE_SANDBOX_WRITE_ABS:",
  useWrite: "USE_WRITE",
  useEdit: "USE_EDIT",
  useWriteFail: "USE_WRITE_FAIL",
  useWriteOutside: "USE_WRITE_OUTSIDE",
  useWriteCap: "USE_WRITE_CAP",
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

// Order matters: tokens are matched with `includes`, so prefixed tokens
// (USE_WRITE_FAIL/USE_WRITE_OUTSIDE) must precede USE_WRITE.
const TOOL_USE_RESPONSES: [token: string, thinking: string, tool: string, args: Record<string, unknown>, callId: string][] = [
  [TEST_PROMPT.useTool, "Calling the mark tool.", TEST_TOOL_NAME, { note: "ok" }, "call_harness_mark"],
  [TEST_PROMPT.useSafeShell, "Inspecting the repository.", "bash", { command: "git status" }, "call_safe_shell"],
  [TEST_PROMPT.useDangerousShell, "Attempting a permanent removal.", "bash", { command: "rm -rf disposable-fixture.txt" }, "call_dangerous_shell"],
  [TEST_PROMPT.useCompoundSafe, "Running a compound inspection.", "bash", { command: "pwd && git status" }, "call_compound_safe"],
  [TEST_PROMPT.useCompoundDangerous, "Mixing inspection with removal.", "bash", { command: "pwd && rm -rf disposable-fixture.txt" }, "call_compound_dangerous"],
  [TEST_PROMPT.useWrapper, "Hiding a command behind a wrapper.", "bash", { command: "bash -c 'pwd'" }, "call_wrapper"],
  [
    TEST_PROMPT.useTodo,
    "Writing a session checklist.",
    "todo",
    {
      todos: [
        { id: "inspect", content: "Inspect the workspace", status: "completed" },
        { id: "group", content: "Group remaining work", status: "in_progress" },
        { id: "verify", content: "Verify the result", status: "pending" },
      ],
    },
    "call_todo",
  ],
  [
    TEST_PROMPT.usePlanDoc,
    "Writing the Plan document.",
    "update_plan_document",
    { markdown: "# Packaged plan\n\nWrite `agent-note.txt` with hello from agent.\n" },
    "call_plan_doc",
  ],
  [
    TEST_PROMPT.useAskUser,
    "Asking the owner before guessing.",
    "ask_user_question",
    {
      questions: [
        {
          question: "Which approach should we use?",
          header: "Approach",
          options: [
            { label: "Rewrite", description: "Replace the module." },
            { label: "Patch", description: "Minimal surgical edits." },
            { label: "Defer", description: "Leave it for later." },
          ],
        },
        {
          question: "What should the commit message emphasize?",
          header: "Commit",
          options: [
            { label: "Fix", description: "Bugfix wording." },
            { label: "Refactor", description: "Structure-only wording." },
          ],
        },
      ],
    },
    "call_ask_user",
  ],
  [TEST_PROMPT.useSandboxTouch, "Writing a sandbox probe file.", "bash", { command: "touch sandbox-allowed.txt" }, "call_sandbox_touch"],
  [TEST_PROMPT.useSandboxPwd, "Printing the workspace path.", "bash", { command: "pwd" }, "call_sandbox_pwd"],
  [TEST_PROMPT.useSandboxCurl, "Trying a public HTTP fetch.", "bash", { command: "curl -sS -o /dev/null --max-time 5 https://example.com" }, "call_sandbox_curl"],
  [TEST_PROMPT.useSandboxWriteEnv, "Writing a dotenv file.", "write", { path: ".env", content: "SECRET=1\n" }, "call_sandbox_write_env"],
  [TEST_PROMPT.useSandboxWriteMcp, "Writing an MCP config file.", "write", { path: ".mcp.json", content: "{}\n" }, "call_sandbox_write_mcp"],
  [TEST_PROMPT.useSandboxWriteSsh, "Writing an SSH private key.", "write", { path: path.join(homedir(), ".ssh", "id_rsa"), content: "sandbox-must-not-write\n" }, "call_sandbox_write_ssh"],
  [TEST_PROMPT.useTrash, "Moving the fixture to Trash.", "move_to_trash", { path: "disposable-fixture.txt" }, "call_move_to_trash"],
  [TEST_PROMPT.useWriteFail, "Writing over a directory.", "write", { path: "blocked-dir", content: "should fail\n" }, "call_write_fail"],
  [TEST_PROMPT.useWriteOutside, "Writing outside the workspace.", "write", { path: "/tmp/pho-code-outside-note.txt", content: "outside\n" }, "call_write_outside"],
  [TEST_PROMPT.useWrite, "Creating a tracked file.", "write", { path: "agent-note.txt", content: "hello from agent\n" }, "call_write"],
  [TEST_PROMPT.useEdit, "Editing the tracked file.", "edit", { path: "tracked.txt", edits: [{ oldText: "before\n", newText: "after from agent\n" }] }, "call_edit"],
];

function toolUseResponse(thinking: string, tool: string, args: Record<string, unknown>, callId: string) {
  return fauxAssistantMessage([fauxThinking(thinking), fauxToolCall(tool, args, { id: callId })], { stopReason: "toolUse" });
}

function buildTestResponse(context: Context) {
  if (hasToolResult(context)) {
    return fauxAssistantMessage(fauxText("Tool completed."));
  }

  const prompt = lastUserText(context);
  if (prompt.includes(PLAN_EXECUTE_PROMPT) || prompt.includes("[EXECUTING PLAN]")) {
    return toolUseResponse("Writing the first Execute step.", "write", { path: "agent-note.txt", content: "hello from agent\n" }, "call_write");
  }
  if (prompt.includes(TEST_PROMPT.failAfter)) {
    return fauxAssistantMessage("synthetic failure after admission", {
      stopReason: "error",
      errorMessage: "synthetic failure after admission",
    });
  }
  if (prompt.includes(TEST_PROMPT.abortMe)) {
    return fauxAssistantMessage(ABORT_TEXT);
  }
  if (prompt.includes(TEST_PROMPT.useSandboxWriteAbs)) {
    const absolutePath = prompt
      .slice(prompt.indexOf(TEST_PROMPT.useSandboxWriteAbs) + TEST_PROMPT.useSandboxWriteAbs.length)
      .trim()
      .split(/\s+/u)[0];
    return toolUseResponse(
      "Writing an absolute path.",
      "write",
      { path: absolutePath || "/tmp/pho-code-sandbox-missing-abs.txt", content: "extra-write\n" },
      "call_sandbox_write_abs",
    );
  }
  if (prompt.includes(TEST_PROMPT.useWriteCap)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Writing many tracked files."),
        ...Array.from({ length: 201 }, (_, index) =>
          fauxToolCall("write", { path: `cap-${index}.txt`, content: `${index}\n` }, { id: `call_write_cap_${index}` }),
        ),
      ],
      { stopReason: "toolUse" },
    );
  }
  for (const [token, thinking, tool, args, callId] of TOOL_USE_RESPONSES) {
    if (prompt.includes(token)) {
      return toolUseResponse(thinking, tool, args, callId);
    }
  }

  return fauxAssistantMessage([
    fauxThinking("Preparing a short reply."),
    fauxText("Hello from the test model."),
  ]);
}

function lastUserText(context: Context): string {
  const index = lastTurnStartIndex(context);
  if (index < 0) {
    return "";
  }
  return messageText(context.messages[index]);
}

function lastTurnStartIndex(context: Context): number {
  for (let index = context.messages.length - 1; index >= 0; index -= 1) {
    const message = context.messages[index];
    if (!message) {
      continue;
    }
    const text = messageText(message);
    if (!text) {
      continue;
    }
    if (text.includes("[PLAN MODE ACTIVE]")) {
      continue;
    }
    if (message.role === "user" || text.includes(PLAN_EXECUTE_PROMPT) || text.includes("[EXECUTING PLAN]")) {
      return index;
    }
  }
  return -1;
}

function messageText(message: Context["messages"][number]): string {
  const record = message as { content?: unknown };
  if (typeof record.content === "string") {
    return record.content;
  }
  if (!Array.isArray(record.content)) {
    return "";
  }
  return record.content
    .filter((part): part is { type: "text"; text: string } => {
      return Boolean(part) && typeof part === "object" && (part as { type?: unknown }).type === "text";
    })
    .map((part) => part.text)
    .join("");
}

function hasToolResult(context: Context): boolean {
  const lastUserIndex = lastTurnStartIndex(context);
  return context.messages.slice(lastUserIndex + 1).some((message) => message.role === "toolResult");
}
