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
  name: "Run",
  status: "completed",
  inputPreview: '{"command":"ls -la docs"}',
  outputPreview: "ok",
};

describe("tool presentation", () => {
  test("formats owner-facing headings and glyph keys without a status word", () => {
    expect(toolWorkEntryHeading("ls", "completed")).toBe("Browse");
    expect(toolWorkEntryHeading("Ls", "completed")).toBe("Browse");
    expect(toolWorkEntryHeading("bash", "failed")).toBe("Run");
    expect(toolWorkEntryHeading("Run", "completed")).toBe("Run");
    expect(toolWorkEntryHeading("read", "failed")).toBe("Read");
    expect(toolWorkEntryHeading("web_search", "completed")).toBe("Web search");
    expect(toolWorkEntryHeading("Web search", "completed")).toBe("Web search");
    expect(toolWorkEntryHeading("mystery_tool", "running")).toBe("Mystery Tool");
    expect(toolWorkEntryIcon("bash")).toBe("run");
    expect(toolWorkEntryIcon("Run")).toBe("run");
    expect(toolWorkEntryIcon("read")).toBe("read");
    expect(toolWorkEntryIcon("List")).toBe("list");
    expect(toolWorkEntryIcon("Browse")).toBe("list");
    expect(toolWorkEntryIcon("ls")).toBe("list");
    expect(toolWorkEntryIcon("write")).toBe("write");
    expect(toolWorkEntryIcon("edit")).toBe("edit");
    expect(toolWorkEntryIcon("grep")).toBe("search");
    expect(toolWorkEntryIcon("Search")).toBe("search");
    expect(toolWorkEntryIcon("Find")).toBe("find");
    expect(toolWorkEntryIcon("fffind")).toBe("find");
    expect(toolWorkEntryIcon("execute")).toBe("execute");
    expect(toolWorkEntryIcon("Web search")).toBe("web-search");
    expect(toolWorkEntryIcon("web_search")).toBe("web-search");
    expect(toolWorkEntryIcon("Fetch")).toBe("fetch");
    expect(toolWorkEntryIcon("fetch_content")).toBe("fetch");
    expect(toolWorkEntryIcon("move_to_trash")).toBe("trash");
    expect(toolWorkEntryIcon("Skill")).toBe("skill");
    expect(toolWorkEntryIcon("Ask")).toBe("ask");
    expect(toolWorkEntryIcon("Todos")).toBe("todos");
    expect(toolWorkEntryIcon("Plan")).toBe("plan");
    expect(toolWorkEntryIcon("update_plan_document")).toBe("plan");
    expect(toolWorkEntryIcon("github_get_file_contents")).toBe("github");
    expect(toolWorkEntryIcon("mystery_tool")).toBe("wrench");
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
  test("starts collapsed with heading, short command preview, and status check", () => {
    const markup = renderToStaticMarkup(createElement(ToolRow, { block }));
    expect(markup).toContain("Run");
    expect(markup).not.toContain("Run completed");
    expect(markup).toContain("ls -la docs");
    expect(markup).toContain('data-testid="tool-card"');
    expect(markup).toContain('data-testid="tool-chip"');
    expect(markup).toContain("text-muted-foreground");
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
      expect(markup).toContain(`${name.charAt(0).toUpperCase()}${name.slice(1)}`);
      expect(markup).not.toContain("Read completed");
      expect(markup).not.toContain("Write completed");
      expect(markup).not.toContain("Edit completed");
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

  test("expanded web search lists site titles and hosts instead of a raw dump", () => {
    const markup = renderToStaticMarkup(
      createElement(ToolRow, {
        block: {
          type: "tool",
          callId: "search-1",
          name: "web search",
          status: "completed",
          inputPreview: '{"query":"fun interesting facts programming computer science"}',
          outputPreview: `Search results (mixed):

1. Top 50 Interesting Unknown Facts about Programming
   https://www.geeksforgeeks.org/top-50-interesting-unknown-facts-about-programming/
   [duckduckgo]

2. neal.fun
   https://neal.fun/
   [bing]

3. Joy Cone
   https://joycone.com/
   [brave]

4. Extra One
   https://example.com/one
   [jina]
`,
        },
        open: true,
      }),
    );
    expect(markup).toContain('data-testid="web-search-results"');
    expect(markup).toContain('data-testid="web-search-query"');
    expect(markup).toContain("fun interesting facts programming computer science");
    expect(markup).toContain('data-testid="web-site-icon"');
    expect(markup).toContain("Top 50 Interesting Unknown Facts about Programming");
    expect(markup).toContain("geeksforgeeks.org");
    expect(markup).toContain("s2/favicons?domain=");
    expect(markup).toContain("+1 more");
    expect(markup).not.toContain("[duckduckgo]");
    expect(markup).not.toContain("QUERY");
    expect(markup).not.toContain('data-testid="tool-chip"');
  });

  test("collapsed web search and fetch keep site icons and omit the query/URL preview", () => {
    const search = renderToStaticMarkup(
      createElement(ToolRow, {
        block: {
          type: "tool",
          callId: "search-collapsed",
          name: "web search",
          status: "completed",
          inputPreview: '{"query":"fun interesting facts programming"}',
          outputPreview: `Search results (mixed):

1. Joy Cone
   https://joycone.com/
   [brave]
`,
        },
      }),
    );
    expect(search).toContain("Web search");
    expect(search).not.toContain("Web search completed");
    expect(search).toContain('data-testid="web-site-icons"');
    expect(search).not.toContain('data-testid="tool-chip"');

    const fetchMarkup = renderToStaticMarkup(
      createElement(ToolRow, {
        block: {
          type: "tool",
          callId: "fetch-collapsed",
          name: "Fetch",
          status: "completed",
          inputPreview: JSON.stringify({
            url: "https://www.geeksforgeeks.org/top-50-interesting-unknown-facts-about-programming/",
          }),
          outputPreview: "Body",
        },
      }),
    );
    expect(fetchMarkup).toContain("Fetch");
    expect(fetchMarkup).not.toContain("Fetch completed");
    expect(fetchMarkup).toContain('data-testid="web-site-icon"');
    expect(fetchMarkup).not.toContain('data-testid="tool-chip"');
  });

  test("expanded fetch shows a site icon beside the URL and keeps page output", () => {
    const url = "https://www.geeksforgeeks.org/top-50-interesting-unknown-facts-about-programming/";
    const markup = renderToStaticMarkup(
      createElement(ToolRow, {
        block: {
          type: "tool",
          callId: "fetch-1",
          name: "Fetch",
          status: "completed",
          inputPreview: JSON.stringify({ url }),
          outputPreview: `# Top 50 Interesting Unknown Facts about Programming - GeeksforGeeks\n\nSource: ${url}\n\nBody`,
        },
        open: true,
      }),
    );
    expect(markup).toContain('data-testid="web-fetch-source"');
    expect(markup).toContain('data-testid="web-site-icon"');
    expect(markup).toContain('data-host="www.geeksforgeeks.org"');
    expect(markup).toContain("geeksforgeeks.org");
    expect(markup).toContain("s2/favicons?domain=");
    expect(markup).toContain("Output");
    expect(markup).toContain("Body");
    expect(markup).not.toContain(">URL<");
    expect(markup).not.toContain('data-testid="tool-chip"');
  });
});
