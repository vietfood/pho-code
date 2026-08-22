# Stream-text blur rejected

Kind: feedback
Status: in source
Surface: live thinking body; live assistant tokens
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-thinking-sparkle-stream-text.md`](./2026-08-22-change-thinking-sparkle-stream-text.md)

## Intent

Owner asked to drop the Beautiful UI stream-text blur; live copy should stay sharp.

## Expected / actual (before)

Expected: live thinking and assistant text remain readable while tokens arrive.
Actual: the newest characters were mask-blurred (`.stream-tail`), which looked wrong.

## Changes and decisions

- Removed `.stream-tail`, `splitStreamTail`, and `splitMarkdownStreamTail`.
- Live thinking and assistant GFM stay fully sharp. The solid `.stream-caret.is-streaming` remains while tokens arrive. Sparkle placement (Thinking only) is unchanged.

## Verification

- **unit verified:** `bun test packages/ui/test/stream-text.test.ts packages/ui/test/thinking-block.test.ts packages/ui/test/work-log.test.ts packages/ui/test/conversation.test.ts` — 32 pass (2026-08-22, darwin).
- **desktop:** not verified here.
- **packaged:** not verified.

## Owner feedback

2026-08-22: the blur effect makes it weird.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
