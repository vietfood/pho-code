import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GithubChip } from "../src/github-chip";

describe("GithubChip", () => {
  test("renders github icon chip with owner/repo label", () => {
    const markup = renderToStaticMarkup(
      createElement(GithubChip, {
        url: "https://github.com/vietfood/comtam",
        owner: "vietfood",
        repo: "comtam",
      }),
    );
    expect(markup).toContain('data-github-url="https://github.com/vietfood/comtam"');
    expect(markup).toContain('data-github-owner="vietfood"');
    expect(markup).toContain('data-github-repo="comtam"');
    expect(markup).toContain("mention-chip");
    expect(markup).toContain("github-chip");
    expect(markup).toContain("vietfood/comtam");
  });
});
