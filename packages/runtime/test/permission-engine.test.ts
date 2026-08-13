import { describe, expect, test } from "bun:test";
import { wildcardMatch } from "../node_modules/@gotgenes/pi-permission-system/src/wildcard-matcher.ts";
import { DEVELOPER_PERMISSION } from "../src/permission-presets";

type PermissionAction = "allow" | "ask" | "deny";

function lastMatchingAction(patterns: Record<string, unknown>, value: string): PermissionAction {
  let action: PermissionAction = "ask";
  for (const [pattern, entry] of Object.entries(patterns)) {
    if (!wildcardMatch(pattern, value)) {
      continue;
    }
    if (entry === "allow" || entry === "ask" || entry === "deny") {
      action = entry;
      continue;
    }
    if (entry !== null && typeof entry === "object" && "action" in entry && (entry as { action?: unknown }).action === "deny") {
      action = "deny";
    }
  }
  return action;
}

const bash = DEVELOPER_PERMISSION.bash as Record<string, unknown>;
const pathRules = DEVELOPER_PERMISSION.path as Record<string, unknown>;

describe("permission-system 24.0.0 Developer pattern characterization", () => {
  test("allows reviewed inspection and validation command families", () => {
    const allowed = [
      "pwd",
      "cd src",
      "ls",
      "ls -la",
      "head README.md",
      "tail -n 20 logs.txt",
      "wc -l src/a.ts",
      "file package.json",
      "sed -n '1,4p' README.md",
      "git status",
      "git status --short",
      "git diff",
      "git diff --stat",
      "git log -1",
      "git show HEAD",
      "git rev-parse HEAD",
      "git branch",
      "git branch --show-current",
      "bun run typecheck",
      "bun run lint",
      "bun test",
      "bun test packages/runtime",
      "bun run test:desktop",
      "bun run build",
      "npm test",
      "pnpm run lint",
    ];
    for (const command of allowed) {
      expect(lastMatchingAction(bash, command)).toBe("allow");
    }
  });

  test("keeps mutating, wrapper, and unpublished command families on ask or deny", () => {
    expect(lastMatchingAction(bash, "prettier --write src/a.ts")).toBe("ask");
    expect(lastMatchingAction(bash, "bun install")).toBe("ask");
    expect(lastMatchingAction(bash, "npm install lodash")).toBe("ask");
    expect(lastMatchingAction(bash, "npm run db:migrate")).toBe("ask");
    expect(lastMatchingAction(bash, "git commit -m 'wip'")).toBe("ask");
    expect(lastMatchingAction(bash, "git push origin main")).toBe("ask");
    expect(lastMatchingAction(bash, "git push --force")).toBe("ask");
    expect(lastMatchingAction(bash, "bash -c 'pwd'")).toBe("ask");
    expect(lastMatchingAction(bash, "env git status")).toBe("ask");
    expect(lastMatchingAction(bash, "sed -i s/a/b/ file.ts")).toBe("ask");
    expect(lastMatchingAction(bash, "git branch -d topic")).toBe("ask");
    expect(lastMatchingAction(bash, "rg TODO")).toBe("ask");
    expect(lastMatchingAction(bash, "rg --pre='sh helper.sh' TODO")).toBe("ask");
    expect(lastMatchingAction(bash, "grep -n foo src/index.ts")).toBe("ask");
    expect(lastMatchingAction(bash, "find . -name '*.ts'")).toBe("ask");
    expect(lastMatchingAction(bash, "git diff --ext-diff HEAD")).toBe("ask");
    expect(lastMatchingAction(bash, "git show --textconv HEAD")).toBe("ask");
  });

  test("denies permanent removal, privilege escalation, and destructive git", () => {
    const denied = [
      "rm -rf src",
      "unlink secret.env",
      "rmdir build",
      "shred -u notes.txt",
      "sudo ls",
      "doas rm -rf /",
      "git clean -fd",
      "git reset --hard HEAD",
      "git checkout -f main",
      "git checkout --force .",
      "git restore --worktree src/a.ts",
      "find . -delete",
      "find . -type f -delete",
      "find . -exec rm {} ;",
    ];
    for (const command of denied) {
      expect(lastMatchingAction(bash, command)).toBe("deny");
    }
  });

  test("path rules deny secrets while allowing ordinary and example env files", () => {
    expect(lastMatchingAction(pathRules, "src/index.ts")).toBe("allow");
    expect(lastMatchingAction(pathRules, ".env.example")).toBe("allow");
    expect(lastMatchingAction(pathRules, ".env")).toBe("deny");
    expect(lastMatchingAction(pathRules, ".env.local")).toBe("deny");
    expect(lastMatchingAction(pathRules, "src/.env.production")).toBe("deny");
    expect(lastMatchingAction(pathRules, `${process.env.HOME ?? "/Users/owner"}/.ssh/id_rsa`)).toBe("deny");
    expect(lastMatchingAction(pathRules, "id_ed25519")).toBe("deny");
    expect(lastMatchingAction(pathRules, "certs/prod.pem")).toBe("deny");
  });

  test("a trailing space-star pattern matches the bare command", () => {
    expect(wildcardMatch("git *", "git")).toBe(true);
    expect(wildcardMatch("git *", "git status")).toBe(true);
    expect(wildcardMatch("git status", "git status --short")).toBe(false);
  });
});
