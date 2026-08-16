import { Type } from "@earendil-works/pi-ai";
import { defineTool, type InlineExtension } from "@earendil-works/pi-coding-agent";
import {
  ASK_USER_MAX_HEADER_CHARS,
  ASK_USER_MAX_LABEL_CHARS,
  ASK_USER_MAX_OPTIONS,
  ASK_USER_MAX_QUESTIONS,
  ASK_USER_MIN_OPTIONS,
  ASK_USER_QUESTION_TOOL_NAME,
  EXECUTE_PLAN_TOOL_NAME,
  PLAN_DOCUMENT_MAX_BYTES,
  UPDATE_PLAN_DOCUMENT_TOOL_NAME,
  planDocumentTooLarge,
  type AskUserQuestion,
} from "@pho-code/protocol";
import {
  buildAskUserHostFailureResult,
  buildAskUserQuestionnaireResponse,
  buildAskUserValidationResult,
  validateAskUserQuestionnaire,
} from "./ask-user-question";
import { presentAskUserQuestionnaire } from "./ask-user-present";
import type { HarnessFeature } from "./features";
import {
  collectContextPromptRecord,
  enabledToolNames,
} from "./context-prompt";
import {
  PLAN_AGENT_CUSTOM_TYPE,
  beginPlanExecuteRecord,
  collectPlanAgentRecord,
  emptyPlanAgentRecord,
  intersectPlanActiveTools,
  isPlanForbiddenTool,
  planExecuteContextMessage,
  planExecuteRefusal,
  planExecuteRefusalMessage,
  planExecuteStartedMessage,
  planModeContextMessage,
  writesOffInPlan,
} from "./plan-agent-state";
import { createTodoTool, reconstructPlanTodos, remainingPlanTodos } from "./todo-tool";

export const PLAN_AGENT_FEATURE_ID = "plan-agent";
export const PLAN_AGENT_FEATURE_VERSION = "0.1.0";

const ASK_USER_PROMPT_SNIPPET = `Ask the user up to ${ASK_USER_MAX_QUESTIONS} structured questions (${ASK_USER_MIN_OPTIONS}-${ASK_USER_MAX_OPTIONS} options each) when requirements are ambiguous`;

const ASK_USER_PROMPT_GUIDELINES: string[] = [
  `Use ask_user_question whenever the user's request is underspecified and you cannot proceed without concrete decisions — you can ask up to ${ASK_USER_MAX_QUESTIONS} questions per invocation.`,
  `Each question MUST have ${ASK_USER_MIN_OPTIONS}-${ASK_USER_MAX_OPTIONS} options. Every option requires a concise label (1-5 words) and a description explaining what the choice means or its trade-offs. The user can additionally type a custom answer via the automatically appended "Type something." row on every question, or press Esc to abandon the questionnaire. Do NOT author "Other" or "Type something." labels yourself — reserved labels are rejected at runtime.`,
  `Set multiSelect: true when multiple answers are valid. Provide an options[].preview markdown string when an option benefits from richer side-by-side context (mockups, code snippets, diagrams, configs) — single-select only. If you recommend a specific option, make that the first option and append "(Recommended)" to its label.`,
  "Do not stack multiple ask_user_question calls back-to-back — group all clarifying questions into one invocation.",
];

const PLAN_DOCUMENT_PROMPT_SNIPPET =
  "Replace the Plan sidebar document with markdown the owner can Execute. Do not rely on a Plan: heading in chat.";

const PLAN_DOCUMENT_PROMPT_GUIDELINES: string[] = [
  "Call update_plan_document with the full replacement markdown for the Plan sidebar. That document is the source of truth for Execute.",
  "Keep the document bounded (256 KiB). Use GFM markdown; mermaid fences are allowed. Do not emit raw HTML.",
  "Ask with ask_user_question when the plan is still ambiguous instead of guessing.",
];

const EXECUTE_PLAN_PROMPT_SNIPPET =
  "Start Execute when the owner asks to run the plan. Restores write tools for this run.";

const EXECUTE_PLAN_PROMPT_GUIDELINES: string[] = [
  "Call execute_plan when the owner asks to execute, implement, go ahead, or start the plan. The Plan surface Execute button does the same thing.",
  "Do not call execute_plan unprompted, and do not treat switching the composer chip to Agent as Execute.",
  "After execute_plan succeeds, file write and edit tools are available. Tracked writes still go through change review. Shell is not sandboxed.",
];

