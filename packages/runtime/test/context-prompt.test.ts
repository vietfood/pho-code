import { describe, expect, test } from "bun:test";
import {
  agentsSectionId,
  DEFAULT_CONTEXT_PROMPT_PREAMBLE,
  PI_DOCS_SECTION_ID,
  toolSectionId,
} from "@pho-code/protocol";
import {
  applyDisabledSectionIds,
  collectContextPromptRecord,
  compileContextPrompt,
  CONTEXT_PROMPT_CUSTOM_TYPE,
  enabledToolNames,
  liveContextPromptSections,
  projectSessionContextPrompt,
  relativizeAgentsPath,
  toolSectionBody,
} from "../src/context-prompt";

const tools = [
  {
    name: "read",
    label: "Read",
    description: "Read a file.",
    promptSnippet: "Read workspace files.",
    promptGuidelines: ["Prefer read over cat."],
  },
  {
    name: "bash",
    label: "Bash",
    description: "Run a command.",
    promptSnippet: "Run shell commands.",
  },
];

const agents = [{ path: "/tmp/ws/AGENTS.md", content: "# Workspace instructions\n" }];

describe("context prompt compiler", () => {
  test("builds live sections and compiles A from preamble plus enabled chips", () => {
    const sections = liveContextPromptSections("/tmp/ws", tools, agents);
    expect(sections.map((section) => section.id)).toEqual([
      agentsSectionId("AGENTS.md"),
      toolSectionId("read"),
      toolSectionId("bash"),
      PI_DOCS_SECTION_ID,
    ]);
    const compiled = compileContextPrompt({
      preamble: "You are Pho.",
      sections: applyDisabledSectionIds(sections, [toolSectionId("bash"), PI_DOCS_SECTION_ID]),
      cwd: "/tmp/ws",
    });
    expect(compiled).toContain("You are Pho.");
    expect(compiled).toContain("- read: Read workspace files.");
    expect(compiled).not.toContain("- bash:");
    expect(compiled).toContain("<project_instructions path=\"AGENTS.md\">");
    expect(compiled).toContain("# Workspace instructions");
    expect(compiled).not.toContain("Pi documentation");
    expect(compiled).toContain("Current working directory: /tmp/ws");
    expect(enabledToolNames(applyDisabledSectionIds(sections, [toolSectionId("bash")]))).toEqual(["read"]);
  });

  test("uncustomized projection uses Pi's live system prompt as A", () => {
    const projected = projectSessionContextPrompt({
      cwd: "/tmp/ws",
      tools,
      agentsFiles: agents,
      liveSystemPrompt: "Pi native prompt",
      record: undefined,
      editable: true,
    });
    expect(projected.customized).toBe(false);
    expect(projected.compiled).toBe("Pi native prompt");
    expect(projected.preamble).toBe(DEFAULT_CONTEXT_PROMPT_PREAMBLE);
    expect(projected.sections.every((section) => section.enabled)).toBe(true);
  });

  test("customized inspect uses the frozen compiled A", () => {
    const sections = applyDisabledSectionIds(liveContextPromptSections("/tmp/ws", tools, agents), [
      toolSectionId("bash"),
    ]);
    const compiled = compileContextPrompt({
      preamble: "Stay brief.",
      sections,
      cwd: "/tmp/ws",
    });
    const projected = projectSessionContextPrompt({
      cwd: "/tmp/ws",
      tools,
      agentsFiles: agents,
      liveSystemPrompt: "Pi native prompt",
      record: {
        preamble: "Stay brief.",
        disabledSectionIds: [toolSectionId("bash")],
        compiled,
        sections,
      },
      editable: false,
    });
    expect(projected.customized).toBe(true);
    expect(projected.editable).toBe(false);
    expect(projected.compiled).toBe(compiled);
    expect(projected.sections.find((section) => section.id === toolSectionId("bash"))?.enabled).toBe(false);
  });

  test("collects the latest custom entry and honors reset", () => {
    const sections = liveContextPromptSections("/tmp/ws", tools, []);
    const first = collectContextPromptRecord([
      {
        type: "custom",
        customType: CONTEXT_PROMPT_CUSTOM_TYPE,
        data: {
          preamble: "One",
          disabledSectionIds: [],
          compiled: "One A",
          sections,
        },
      },
      {
        type: "custom",
        customType: CONTEXT_PROMPT_CUSTOM_TYPE,
        data: {
          preamble: "Two",
          disabledSectionIds: [PI_DOCS_SECTION_ID],
          compiled: "Two A",
          sections,
        },
      },
    ]);
    expect(first?.preamble).toBe("Two");
    expect(
      collectContextPromptRecord([
        {
          type: "custom",
          customType: CONTEXT_PROMPT_CUSTOM_TYPE,
          data: { preamble: "Two", disabledSectionIds: [], compiled: "Two A", sections },
        },
        { type: "custom", customType: CONTEXT_PROMPT_CUSTOM_TYPE, data: { reset: true } },
      ]),
    ).toBeUndefined();
  });

  test("relativizes agent paths and formats tool bodies", () => {
    expect(relativizeAgentsPath("/tmp/ws/docs/AGENTS.md", "/tmp/ws")).toBe("docs/AGENTS.md");
    expect(relativizeAgentsPath("/elsewhere/AGENTS.md", "/tmp/ws")).toBe("AGENTS.md");
    expect(toolSectionBody(tools[0]!)).toContain("Read workspace files.");
    expect(toolSectionBody(tools[0]!)).toContain("- Prefer read over cat.");
  });
});
