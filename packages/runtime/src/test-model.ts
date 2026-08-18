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
} from "@earendil-works/pi-ai";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
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

function buildTestResponse(context: Context) {
  if (hasToolResult(context)) {
    return fauxAssistantMessage(fauxText("Tool completed."));
  }

  const prompt = lastUserText(context);
  if (prompt.includes(PLAN_EXECUTE_PROMPT) || prompt.includes("[EXECUTING PLAN]")) {
    return fauxAssistantMessage(
      [
        fauxThinking("Writing the first Execute step."),
        fauxToolCall("write", { path: "agent-note.txt", content: "hello from agent\n" }, { id: "call_write" }),
      ],
      { stopReason: "toolUse" },
    );
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
  if (prompt.includes(TEST_PROMPT.useTodo)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Writing a session checklist."),
        fauxToolCall(
          "todo",
          {
            todos: [
              { id: "inspect", content: "Inspect the workspace", status: "completed" },
              { id: "group", content: "Group remaining work", status: "in_progress" },
              { id: "verify", content: "Verify the result", status: "pending" },
            ],
          },
          { id: "call_todo" },
        ),
      ],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes(TEST_PROMPT.usePlanDoc)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Writing the Plan document."),
        fauxToolCall(
          "update_plan_document",
          { markdown: "# Packaged plan\n\nWrite `agent-note.txt` with hello from agent.\n" },
          { id: "call_plan_doc" },
        ),
      ],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes(TEST_PROMPT.useAskUser)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Asking the owner before guessing."),
        fauxToolCall(
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
          { id: "call_ask_user" },
        ),
      ],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes(TEST_PROMPT.useSandboxTouch)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Writing a sandbox probe file."),
        fauxToolCall("bash", { command: "touch sandbox-allowed.txt" }, { id: "call_sandbox_touch" }),
      ],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes(TEST_PROMPT.useSandboxPwd)) {
    return fauxAssistantMessage(
      [fauxThinking("Printing the workspace path."), fauxToolCall("bash", { command: "pwd" }, { id: "call_sandbox_pwd" })],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes(TEST_PROMPT.useSandboxCurl)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Trying a public HTTP fetch."),
        fauxToolCall(
          "bash",
          { command: "curl -sS -o /dev/null --max-time 5 https://example.com" },
          { id: "call_sandbox_curl" },
        ),
      ],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes(TEST_PROMPT.useSandboxWriteEnv)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Writing a dotenv file."),
        fauxToolCall("write", { path: ".env", content: "SECRET=1\n" }, { id: "call_sandbox_write_env" }),
      ],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes(TEST_PROMPT.useSandboxWriteMcp)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Writing an MCP config file."),
        fauxToolCall("write", { path: ".mcp.json", content: "{}\n" }, { id: "call_sandbox_write_mcp" }),
      ],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes(TEST_PROMPT.useSandboxWriteSsh)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Writing an SSH private key."),
        fauxToolCall(
          "write",
          { path: path.join(homedir(), ".ssh", "id_rsa"), content: "sandbox-must-not-write\n" },
          { id: "call_sandbox_write_ssh" },
        ),
      ],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes(TEST_PROMPT.useSandboxWriteAbs)) {
    const absolutePath = prompt
      .slice(prompt.indexOf(TEST_PROMPT.useSandboxWriteAbs) + TEST_PROMPT.useSandboxWriteAbs.length)
      .trim()
      .split(/\s+/u)[0];
    return fauxAssistantMessage(
      [
        fauxThinking("Writing an absolute path."),
        fauxToolCall(
          "write",
          { path: absolutePath || "/tmp/pho-code-sandbox-missing-abs.txt", content: "extra-write\n" },
          { id: "call_sandbox_write_abs" },
        ),
      ],
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
  if (prompt.includes(TEST_PROMPT.useWriteOutside)) {
    return fauxAssistantMessage(
      [
        fauxThinking("Writing outside the workspace."),
        fauxToolCall("write", { path: "/tmp/pho-code-outside-note.txt", content: "outside\n" }, { id: "call_write_outside" }),
      ],
      { stopReason: "toolUse" },
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
