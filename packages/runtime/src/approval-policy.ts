import path from "node:path";
import type {
  ApprovalPolicy,
  FrozenApprovalAction,
} from "@pho-agent/runtime/approval-controller";
import type { AgentSandbox } from "./sandbox-runtime";

export const PHO_APPROVAL_RULE_IDS = {
  permanentRemoval: "pho.invariant.permanent-removal",
  privilegeEscalation: "pho.invariant.privilege-escalation",
  destructiveGit: "pho.invariant.destructive-git",
  safetyControlMutation: "pho.invariant.safety-control-mutation",
  containedFile: "pho.boundary.contained-file",
  containedBash: "pho.boundary.contained-bash",
  elevationFile: "pho.boundary.external-file",
  elevationBash: "pho.boundary.broad-bash",
  unknownEffect: "pho.boundary.unknown-effect",
  ownerSecrets: "pho.owner.secrets-private-data",
  ownerProduction: "pho.owner.production-shared-infrastructure",
  ownerExternal: "pho.owner.publishing-payments-iam",
  ownerPersistence: "pho.owner.persistence-startup",
} as const;

export type PhoApprovalInvariantRuleId =
  (typeof PHO_APPROVAL_RULE_IDS)[keyof Pick<
    typeof PHO_APPROVAL_RULE_IDS,
    "permanentRemoval" | "privilegeEscalation" | "destructiveGit" | "safetyControlMutation"
  >];

export interface PhoApprovalActionInput {
  toolName: string;
  input: Readonly<Record<string, unknown>>;
  cwd: string;
}

export interface PhoApprovalPolicyContext {
  sandbox: AgentSandbox;
  protectedControlPaths: readonly string[];
  legacyCompatibility?: () => boolean;
}

export interface PhoApprovalPolicyEvaluation {
  effect: "read" | "write" | "execute" | "unknown";
  boundary: "contained" | "elevation";
  ruleId: string;
  rationale: string;
  target?: string;
  command?: string;
  invariantDeny?: { ruleId: PhoApprovalInvariantRuleId; rationale: string };
}

