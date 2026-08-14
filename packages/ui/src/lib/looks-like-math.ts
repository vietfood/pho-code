/** Cheap gate so settled markdown skips KaTeX unless the text actually looks like math. */
export function looksLikeMath(text: string): boolean {
  if (text.includes("$$") || text.includes("\\begin{")) {
    return /\$\$[\s\S]+?\$\$|\\begin\{[a-z*]+\}/mu.test(text);
  }
  if (!text.includes("$")) {
    return false;
  }
  // Require a math-ish token so `$FOO` / `$BAR` env vars do not pull in KaTeX.
  return /(^|[^$\\])\$([A-Za-z]{1,2}|[^$\n]*[\\^=_{}][^$\n]*)\$(?!\$)/mu.test(text);
}
