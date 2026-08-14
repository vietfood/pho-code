import { describe, expect, test } from "bun:test";
import { svgSourceToDataUrl } from "../src/lib/svg-data-url";

const circle = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#0ea5e9"/></svg>`;

describe("svgSourceToDataUrl", () => {
  test("accepts an svg root and percent-encodes hashes", () => {
    const url = svgSourceToDataUrl(circle);
    expect(url?.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(url).toContain(encodeURIComponent(circle));
    expect(url).toContain("%23");
    expect(url).not.toContain("fill=#");
  });

  test("allows an xml declaration before the svg root", () => {
    const source = `<?xml version="1.0" encoding="UTF-8"?>\n${circle}`;
    expect(svgSourceToDataUrl(source)).toContain("viewBox");
  });

  test("rejects non-svg, doctype, entities, and stylesheets", () => {
    expect(svgSourceToDataUrl("<div>nope</div>")).toBeNull();
    expect(svgSourceToDataUrl(`<!DOCTYPE svg SYSTEM "evil.dtd">\n${circle}`)).toBeNull();
    expect(svgSourceToDataUrl(`<!ENTITY xxe SYSTEM "file:///etc/passwd">\n${circle}`)).toBeNull();
    expect(svgSourceToDataUrl(`<?xml-stylesheet href="https://evil.example/x.css"?>\n${circle}`)).toBeNull();
    expect(svgSourceToDataUrl("")).toBeNull();
  });

  test("rejects oversized payloads", () => {
    const huge = `<svg xmlns="http://www.w3.org/2000/svg">${"a".repeat(256_001)}</svg>`;
    expect(svgSourceToDataUrl(huge)).toBeNull();
  });
});
