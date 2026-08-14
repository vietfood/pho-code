import { describe, expect, test } from "bun:test";
import { presentPermissionMessage } from "../src/permission-prompt";

describe("presentPermissionMessage", () => {
  test("summarizes a fetch tool prompt and keeps the raw JSON for details", () => {
    const message =
      'Current agent requested tool \'fetch\' with input {"url":"https://raw.githubusercontent.com/NVIDIA/cuEquivariance/54925c1e28bb17046ec6fd009c30ed08fc53c2c9/cuequivariance/cuequivariance/SKILL.md"}. Allow this call?';
    const presented = presentPermissionMessage(message);
    expect(presented.summary).toBe("The agent wants to fetch a file from GitHub.");
    expect(presented.target).toEqual({
      label: "URL",
      value:
        "https://raw.githubusercontent.com/NVIDIA/cuEquivariance/54925c1e28bb17046ec6fd009c30ed08fc53c2c9/cuequivariance/cuequivariance/SKILL.md",
    });
    expect(presented.showRaw).toBe(true);
    expect(presented.rawDetail).toContain('"url":');
    expect(presented.rawDetail).toContain("raw.githubusercontent.com");
    expect(presented.caution).toBeNull();
  });

  test("summarizes a bash command without dumping the prompt sentence", () => {
    const presented = presentPermissionMessage(
      "Current agent requested bash command 'git push'. Allow this command?",
    );
    expect(presented.summary).toBe("The agent wants to run a shell command.");
    expect(presented.target).toEqual({ label: "Command", value: "git push" });
    expect(presented.showRaw).toBe(true);
    expect(presented.rawDetail).toContain("requested bash command");
  });

  test("uses the full command when the permission prompt includes it", () => {
    const presented = presentPermissionMessage(
      "Current agent requested bash command 'git' (full command: 'git push origin main'). Allow this command?",
    );
    expect(presented.target).toEqual({ label: "Command", value: "git push origin main" });
  });

  test("flags external-directory access", () => {
    const presented = presentPermissionMessage(
      "Current agent requested tool 'read' for path '/etc/passwd' outside working directory '/Users/me/proj'. Allow this external directory access?",
    );
    expect(presented.summary).toBe("The agent wants to use a path outside the workspace.");
    expect(presented.target).toEqual({ label: "Path", value: "/etc/passwd" });
    expect(presented.caution).toBe("This path is outside the working directory (/Users/me/proj).");
    expect(presented.showRaw).toBe(true);
  });

  test("summarizes skill loading without a raw dump by default still offering details", () => {
    const presented = presentPermissionMessage(
      "Current agent requested skill 'bug-and-test-diagnosis'. Allow loading this skill?",
    );
    expect(presented.summary).toBe('The agent wants to load the skill “bug-and-test-diagnosis”.');
    expect(presented.target).toBeNull();
    expect(presented.showRaw).toBe(true);
  });

  test("leaves short generic host prompts unchanged", () => {
    const presented = presentPermissionMessage("Allow harness_mark?");
    expect(presented.summary).toBe("Allow harness_mark?");
    expect(presented.target).toBeNull();
    expect(presented.showRaw).toBe(false);
  });

  test("extracts a URL from truncated JSON input", () => {
    const presented = presentPermissionMessage(
      'Current agent requested tool \'fetch\' with input {"url":"https://example.com/very-long-path/file.md"…}. Allow this call?',
    );
    expect(presented.summary).toBe("The agent wants to fetch a file from example.com.");
    expect(presented.target).toEqual({
      label: "URL",
      value: "https://example.com/very-long-path/file.md",
    });
  });
});
