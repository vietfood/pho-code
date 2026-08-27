import { describe, expect, test } from "bun:test";
import {
  agentsSectionId,
  CONTEXT_PROMPT_SECTION_KINDS,
  DEFAULT_CONTEXT_PROMPT_PREAMBLE,
  emptyFeatureSnapshot,
  emptySessionContextPrompt,
  idleRunState,
  isJsonSafeValue,
  jsonRoundTrip,
  PI_DOCS_SECTION_ID,
  toolSectionId,
  type SessionContextPrompt,
  type SessionSnapshot,
} from "../src/index";

describe("context prompt protocol", () => {
  test("section ids and kinds are stable", () => {
    expect(toolSectionId("read")).toBe("tool:read");
    expect(agentsSectionId("AGENTS.md")).toBe("agents:AGENTS.md");
    expect(PI_DOCS_SECTION_ID).toBe("optional:pi-docs");
    expect(CONTEXT_PROMPT_SECTION_KINDS).toEqual(["agents", "tool", "optional"]);
  });

  test("session context prompt survives a JSON round trip", () => {
    const contextPrompt: SessionContextPrompt = {
      customized: true,
      editable: true,
      preamble: DEFAULT_CONTEXT_PROMPT_PREAMBLE,
      defaultPreamble: DEFAULT_CONTEXT_PROMPT_PREAMBLE,
      sections: [
        {
          id: agentsSectionId("AGENTS.md"),
          kind: "agents",
          title: "AGENTS.md",
          enabled: true,
          body: "# Workspace instructions\n",
        },
        {
          id: toolSectionId("read"),
          kind: "tool",
          title: "read",
          enabled: false,
          body: "Read a file.",
        },
        {
          id: PI_DOCS_SECTION_ID,
          kind: "optional",
          title: "Pi docs",
          enabled: true,
          body: "Pi documentation",
        },
      ],
      compiled: "You are an expert coding assistant\n\nCurrent working directory: /tmp/ws",
    };
    expect(isJsonSafeValue(contextPrompt)).toBe(true);
    expect(jsonRoundTrip(contextPrompt)).toEqual(contextPrompt);

    const snapshot: SessionSnapshot = {
      session: {
        id: "s1",
        workspaceId: "/tmp/ws",
        title: "New session",
        updatedAt: "2026-08-14T00:00:00.000Z",
      },
      workspace: {
        id: "/tmp/ws",
        path: "/tmp/ws",
        displayName: "ws",
        lastOpenedAt: "2026-08-14T00:00:00.000Z",
        projectResourcesApproved: true,
      },
      messages: [],
      run: idleRunState(),
      models: [],
      sessions: [],
      features: emptyFeatureSnapshot(),
      thinkingLevel: "off",
      availableThinkingLevels: ["off"],
      supportsThinking: false,
      contextPrompt,
    };
    expect(isJsonSafeValue(snapshot)).toBe(true);
    expect(jsonRoundTrip(snapshot)).toEqual(snapshot);
  });

  test("empty projection is JSON-safe", () => {
    expect(isJsonSafeValue(emptySessionContextPrompt())).toBe(true);
    expect(emptySessionContextPrompt().customized).toBe(false);
    expect(emptySessionContextPrompt().editable).toBe(true);
  });
});
