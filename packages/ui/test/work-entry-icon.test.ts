import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WORK_ENTRY_ICON_PACKS } from "@pho-code/protocol";
import { PHO_OPTICAL_SCALE, WorkEntryIcon } from "../src/work-entry-icon";
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
  test("renders every glyph key for both packs", () => {
    expect(WORK_ENTRY_ICON_PACKS).toEqual(["pho", "lucide"]);
    for (const pack of WORK_ENTRY_ICON_PACKS) {
      for (const name of GLYPHS) {
        const markup = renderToStaticMarkup(createElement(WorkEntryIcon, { name, pack, className: "size-3.5" }));
        expect(markup).toContain(`data-work-icon="${name}"`);
        expect(markup).toContain(`data-work-icon-pack="${pack}"`);
        expect(markup).toContain("<svg");
        if (pack === "pho" && name !== "github") {
          expect(markup).toContain(`scale(${PHO_OPTICAL_SCALE})`);
        }
      }
    }
  });
});
