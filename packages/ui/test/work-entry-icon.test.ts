import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WORK_ENTRY_ICON_PACKS } from "@pho-code/protocol";
import { METEOCONS_OPTICAL_SCALE, PHO_OPTICAL_SCALE, WorkEntryIcon } from "../src/work-entry-icon";
import type { WorkEntryIconName } from "../src/tool-presentation";

const GLYPHS: readonly WorkEntryIconName[] = [
  "list",
  "read",
  "write",
  "edit",
  "run",
  "search",
  "find",
  "web-search",
  "fetch",
  "trash",
  "skill",
  "ask",
  "todos",
  "plan",
  "execute",
  "github",
  "wrench",
  "thought",
];

describe("work-entry icon packs", () => {
  test("renders every glyph key for every pack", () => {
    expect(WORK_ENTRY_ICON_PACKS).toEqual(["pho", "lucide", "codex-team", "meteocons"]);
    for (const pack of WORK_ENTRY_ICON_PACKS) {
      for (const name of GLYPHS) {
        const markup = renderToStaticMarkup(createElement(WorkEntryIcon, { name, pack, className: "size-3.5" }));
        expect(markup).toContain(`data-work-icon="${name}"`);
        expect(markup).toContain(`data-work-icon-pack="${pack}"`);
        if (name === "github") {
          expect(markup).toContain('data-lobe-icon="github"');
        } else if (pack === "meteocons") {
          expect(markup).toContain("<img");
          expect(markup).toContain("overflow-hidden");
          expect(markup).toContain(`scale(${METEOCONS_OPTICAL_SCALE})`);
          expect(markup).not.toContain("mask-image:");
          expect(markup).not.toContain("monochrome/");
        } else if (pack === "codex-team") {
          expect(markup).toContain("mask-image:");
          expect(markup).toContain("data:image/svg+xml");
          expect(markup).not.toContain("<svg");
        } else {
          expect(markup).toContain("<svg");
        }
        if (pack === "pho" && name !== "github") {
          expect(markup).toContain(`scale(${PHO_OPTICAL_SCALE})`);
        }
        if (pack === "meteocons" && name === "thought") {
          expect(markup).toContain("starry-night.svg");
        }
      }
    }
  });
});
