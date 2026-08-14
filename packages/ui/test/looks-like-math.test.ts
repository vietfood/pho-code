import { looksLikeMath } from "../src/lib/looks-like-math";
import { describe, expect, test } from "bun:test";

describe("looksLikeMath", () => {
  test("detects inline and display math", () => {
    expect(looksLikeMath("Inline $E=mc^2$ here")).toBe(true);
    expect(looksLikeMath("$$\\int_0^1 x\\,dx$$")).toBe(true);
    expect(looksLikeMath("\\begin{align} a &= b \\end{align}")).toBe(true);
    expect(looksLikeMath("Let $x$ be a scalar.")).toBe(true);
  });

  test("ignores ordinary prose and unmatched dollars", () => {
    expect(looksLikeMath("Use `code` and **bold**.")).toBe(false);
    expect(looksLikeMath("export const HOME = process.env.HOME")).toBe(false);
    expect(looksLikeMath("costs $5 and more")).toBe(false);
    expect(looksLikeMath("echo $FOO and $BAR")).toBe(false);
  });
});
