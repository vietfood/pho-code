import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SkillChip } from "../src/skill-chip";

describe("SkillChip", () => {
  test("renders a skill pill with a book kind glyph and source in the title", () => {
    const markup = renderToStaticMarkup(
      createElement(SkillChip, { sourceId: "cursor", skillName: "tldraw-offline" }),
    );
    expect(markup).toContain("mention-chip");
    expect(markup).toContain("skill-chip");
    expect(markup).toContain('data-skill-source="cursor"');
    expect(markup).toContain('data-skill-name="tldraw-offline"');
    expect(markup).toContain("mention-chip-icon");
    expect(markup).toContain("tldraw-offline");
    expect(markup).toContain('title="Cursor · tldraw-offline"');
    expect(markup).toContain('aria-label="/cursor:tldraw-offline"');
    expect(markup).toContain("M12 7v14");
    expect(markup).not.toContain(">Ph</span>");
  });
});
