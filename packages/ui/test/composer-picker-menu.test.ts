import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerPickerMenu } from "../src/composer-picker-menu";

describe("composer picker menu", () => {
  test("renders a listbox, hint, and gliding highlight chrome", () => {
    const markup = renderToStaticMarkup(
      createElement(
        ComposerPickerMenu,
        {
          label: "Skills",
          testId: "composer-skills",
          hint: "Type to search skills",
          activeIndex: 0,
          itemCount: 2,
          listKey: "plan",
        },
        createElement(
          "button",
          { type: "button", role: "option", "aria-selected": true },
          "Plan",
        ),
        createElement(
          "button",
          { type: "button", role: "option", "aria-selected": false },
          "Draft",
        ),
      ),
    );
    expect(markup).toContain('data-testid="composer-skills"');
    expect(markup).toContain('role="listbox"');
    expect(markup).toContain("Type to search skills");
    expect(markup).toContain('data-testid="composer-picker-glide"');
    expect(markup).toContain("Plan");
    expect(markup).toContain("Draft");
  });
});
