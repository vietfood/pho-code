import { splitStreamTail } from "./lib/stream-text";

// Leading-edge blur + solid streaming caret from Beautiful UI globals.css
// StreamText (MIT, Shane Levine). Tokens still come from the live Pi stream;
// this does not fake a word-by-word timer.

export function StreamText({ text, className }: { text: string; className?: string }) {
  const { head, tail } = splitStreamTail(text);
  return (
    <span className={className}>
      {head}
      {tail ? (
        <span className="stream-tail" data-testid="stream-tail">
          {tail}
        </span>
      ) : null}
      <span className="stream-caret is-streaming" aria-hidden="true" />
    </span>
  );
}
