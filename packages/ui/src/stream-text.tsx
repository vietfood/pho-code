// Solid streaming caret from Beautiful UI globals.css StreamText (MIT, Shane Levine).
// Owner rejected the leading-edge blur tail; tokens still come from the live Pi stream.

export function StreamCaret() {
  return <span className="stream-caret is-streaming" aria-hidden="true" />;
}
