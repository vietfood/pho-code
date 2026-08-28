import type { AgentSession } from "@pho-agent/runtime/feature-api";
import { sessionKeyId, type PlanTodoItem, type SessionKey } from "@pho-code/protocol";
import type { CompiledContextPromptCache } from "./compiled-context-prompt-cache";
import {
  collectContextPromptRecord,
  enabledToolNames,
  projectSessionContextPrompt,
  type ToolPromptSource,
} from "./context-prompt";
import {
  collectPlanAgentRecord,
  emptyPlanAgentRecord,
  intersectPlanActiveTools,
  PLAN_AGENT_CUSTOM_TYPE,
  projectSessionPlan,
  type PlanAgentRecord,
} from "./plan-agent-state";
import { reconstructPlanTodos } from "./todo-tool";
import { projectSessionMessages } from "./transcript";

/** The parts of a live session the Plan and context-prompt projections read. */
export interface PlanContextSession {
  key: SessionKey;
  workspace: { path: string };
  activeRun?: { settled: boolean };
  planTodos: PlanTodoItem[];
  runtime: { session: AgentSession };
}

/** Tool prompt sources for a session, as the context-prompt surface shows them. */
export function toolPromptSources(session: AgentSession): ToolPromptSource[] {
  return session.getAllTools().map((tool) => {
    const definition = session.getToolDefinition(tool.name);
    return {
      name: tool.name,
      ...(definition?.label ? { label: definition.label } : {}),
      description: tool.description,
      ...(definition?.promptSnippet ? { promptSnippet: definition.promptSnippet } : {}),
      ...(tool.promptGuidelines && tool.promptGuidelines.length > 0
        ? { promptGuidelines: [...tool.promptGuidelines] }
        : {}),
    };
  });
}

export interface PlanContextProjector<TSession extends PlanContextSession> {
  /** The context prompt is only editable before the first message of an idle chat. */
  contextPromptEditable(session: TSession): boolean;
  projectContextPrompt(session: TSession): ReturnType<typeof projectSessionContextPrompt>;
  projectPlan(session: TSession): ReturnType<typeof projectSessionPlan>;
  /** Rebuild the session's todo list from its Pi branch after open or rebind. */
  hydrateTodos(session: TSession): void;
  /** Record todos a tool produced; returns whether anything was recorded. */
  rememberTodos(session: TSession, todos: PlanTodoItem[] | undefined): boolean;
  readPlanAgent(session: TSession): PlanAgentRecord;
  persistPlanAgent(session: TSession, patch: Partial<PlanAgentRecord>): PlanAgentRecord;
  /**
   * Recompute which tools the session may call, and keep the compiled-prompt
   * cache in step with the record the policy was derived from.
   */
  applyToolPolicy(session: TSession): void;
}

/**
 * Owns the context-prompt and Plan/Agent projections over a live session.
 *
 * Extracted from `createPhoCodeRuntime`. These functions read no runtime state
 * beyond the compiled-prompt cache, so they never needed the closure — keeping
 * them there made a reader prove that before trusting any of them.
 */
export function createPlanContextProjector<TSession extends PlanContextSession>(deps: {
  compiledPrompts: CompiledContextPromptCache;
}): PlanContextProjector<TSession> {
  function readPlanAgent(session: TSession): PlanAgentRecord {
    return collectPlanAgentRecord(session.runtime.session.sessionManager.getEntries()) ?? emptyPlanAgentRecord();
  }

  function contextPromptEditable(session: TSession): boolean {
    if (session.activeRun && !session.activeRun.settled) {
      return false;
    }
    return projectSessionMessages(session.runtime.session).length === 0;
  }

  return {
    readPlanAgent,
    contextPromptEditable,
    projectContextPrompt(live) {
      const session = live.runtime.session;
      return projectSessionContextPrompt({
        cwd: live.workspace.path,
        tools: toolPromptSources(session),
        agentsFiles: session.resourceLoader.getAgentsFiles().agentsFiles,
        liveSystemPrompt: session.systemPrompt,
        record: collectContextPromptRecord(session.sessionManager.getEntries()),
        editable: contextPromptEditable(live),
      });
    },
    projectPlan(live) {
      return projectSessionPlan(
        collectPlanAgentRecord(live.runtime.session.sessionManager.getEntries()),
        live.planTodos,
      );
    },
    hydrateTodos(live) {
      live.planTodos = reconstructPlanTodos(live.runtime.session.sessionManager.getBranch());
    },
    rememberTodos(live, todos) {
      if (todos === undefined) {
        return false;
      }
      live.planTodos = todos;
      return true;
    },
    persistPlanAgent(live, patch) {
      const next: PlanAgentRecord = { ...readPlanAgent(live), ...patch };
      live.runtime.session.sessionManager.appendCustomEntry(PLAN_AGENT_CUSTOM_TYPE, next);
      return next;
    },
    applyToolPolicy(live) {
      const session = live.runtime.session;
      const contextRecord = collectContextPromptRecord(session.sessionManager.getEntries());
      deps.compiledPrompts.record(sessionKeyId(live.key), contextRecord?.compiled);
      const planRecord = readPlanAgent(live);
      session.setActiveToolsByName(
        intersectPlanActiveTools({
          registeredNames: session.getAllTools().map((tool) => tool.name),
          contextEnabledNames: contextRecord ? enabledToolNames(contextRecord.sections) : undefined,
          mode: planRecord.mode,
          executing: planRecord.executing,
        }),
      );
    },
  };
}
