import { Type } from "@earendil-works/pi-ai";
import { defineTool, type InlineExtension } from "@earendil-works/pi-coding-agent";
import {
  ASK_USER_MAX_HEADER_CHARS,
  ASK_USER_MAX_LABEL_CHARS,
  ASK_USER_MAX_OPTIONS,
  ASK_USER_MAX_QUESTIONS,
  ASK_USER_MIN_OPTIONS,
  ASK_USER_QUESTION_TOOL_NAME,
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

export const PLAN_AGENT_FEATURE_ID = "plan-agent";
export const PLAN_AGENT_FEATURE_VERSION = "0.1.0";

const ASK_USER_PROMPT_SNIPPET = `Ask the user up to ${ASK_USER_MAX_QUESTIONS} structured questions (${ASK_USER_MIN_OPTIONS}-${ASK_USER_MAX_OPTIONS} options each) when requirements are ambiguous`;

const ASK_USER_PROMPT_GUIDELINES: string[] = [
  `Use ask_user_question whenever the user's request is underspecified and you cannot proceed without concrete decisions — you can ask up to ${ASK_USER_MAX_QUESTIONS} questions per invocation.`,
  `Each question MUST have ${ASK_USER_MIN_OPTIONS}-${ASK_USER_MAX_OPTIONS} options. Every option requires a concise label (1-5 words) and a description explaining what the choice means or its trade-offs. The user can additionally type a custom answer via the automatically appended "Type something." row on every question, or press Esc to abandon the questionnaire. Do NOT author "Other" or "Type something." labels yourself — reserved labels are rejected at runtime.`,
  `Set multiSelect: true when multiple answers are valid. Provide an options[].preview markdown string when an option benefits from richer side-by-side context (mockups, code snippets, diagrams, configs) — single-select only. If you recommend a specific option, make that the first option and append "(Recommended)" to its label.`,
  "Do not stack multiple ask_user_question calls back-to-back — group all clarifying questions into one invocation.",
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
    },
  };
}
