import { describe, expect, test } from "bun:test";
import { findCompletedGitHubLinks, githubLinkLabel } from "../src/lib/github-link";

describe("github link chips", () => {
  test("finds owner/repo urls at end of text", () => {
    const text = "learn https://github.com/vietfood/comtam";
    const url = "https://github.com/vietfood/comtam";
    expect(findCompletedGitHubLinks(text)).toEqual([
      {
        url,
        owner: "vietfood",
        repo: "comtam",
        start: text.indexOf(url),
        end: text.indexOf(url) + url.length,
      },
    ]);
  });

  test("allows trailing slash and www", () => {
    const url = "https://www.github.com/vietfood/comtam/";
    expect(findCompletedGitHubLinks(url)).toEqual([
      {
        url,
        owner: "vietfood",
        repo: "comtam",
        start: 0,
        end: url.length,
      },
    ]);
  });

  test("stops before trailing punctuation and leaves deep paths alone", () => {
    const punctuated = "see https://github.com/vietfood/comtam.";
    const url = "https://github.com/vietfood/comtam";
    expect(findCompletedGitHubLinks(punctuated)).toEqual([
      {
        url,
        owner: "vietfood",
        repo: "comtam",
        start: punctuated.indexOf(url),
        end: punctuated.indexOf(url) + url.length,
      },
    ]);
    expect(findCompletedGitHubLinks("https://github.com/vietfood/comtam/issues/1")).toEqual([]);
  });

  test("consumes a clone .git suffix without leaving it after the chip", () => {
    const text = "Push commit e328b9c to https://github.com/vietfood/pho-code.git, branch dev";
    const url = "https://github.com/vietfood/pho-code.git";
    expect(findCompletedGitHubLinks(text)).toEqual([
      {
        url,
        owner: "vietfood",
        repo: "pho-code",
        start: text.indexOf(url),
        end: text.indexOf(url) + url.length,
      },
    ]);
  });

  test("keeps dotted repo names and a trailing-slash clone url", () => {
    const dotted = "https://github.com/vercel/next.js";
    expect(findCompletedGitHubLinks(dotted)).toEqual([
      {
        url: dotted,
        owner: "vercel",
        repo: "next.js",
        start: 0,
        end: dotted.length,
      },
    ]);
    const cloneSlash = "https://github.com/vietfood/pho-code.git/";
    expect(findCompletedGitHubLinks(cloneSlash)).toEqual([
      {
        url: cloneSlash,
        owner: "vietfood",
        repo: "pho-code",
        start: 0,
        end: cloneSlash.length,
      },
    ]);
  });

  test("ignores mid-word urls", () => {
    expect(findCompletedGitHubLinks("gohttps://github.com/vietfood/comtam")).toEqual([]);
  });

  test("labels as owner/repo", () => {
    expect(githubLinkLabel("vietfood", "comtam")).toBe("vietfood/comtam");
  });
});
