import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTEXT_PROMPT_PREAMBLE, type SessionContextPrompt } from "@pho-code/protocol";
import { ContextPromptDialog } from "../src/context-prompt-dialog";

const sections: SessionContextPrompt["sections"] = [
  {
    id: "agents:AGENTS.md",
    kind: "agents",
    title: "AGENTS.md",
    enabled: true,
    body: "Use bun for this workspace.",
  },
  {
    id: "tool:bash",
    kind: "tool",
    title: "bash",
    enabled: false,
    body: "Run shell commands.",
  },
  {
    id: "optional:pi-docs",
    kind: "optional",
    title: "Pi docs",
    enabled: true,
    body: "Pi documentation (read only when asked).",
  },
];

function prompt(overrides: Partial<SessionContextPrompt> = {}): SessionContextPrompt {
  return {
    customized: false,
    editable: true,
    preamble: DEFAULT_CONTEXT_PROMPT_PREAMBLE,
    defaultPreamble: DEFAULT_CONTEXT_PROMPT_PREAMBLE,
    compiled: DEFAULT_CONTEXT_PROMPT_PREAMBLE,
    sections,
    ...overrides,
  };
}

describe("ContextPromptDialog", () => {
  test("lets an empty session edit the preamble and toggle chips", () => {
    const markup = renderToStaticMarkup(
      createElement(ContextPromptDialog, {
        contextPrompt: prompt(),
        onSave: () => undefined,
        onReset: () => undefined,
        onClose: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="context-prompt-dialog"');
    expect(markup).toContain('data-testid="context-prompt-preamble"');
    expect(markup.toLowerCase()).not.toContain("readonly");
    expect(markup).toContain('data-testid="context-prompt-save"');
    expect(markup).toContain('data-testid="context-prompt-reset"');
    expect(markup).toContain("disabled");
    expect(markup).toContain('data-testid="context-prompt-chip-agents:AGENTS.md"');
    expect(markup).toContain('data-testid="context-prompt-chip-tool:bash"');
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain("overflow-y-auto");
    expect(markup).toContain('data-testid="context-prompt-group-agents"');
    expect(markup).toContain('data-testid="context-prompt-group-tool"');
    expect(markup).toContain('data-testid="context-prompt-group-optional"');
    expect(markup).toContain("Context files");
    expect(markup).toContain("Tools");
    expect(markup).toContain("Optional");
    expect(markup).toContain("context-prompt-section is-off");
    expect(markup).toContain("before the first message");
  });

  test("keeps AGENTS.md with other context files, separate from tools", () => {
    const markup = renderToStaticMarkup(
      createElement(ContextPromptDialog, {
        contextPrompt: prompt({
          sections: [
            ...sections,
            {
              id: "agents:CLAUDE.md",
              kind: "agents",
              title: "CLAUDE.md",
              enabled: true,
              body: "Claude-compatible notes.",
            },
          ],
        }),
        onSave: () => undefined,
        onReset: () => undefined,
        onClose: () => undefined,
      }),
    );
    const agentsGroup = markup.slice(
      markup.indexOf('data-testid="context-prompt-group-agents"'),
      markup.indexOf('data-testid="context-prompt-group-tool"'),
    );
    const toolsGroup = markup.slice(
      markup.indexOf('data-testid="context-prompt-group-tool"'),
      markup.indexOf('data-testid="context-prompt-group-optional"'),
    );
    expect(agentsGroup).toContain("AGENTS.md");
    expect(agentsGroup).toContain("CLAUDE.md");
    expect(agentsGroup).not.toContain("bash");
    expect(toolsGroup).toContain("bash");
    expect(toolsGroup).not.toContain("AGENTS.md");
    expect(markup).toContain('data-testid="context-prompt-group-toggle-tool"');
  });

  test("is inspect-only after the first message", () => {
    const markup = renderToStaticMarkup(
      createElement(ContextPromptDialog, {
        contextPrompt: prompt({ customized: true, editable: false }),
        onSave: () => undefined,
        onReset: () => undefined,
        onClose: () => undefined,
      }),
    );
    expect(markup.toLowerCase()).toContain("readonly");
    expect(markup).not.toContain('data-testid="context-prompt-save"');
    expect(markup).not.toContain('data-testid="context-prompt-reset"');
    expect(markup).toContain('data-testid="context-prompt-close"');
    expect(markup).toContain('data-testid="context-prompt-customized"');
    expect(markup).toContain("cannot be changed after the first message");
    expect(markup).toContain('data-testid="context-prompt-chip-tool:bash"');
    expect(markup).toContain("disabled");
  });

  test("embeds as a panel without a modal backdrop", () => {
    const markup = renderToStaticMarkup(
      createElement(ContextPromptDialog, {
        contextPrompt: prompt(),
        embedded: true,
        onSave: () => undefined,
        onReset: () => undefined,
        onClose: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="context-prompt-dialog"');
    expect(markup).not.toContain('data-testid="context-prompt-backdrop"');
    expect(markup).not.toContain('aria-modal="true"');
    expect(markup).toContain('data-testid="context-prompt-save"');
    expect(markup).toContain("before the first message");
  });
});