const FILE_TOOLS = new Set(["read", "write", "edit"]);
const MUTATING_FILE_TOOLS = new Set(["write", "edit", "move_to_trash"]);
const SEARCH_TOOLS = new Set(["find", "grep", "ls"]);
const ALWAYS_CONTAINED_TOOLS = new Set([
  "web_search",
  "ask_user_question",
  "update_plan_document",
  "todo",
  "execute_plan",
  "update_task_brief",
  "complete_task",
]);
const SAFE_BASH = [
  /^(?:pwd|ls|rg|grep|find|head|tail|wc|file)(?:\s|$)/u,
  /^sed\s+-n(?:\s|$)/u,
  /^git\s+(?:status|diff|log|show|rev-parse|branch)(?:\s|$)/u,
  /^(?:bun|npm|pnpm)\s+(?:test|run\s+(?:test|typecheck|lint|build))(?:\s|$)/u,
] as const;
const SHELL_BOUNDARY = /(?:^|\s)(?:https?:\/\/|ssh:|git@|\/[^\s'"`;$|&()]+)/u;
const SHELL_CONTROL = /(?:&&|\|\||[;|<>`]|\$\(|\r|\n)/u;
const GIT_EXECUTION_HOOK = /--(?:ext-diff|textconv)(?:\s|$)/u;
const BIN_PREFIX = "(?:\\/(?:[^\\s;&|()]+)\\/)*";
const PERMANENT_REMOVAL = new RegExp(
  `(?:^|[;&|()]\\s*)(?:(?:command|env)\\s+)*${BIN_PREFIX}(?:rm|unlink|rmdir|shred)(?:\\s|$)|` +
  `(?:^|[;&|()]\\s*)${BIN_PREFIX}find\\b[^;&|]*(?:-delete|-exec(?:dir)?\\b)|` +
  `(?:^|[;&|()]\\s*)${BIN_PREFIX}(?:bash|sh|zsh)\\s+-c\\s+['\\x22][^'\\x22]*\\b(?:rm|unlink|rmdir|shred)\\b`,
  "u",
);
const PRIVILEGE = new RegExp(
  `(?:^|[;&|()]\\s*)(?:(?:command\\s+)|(?:env\\b[^;&|]*\\s+))*${BIN_PREFIX}(?:sudo|doas)(?:\\s|$)`,
  "u",
);
const DESTRUCTIVE_GIT = new RegExp(
  `(?:^|[;&|()]\\s*)${BIN_PREFIX}git\\b[^;&|]*(?:\\bclean\\b|\\breset\\b[^;&|]*--(?:hard|merge|keep)(?:\\s|$)|` +
  `\\bcheckout\\b[^;&|]*(?:(?:-f|--force)(?:\\s|$)|--\\s+\\.)|` +
  `\\brestore\\b[^;&|]*(?:--worktree(?:\\s|$)|(?:^|\\s)\\.(?:\\s|$))|\\bstash\\b[^;&|]*(?:drop|clear)\\b)`,
  "u",
);
const MUTATING_SHELL = /(?:^|[;&|()]\s*)(?:cp|mv|install|tee|truncate|chmod|chown|sed\s+-i|perl\s+-i)(?:\s|$)|(?:^|[^<])>>?/u;
const SCRIPTED_REMOVAL = /\b(?:python(?:3)?\s+-c|node\s+-e|perl\s+-e|ruby\s+-e)\b[^\r\n]*(?:rmtree|unlink|removeSync|rmSync|FileUtils\.rm|\bsystem\s*\([^)]*\brm\b)/iu;
const SAFETY_CONTROL_COMMAND = /(?:^|[;&|()]\s*)(?:(?:command\s+)|(?:env\b[^;&|]*\s+))*(?:crontab|launchctl)(?:\s|$)|\bsystemctl\b[^;&|]*(?:enable|disable|mask|unmask)\b|\bsecurity\b[^;&|]*(?:add|delete|set)-/iu;
const TRANSPORT_OR_AUTH_WEAKENING = /(?:\bcurl\b[^;&|]*(?:-k|--insecure)(?:\s|$)|\bwget\b[^;&|]*--no-check-certificate\b|\b(?:git|npm|pnpm)\s+config\b[^;&|]*(?:sslverify|strict-ssl)\s+(?:false|0)\b|\b(?:NODE_TLS_REJECT_UNAUTHORIZED|GIT_SSL_NO_VERIFY)\s*=\s*(?:0|1)\b|--(?:disable-auth|no-auth|auth=false)\b)/iu;
const SAFETY_CONTROL_TARGET = /(?:^|[/\\])(?:\.ssh|\.gnupg|\.aws|\.kube|\.azure|Keychains|LaunchAgents|LaunchDaemons|autostart|systemd[/\\]user|auth\.json|credentials(?:\.json)?|\.netrc|\.npmrc|[^/\\]+\.(?:pem|key))(?:[/\\]|$)/iu;
const SECRET_OR_PRIVATE = /(?:^|[/\\])(?:\.env(?:\.|$)|\.ssh|\.gnupg|\.aws|\.kube|\.azure|gcloud|Keychains|auth\.json|credentials(?:\.json)?|\.netrc|\.npmrc|config\.json|[^/\\]+\.(?:pem|key))(?:[/\\]|$)/iu;
const PRODUCTION_OR_SHARED = /(?:\b(?:kubectl|helm|terraform|ansible|docker\s+(?:push|context)|systemctl)\b|(?:^|[/\\])(?:etc|var[/\\]lib|usr[/\\]local[/\\]etc)(?:[/\\]|$)|\b(?:prod|production)\b)/iu;
const PUBLISHING_PAYMENTS_IAM = /(?:\b(?:npm|pnpm|bun)\s+publish\b|\bgh\s+release\b|\bgit\s+push\b|\b(?:aws|gcloud|az)\b[^\r\n]*(?:iam|policy|role|account)\b|\b(?:stripe|paypal)\b)/iu;
const PERSISTENCE_OR_STARTUP = /(?:\b(?:crontab|launchctl)\b|\bsystemctl\b[^\r\n]*(?:enable|disable|mask|unmask)\b|(?:^|[/\\])(?:LaunchAgents|LaunchDaemons|autostart|systemd[/\\]user)(?:[/\\]|$))/iu;

export async function evaluatePhoApprovalPolicy(
  action: PhoApprovalActionInput,
  context: PhoApprovalPolicyContext,
): Promise<PhoApprovalPolicyEvaluation> {
  const command = bashCommand(action);
  const invariant = command
    ? bashInvariant(command, context.protectedControlPaths)
    : fileInvariant(action, context.protectedControlPaths);
  if (invariant) {
    return {
      effect: command ? "execute" : MUTATING_FILE_TOOLS.has(action.toolName) ? "write" : "read",
      boundary: "elevation",
      ruleId: invariant.ruleId,
      rationale: invariant.rationale,
      ...(command ? { command } : {}),
      invariantDeny: invariant,
    };
  }

  if (FILE_TOOLS.has(action.toolName)) {
    const evaluated = await evaluateFileBoundary(action, context.sandbox);
    return strengthenCanonicalFileInvariant(action, evaluated, context.protectedControlPaths);
  }
  if (SEARCH_TOOLS.has(action.toolName)) {
    return evaluateSearchBoundary(action, context.sandbox);
  }
  if (action.toolName === "move_to_trash") {
    const evaluated = await evaluateTrashBoundary(action, context.sandbox);
    return strengthenCanonicalFileInvariant(action, evaluated, context.protectedControlPaths);
  }
  if (ALWAYS_CONTAINED_TOOLS.has(action.toolName)) {
    return {
      effect: "read",
      boundary: "contained",
      ruleId: "pho.boundary.baked-safe-tool",
      rationale: "This baked tool is contained by its release-owned capability.",
    };
  }
  if (command) {
    const contained = context.sandbox.snapshot().enabled &&
      context.sandbox.snapshot().status === "healthy" &&
      SAFE_BASH.some((pattern) => pattern.test(command)) &&
      !SHELL_BOUNDARY.test(command) &&
      !SHELL_CONTROL.test(command) &&
      !GIT_EXECUTION_HOOK.test(command);
    return {
      effect: "execute",
      boundary: contained ? "contained" : "elevation",
      ruleId: contained ? PHO_APPROVAL_RULE_IDS.containedBash : PHO_APPROVAL_RULE_IDS.elevationBash,
      rationale: contained
        ? "The command is a recognized routine operation inside the active sandbox boundary."
        : "The command has broad or unknown effects and requires an exact elevation.",
      command,
    };
  }
  return {
    effect: "unknown",
    boundary: "elevation",
    ruleId: PHO_APPROVAL_RULE_IDS.unknownEffect,
    rationale: "The tool exposes an unknown side effect and requires explicit authorization.",
  };
}

async function evaluateSearchBoundary(
  action: PhoApprovalActionInput,
  sandbox: AgentSandbox,
): Promise<PhoApprovalPolicyEvaluation> {
  const requested = typeof action.input.path === "string" && action.input.path.trim()
    ? action.input.path.trim()
    : action.cwd;
  const verdict = await sandbox.evaluateFileTool({ toolName: "read", requestedPath: requested, cwd: action.cwd });
  return {
    effect: "read",
    boundary: verdict.action === "allow" ? "contained" : "elevation",
    ruleId: verdict.action === "allow" ? PHO_APPROVAL_RULE_IDS.containedFile : PHO_APPROVAL_RULE_IDS.elevationFile,
    rationale: verdict.action === "allow"
      ? "The exact search root is inside the active file boundary."
      : verdict.action === "deny" ? verdict.reason : "The search root is not proven contained.",
    target: verdict.action !== "defer" && verdict.canonicalPath
      ? verdict.canonicalPath
      : path.resolve(action.cwd, requested),
  };
}

async function evaluateTrashBoundary(
  action: PhoApprovalActionInput,
  sandbox: AgentSandbox,
): Promise<PhoApprovalPolicyEvaluation> {
  const requested = typeof action.input.path === "string" ? action.input.path.trim() : "";
  const verdict = await sandbox.evaluateFileTool({ toolName: "write", requestedPath: requested, cwd: action.cwd });
  return {
    effect: "write",
    boundary: verdict.action === "allow" ? "contained" : "elevation",
    ruleId: verdict.action === "allow" ? "pho.boundary.recoverable-trash" : PHO_APPROVAL_RULE_IDS.elevationFile,
    rationale: verdict.action === "allow"
      ? "The target is inside the boundary and removal is recoverable through Trash."
      : verdict.action === "deny" ? verdict.reason : "The Trash target is not proven contained.",
    ...(verdict.action !== "defer" && verdict.canonicalPath
      ? { target: verdict.canonicalPath }
      : requested ? { target: path.resolve(action.cwd, requested) } : {}),
  };
}

function strengthenCanonicalFileInvariant(
  action: PhoApprovalActionInput,
  evaluated: PhoApprovalPolicyEvaluation,
  protectedControlPaths: readonly string[],
): PhoApprovalPolicyEvaluation {
  if (!evaluated.target || !MUTATING_FILE_TOOLS.has(action.toolName)) return evaluated;
  const invariant = targetSafetyInvariant(evaluated.target, protectedControlPaths);
  return invariant
    ? {
        ...evaluated,
        boundary: "elevation",
        ruleId: invariant.ruleId,
        rationale: invariant.rationale,
        invariantDeny: invariant,
      }
    : evaluated;
}

export function createPhoApprovalPolicy(context: PhoApprovalPolicyContext): ApprovalPolicy {
  return async (action: FrozenApprovalAction) => {
    const cwd = approvalCwd(action);
    const evaluated = await evaluatePhoApprovalPolicy(
      { toolName: action.toolName, input: action.input as Readonly<Record<string, unknown>>, cwd },
      context,
    );
    const legacy = context.legacyCompatibility?.() === true;
    const packageAsk = hasCapturedPermissionAsk(action);
    const ownerRequirement = deterministicOwnerRequirement(action, evaluated.target);
    const boundary = {
      outcome:
        legacy || (!packageAsk && evaluated.boundary === "contained")
          ? ("allow" as const)
          : ("review" as const),
      ruleId: legacy
        ? "pho.compatibility.legacy-permission"
        : packageAsk ? "pho.boundary.permission-package-ask" : evaluated.ruleId,
      rationale: legacy
        ? "The legacy Custom permission package remains the Ask-mode owner until explicit migration."
        : packageAsk
          ? "The pinned permission policy requested review for this exact tool call."
        : evaluated.rationale,
    };
    return {
      boundary,
      ...(ownerRequirement
        ? {
            project: {
              outcome: "require-owner" as const,
              ruleId: ownerRequirement.ruleId,
              rationale: ownerRequirement.rationale,
            },
          }
        : {}),
      ...(evaluated.invariantDeny
        ? {
            invariantDeny: {
              outcome: "deny" as const,
              ruleId: evaluated.invariantDeny.ruleId,
              rationale: evaluated.invariantDeny.rationale,
            },
          }
        : {}),
    };
  };
}

function deterministicOwnerRequirement(
  action: FrozenApprovalAction,
  canonicalTarget?: string,
): { ruleId: string; rationale: string } | undefined {
  const evidence = `${action.toolName}\n${action.inputCanonical}\n${canonicalTarget ?? ""}`;
  if (SECRET_OR_PRIVATE.test(evidence)) {
    return {
      ruleId: PHO_APPROVAL_RULE_IDS.ownerSecrets,
      rationale: "Secrets and private owner data require a direct owner decision and are never sent to Auto review.",
    };
  }
  if (PERSISTENCE_OR_STARTUP.test(evidence)) {
    return {
      ruleId: PHO_APPROVAL_RULE_IDS.ownerPersistence,
      rationale: "Persistence and startup changes require a direct owner decision.",
    };
  }
  if (PUBLISHING_PAYMENTS_IAM.test(evidence)) {
    return {
      ruleId: PHO_APPROVAL_RULE_IDS.ownerExternal,
      rationale: "Publishing, payments, or identity and access changes require a direct owner decision.",
    };
  }
  if (PRODUCTION_OR_SHARED.test(evidence)) {
    return {
      ruleId: PHO_APPROVAL_RULE_IDS.ownerProduction,
      rationale: "Production or shared infrastructure changes require a direct owner decision.",
    };
  }
  return undefined;
}

function hasCapturedPermissionAsk(action: FrozenApprovalAction): boolean {
  const context = action.context;
  if (!context || Array.isArray(context) || typeof context !== "object") return false;
  const asks = (context as Record<string, unknown>).permissionAsks;
  return Array.isArray(asks) && asks.length > 0;
}

async function evaluateFileBoundary(
  action: PhoApprovalActionInput,
  sandbox: AgentSandbox,
): Promise<PhoApprovalPolicyEvaluation> {
  const requested = typeof action.input.path === "string" ? action.input.path.trim() : "";
  const verdict = await sandbox.evaluateFileTool({
    toolName: action.toolName,
    requestedPath: requested,
    cwd: action.cwd,
  });
  const contained = verdict.action === "allow";
  const target = verdict.action !== "defer" && verdict.canonicalPath
    ? verdict.canonicalPath
    : requested ? path.resolve(action.cwd, requested) : undefined;
  return {
    effect: MUTATING_FILE_TOOLS.has(action.toolName) ? "write" : "read",
    boundary: contained ? "contained" : "elevation",
    ruleId: contained ? PHO_APPROVAL_RULE_IDS.containedFile : PHO_APPROVAL_RULE_IDS.elevationFile,
    rationale: contained
      ? "The exact file target is inside the active in-process sandbox policy."
      : verdict.action === "deny"
        ? verdict.reason
        : "The exact file target is not proven to be inside the active boundary.",
    ...(target ? { target } : {}),
  };
}

function bashCommand(action: PhoApprovalActionInput): string | undefined {
  if (action.toolName !== "bash" || typeof action.input.command !== "string") return undefined;
  const command = action.input.command.trim();
  return command || undefined;
}

function approvalCwd(action: FrozenApprovalAction): string {
  const value = action.context;
  if (value && !Array.isArray(value) && typeof value === "object") {
    const cwd = (value as Record<string, unknown>).cwd;
    if (typeof cwd === "string" && cwd.trim()) return path.resolve(cwd);
  }
  throw new TypeError("Approval action is missing its canonical working directory.");
}

function bashInvariant(
  command: string,
  protectedControlPaths: readonly string[],
): PhoApprovalPolicyEvaluation["invariantDeny"] {
  if (PERMANENT_REMOVAL.test(command)) {
    return {
      ruleId: PHO_APPROVAL_RULE_IDS.permanentRemoval,
      rationale: "Permanent filesystem removal is unavailable. Use the recoverable Trash tool.",
    };
  }
  if (SCRIPTED_REMOVAL.test(command)) {
    return {
      ruleId: PHO_APPROVAL_RULE_IDS.permanentRemoval,
      rationale: "Permanent filesystem removal through an interpreter is unavailable. Use the recoverable Trash tool.",
    };
  }
  if (PRIVILEGE.test(command)) {
    return {
      ruleId: PHO_APPROVAL_RULE_IDS.privilegeEscalation,
      rationale: "Privilege escalation is unavailable from agent tools.",
    };
  }
  if (DESTRUCTIVE_GIT.test(command)) {
    return {
      ruleId: PHO_APPROVAL_RULE_IDS.destructiveGit,
      rationale: "This destructive Git operation would bypass Pho Code recovery.",
    };
  }
  if (
    SAFETY_CONTROL_COMMAND.test(command) ||
    TRANSPORT_OR_AUTH_WEAKENING.test(command) ||
    (MUTATING_SHELL.test(command) &&
      (SAFETY_CONTROL_TARGET.test(command) || protectedControlPaths.some((target) => command.includes(target))))
  ) {
    return {
      ruleId: PHO_APPROVAL_RULE_IDS.safetyControlMutation,
      rationale: "Agent tools cannot modify active approval or sandbox safety controls.",
    };
  }
  return undefined;
}

function fileInvariant(
  action: PhoApprovalActionInput,
  protectedControlPaths: readonly string[],
): PhoApprovalPolicyEvaluation["invariantDeny"] {
  if (!MUTATING_FILE_TOOLS.has(action.toolName) || typeof action.input.path !== "string") return undefined;
  const target = path.resolve(action.cwd, action.input.path);
  return targetSafetyInvariant(target, protectedControlPaths);
}

function targetSafetyInvariant(
  target: string,
  protectedControlPaths: readonly string[],
): PhoApprovalPolicyEvaluation["invariantDeny"] {
  if (!SAFETY_CONTROL_TARGET.test(target) &&
      !protectedControlPaths.some((control) => target === control || target.startsWith(`${control}${path.sep}`))) {
    return undefined;
  }
  return {
    ruleId: PHO_APPROVAL_RULE_IDS.safetyControlMutation,
    rationale: "Agent tools cannot modify active approval or sandbox safety controls.",
  };
}