export function createPlanAgentFeature(): HarnessFeature {
  return {
    id: PLAN_AGENT_FEATURE_ID,
    version: PLAN_AGENT_FEATURE_VERSION,
    extensionFactories: [createPlanAgentExtension()],
    expected: { extensions: 1 },
  };
}

export function createPlanAgentExtension(): InlineExtension {
  return {
    name: PLAN_AGENT_FEATURE_ID,
    factory(pi) {
      pi.registerTool(
        defineTool({
          name: ASK_USER_QUESTION_TOOL_NAME,
          label: "Ask user",
          description: `Ask the user one or more structured questions during execution. Use when you need to:
1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take

Usage notes:
- Users can type a custom answer via the automatically appended "Type something." row on every question or press Esc to abandon the questionnaire. Do NOT author "Other" or "Type something." labels yourself — reserved labels are rejected at runtime.
- Use multiSelect: true when multiple answers are valid.
- If you recommend a specific option, make that the first option in the list and add "(Recommended)" at the end of the label.

Preview feature:
Use the optional preview field on options when presenting concrete artifacts that users need to visually compare. Previews are markdown and are only supported for single-select questions.`,
          promptSnippet: ASK_USER_PROMPT_SNIPPET,
          promptGuidelines: ASK_USER_PROMPT_GUIDELINES,
          parameters: Type.Object({
            questions: Type.Array(
              Type.Object({
                question: Type.String({
                  description:
                    "The complete question to ask the user. Should be clear, specific, and end with a question mark.",
                }),
                header: Type.String({
                  description: `MAX ${ASK_USER_MAX_HEADER_CHARS} CHARACTERS. Very short chip/tag shown next to the question.`,
                }),
                options: Type.Array(
                  Type.Object({
                    label: Type.String({
                      description: `MAX ${ASK_USER_MAX_LABEL_CHARS} CHARACTERS. Concise display text (1-5 words).`,
                    }),
                    description: Type.String({
                      description: "Explanation of what this option means or its trade-offs.",
                    }),
                    preview: Type.Optional(
                      Type.String({
                        description: "Optional markdown shown when this single-select option is focused.",
                      }),
                    ),
                  }),
                  {
                    minItems: ASK_USER_MIN_OPTIONS,
                    maxItems: ASK_USER_MAX_OPTIONS,
                    description: `Available choices (${ASK_USER_MIN_OPTIONS}-${ASK_USER_MAX_OPTIONS}). Do not author "Type something."`,
                  },
                ),
                multiSelect: Type.Optional(
                  Type.Boolean({
                    description: "Allow selecting multiple options. Type something remains available.",
                  }),
                ),
              }),
              {
                minItems: 1,
                maxItems: ASK_USER_MAX_QUESTIONS,
                description: `Questions to ask the user (1-${ASK_USER_MAX_QUESTIONS})`,
              },
            ),
          }),
          async execute(_toolCallId, params, signal, _onUpdate, ctx) {
            const questions = params.questions as AskUserQuestion[];
            if (!ctx.hasUI) {
              return buildAskUserHostFailureResult("no_ui");
            }
            const validation = validateAskUserQuestionnaire({ questions });
            if (!validation.ok) {
              return buildAskUserValidationResult(validation);
            }
            const result = await presentAskUserQuestionnaire({
              ui: ctx.ui,
              hasUI: ctx.hasUI,
              questions,
              ...(signal ? { signal } : {}),
            });
            return buildAskUserQuestionnaireResponse(result, questions);
          },
        }),
      );

      pi.registerTool(createTodoTool());

      pi.registerTool(
        defineTool({
          name: UPDATE_PLAN_DOCUMENT_TOOL_NAME,
          label: "Plan document",
          description: `Replace the Plan sidebar document with markdown the owner can read, edit, and Execute.
Use this in Plan mode instead of hoping a "Plan:" heading appears in chat.
The call replaces the whole document. Keep it under ${PLAN_DOCUMENT_MAX_BYTES} bytes.`,
          promptSnippet: PLAN_DOCUMENT_PROMPT_SNIPPET,
          promptGuidelines: PLAN_DOCUMENT_PROMPT_GUIDELINES,
          parameters: Type.Object({
            markdown: Type.String({
              description: "Full replacement markdown for the Plan document (GFM, optional mermaid).",
            }),
          }),
          async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const markdown = typeof params.markdown === "string" ? params.markdown : "";
            if (planDocumentTooLarge(markdown)) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: `Plan document is too large (max ${PLAN_DOCUMENT_MAX_BYTES} bytes). Shorten it and try again.`,
                  },
                ],
                details: { error: "text_too_long" },
              };
            }
            const current = collectPlanAgentRecord(ctx.sessionManager.getEntries()) ?? emptyPlanAgentRecord();
            if (!writesOffInPlan(current)) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: "update_plan_document is available in Plan mode only. Switch to Plan before writing the document.",
                  },
                ],
                details: { error: "not_in_plan" },
              };
            }
            pi.appendEntry(PLAN_AGENT_CUSTOM_TYPE, {
              mode: current.mode,
              executing: current.executing,
              documentMarkdown: markdown,
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: markdown.trim().length > 0 ? "Updated the Plan document." : "Cleared the Plan document.",
                },
              ],
              details: { bytes: markdown.length },
            };
          },
        }),
      );

      pi.registerTool(
        defineTool({
          name: EXECUTE_PLAN_TOOL_NAME,
          label: "Execute",
          description: `Start Execute for the current Plan document. Call this when the owner asks to execute, implement, go ahead, or start the plan.
The Plan surface Execute button does the same thing. Do not call this unprompted.
After success, write and edit tools are available for the rest of this turn. Tracked writes still go through change review. Shell is not sandboxed.`,
          promptSnippet: EXECUTE_PLAN_PROMPT_SNIPPET,
          promptGuidelines: EXECUTE_PLAN_PROMPT_GUIDELINES,
          parameters: Type.Object({}),
          async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
            const current = collectPlanAgentRecord(ctx.sessionManager.getEntries()) ?? emptyPlanAgentRecord();
            const refusal = planExecuteRefusal(current);
            if (refusal) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: planExecuteRefusalMessage(refusal),
                  },
                ],
                details: { error: refusal },
              };
            }
            const next = beginPlanExecuteRecord(current);
            pi.appendEntry(PLAN_AGENT_CUSTOM_TYPE, next);
            const contextRecord = collectContextPromptRecord(ctx.sessionManager.getEntries());
            pi.setActiveTools(
              intersectPlanActiveTools({
                registeredNames: pi.getAllTools().map((tool) => tool.name),
                contextEnabledNames: contextRecord ? enabledToolNames(contextRecord.sections) : undefined,
                mode: next.mode,
                executing: next.executing,
              }),
            );
            const remaining = remainingPlanTodos(reconstructPlanTodos(ctx.sessionManager.getBranch()));
            return {
              content: [
                {
                  type: "text" as const,
                  text: planExecuteStartedMessage(remaining),
                },
              ],
              details: { executing: true },
            };
          },
        }),
      );

      pi.on("before_agent_start", async (_event, ctx) => {
        const record = collectPlanAgentRecord(ctx.sessionManager.getEntries());
        if (!record) {
          return undefined;
        }
        if (writesOffInPlan(record)) {
          return {
            message: {
              customType: "pho-code.plan-mode-context",
              content: planModeContextMessage(record.documentMarkdown),
              display: false,
            },
          };
        }
        if (record.executing) {
          const remaining = remainingPlanTodos(reconstructPlanTodos(ctx.sessionManager.getBranch()));
          return {
            message: {
              customType: "pho-code.plan-execute-context",
              content: planExecuteContextMessage(record.documentMarkdown, remaining),
              display: false,
            },
          };
        }
        return undefined;
      });

      pi.on("tool_call", async (event, ctx) => {
        const record = collectPlanAgentRecord(ctx.sessionManager.getEntries());
        if (!writesOffInPlan(record) || !isPlanForbiddenTool(event.toolName)) {
          return undefined;
        }
        return {
          block: true,
          reason:
            "Plan mode keeps write, edit, move_to_trash, and Cursor SDK tools off. This is not a sandbox; switch to Agent or Execute to restore file writes.",
        };
      });
    },
  };
}
