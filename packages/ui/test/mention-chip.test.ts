import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MentionChip } from "../src/mention-chip";

describe("MentionChip", () => {
  test("renders path, kind, and basename label", () => {
    const markup = renderToStaticMarkup(
      createElement(MentionChip, { path: "docs/AGENTS.md", kind: "file" }),
    );
    expect(markup).toContain('data-mention-path="docs/AGENTS.md"');
    expect(markup).toContain('data-mention-kind="file"');
    expect(markup).toContain("mention-chip");
    expect(markup).toContain("AGENTS.md");
    expect(markup).not.toContain("@docs/AGENTS.md");
  });

  test("uses folder styling when kind is folder", () => {
    const markup = renderToStaticMarkup(
      createElement(MentionChip, { path: "packages/ui", kind: "folder" }),
    );
    expect(markup).toContain('data-mention-kind="folder"');
    expect(markup).toContain("ui");
  });
});
