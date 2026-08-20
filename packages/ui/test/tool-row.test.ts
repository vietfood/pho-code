import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ToolRow } from "../src/tool-row";
import {
  buildToolExpandedSections,
  describeToolInputTarget,
  thoughtWorkEntryChip,
  toolWorkEntryChip,
  toolWorkEntryHeading,
  toolWorkEntryIcon,
} from "../src/tool-presentation";
import type { TranscriptToolBlock } from "@pho-code/protocol";

const block: TranscriptToolBlock = {
  type: "tool",
  callId: "call-1",
  name: "bash",
  status: "completed",
  inputPreview: '{"command":"ls -la docs"}',
  outputPreview: "ok",
};

describe("tool presentation", () => {
  test("formats T3-style headings and icons", () => {
    expect(toolWorkEntryHeading("bash", "completed")).toBe("Bash completed");
    expect(toolWorkEntryHeading("read", "failed")).toBe("Read failed");
    expect(toolWorkEntryIcon("bash")).toBe("terminal");
    expect(toolWorkEntryIcon("read")).toBe("eye");
    expect(toolWorkEntryIcon("execute")).toBe("bot");
  });

  test("parses shell input into a command section without raw JSON", () => {
    const sections = buildToolExpandedSections(
      "bash",
      '{"command":"git diff packages/ui/src/tool-row.tsx"}',
      "diff --git a/tool-row.tsx",
    );
    expect(sections).toEqual([
      {
        id: "input",
        label: "Command",
        language: "bash",
        text: "git diff packages/ui/src/tool-row.tsx",
      },
      {
        id: "output",
        label: "Output",
        language: "text",
        text: "diff --git a/tool-row.tsx",
      },
    ]);
    expect(sections[0]?.text).not.toContain("{");
  });

  test("pretty-prints multi-field JSON input and JSON output", () => {
    const sections = buildToolExpandedSections(
      "edit",
      '{"path":"a.ts","old_string":"x","new_string":"y"}',
      '{"ok":true}',
    );
    expect(sections[0]).toMatchObject({ id: "input", label: "Input", language: "json" });
    expect(sections[0]?.text).toContain('"path": "a.ts"');
    expect(sections[1]).toEqual({
      id: "output",
      label: "Output",
      language: "json",
      text: '{\n  "ok": true\n}',
    });
  });

  test("describes a fetch URL target without truncating it", () => {
    const url =
      "https://raw.githubusercontent.com/NVIDIA/cuEquivariance/54925c1e28bb17046ec6fd009c30ed08fc53c2c9/cuequivariance/cuequivariance/SKILL.md";
    expect(describeToolInputTarget("fetch", JSON.stringify({ url }))).toEqual({
      label: "URL",
      value: url,
    });
  });

  test("uses a path label for single-field read input", () => {
    const sections = buildToolExpandedSections("read", '{"path":"docs/ui/implementation/conversation-ui.md"}', "");
    expect(sections).toEqual([
      {
        id: "input",
        label: "Path",
        language: "text",
        text: "docs/ui/implementation/conversation-ui.md",
      },
    ]);
  });

  test("builds a short chip from path, command, URL, and todo input", () => {
    expect(
      toolWorkEntryChip("read", '{"path":"docs/ui/implementation/conversation-ui.md"}'),
    ).toEqual({
      text: "conversation-ui.md",
      title: "docs/ui/implementation/conversation-ui.md",
    });
    expect(toolWorkEntryChip("bash", '{"command":"ls -la docs"}')).toEqual({
      text: "ls -la docs",
      title: "ls -la docs",
    });
    const longCommand =
      "git show ab5d0c8:packages/ui/test/composer-meta-strip.test.ts | sed -n '1,80p'";
    const commandChip = toolWorkEntryChip("bash", JSON.stringify({ command: longCommand }));
    expect(commandChip?.title).toBe(longCommand);
    expect(commandChip?.text).toBe(longCommand);
    const url =
      "https://raw.githubusercontent.com/NVIDIA/cuEquivariance/54925c1e28bb17046ec6fd009c30ed08fc53c2c9/cuequivariance/cuequivariance/SKILL.md";
    expect(toolWorkEntryChip("fetch", JSON.stringify({ url }))).toEqual({
      text: "SKILL.md",
      title: url,
    });
    expect(
      toolWorkEntryChip(
        "todo",
        JSON.stringify({
          todos: [
            { id: "a", content: "One", status: "completed" },
            { id: "b", content: "Two", status: "pending" },
          ],
        }),
      ),
    ).toEqual({ text: "1/2", title: "1/2" });
  });

  test("builds a first-line thought chip", () => {
    expect(thoughtWorkEntryChip("I should inspect the docs first.")).toEqual({
      text: "I should inspect the docs first.",
      title: "I should inspect the docs first.",
    });
    const long = `${"A".repeat(80)}\nMore detail.`;
    expect(thoughtWorkEntryChip(long)).toEqual({
      text: "A".repeat(80),
      title: "A".repeat(80),
    });
  });
});

describe("tool row", () => {
  test("starts collapsed with heading, short command chip, and status check", () => {
    const markup = renderToStaticMarkup(createElement(ToolRow, { block }));
    expect(markup).toContain("Bash completed");
    expect(markup).toContain("ls -la docs");
    expect(markup).toContain('data-testid="tool-card"');
    expect(markup).toContain('data-testid="tool-chip"');
    expect(markup).toContain("truncate");
    expect(markup).not.toContain('data-testid="tool-sandbox-shield"');
    expect(markup).toContain('aria-label="Completed"');
    expect(markup).not.toContain('data-testid="tool-detail"');
    expect(markup).toContain('aria-expanded="false"');
  });

  test("shows a shield on sandboxed bash and keeps the command in the expanded body", () => {
    const markup = renderToStaticMarkup(
      createElement(ToolRow, { block: { ...block, sandboxed: true }, open: true }),
    );
    expect(markup).toContain('data-testid="tool-sandbox-shield"');
    expect(markup).toContain("Ran in the agent sandbox");
    expect(markup).toContain('data-testid="tool-chip"');
    expect(markup).toContain("ls -la docs");
    expect(markup).toContain('data-testid="tool-detail"');
    expect(markup).toContain("$ ls -la docs");
  });

  test("collapsed read, write, and edit rows use a basename chip", () => {
    for (const name of ["read", "write", "edit"] as const) {
      const markup = renderToStaticMarkup(
        createElement(ToolRow, {
          block: {
            type: "tool",
            callId: `call-${name}`,
            name,
            status: "completed",
            inputPreview: '{"path":"docs/ui/implementation/conversation-ui.md"}',
            outputPreview: "",
          },
        }),
      );
      expect(markup).toContain(`${name.charAt(0).toUpperCase()}${name.slice(1)} completed`);
      expect(markup).toContain('data-testid="tool-chip"');
      expect(markup).toContain("conversation-ui.md");
      expect(markup).toContain('title="docs/ui/implementation/conversation-ui.md"');
      expect(markup).not.toContain('data-testid="tool-sandbox-shield"');
    }
  });

  test("expanded shell body shows labeled command and output panels", () => {
    const markup = renderToStaticMarkup(createElement(ToolRow, { block, open: true }));
    expect(markup).toContain('data-testid="tool-detail"');
    expect(markup).toContain("Command");
    expect(markup).toContain("Output");
    expect(markup).toContain("$ ls -la docs");
    expect(markup).toContain("ok");
    expect(markup).not.toContain('{"command"');
    expect(markup).toContain('data-language="bash"');
  });
});
