# Thinking sparkle placement and stream-text

Kind: change
Status: in source
Surface: work-log Working label; live Thinking row; live thinking/assistant text
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-thinking-shimmer-prompt-bar.md`](./2026-08-22-change-thinking-shimmer-prompt-bar.md), [`2026-08-22-feedback-stream-text-blur.md`](./2026-08-22-feedback-stream-text-blur.md)

## Intent

Owner asked to keep the sparkle on the live Thinking row only (not the top Working disclosure) and to use Beautiful UI’s stream-text leading-edge effect on live copy.

## Expected / actual (before)

Expected: sparkle on current Thinking; Working is label-only; live text has a soft blur on the newest characters and a solid caret.
Actual: both Working and Thinking showed a sparkle; live thinking/assistant text had no stream-tail.

## Changes and decisions

- `WorkLogToggle` / waiting “Working” shimmer without a sparkle. Live `ThinkingBlock` keeps the sparkle; settled Thought still uses the bot mark.
- Live thinking plaintext uses Beautiful UI `.stream-tail` + `.stream-caret.is-streaming`. Live assistant GFM uses the same caret; trailing prose may blur, but markdown markers stay in `ConservativeMarkdown` (`splitMarkdownStreamTail`). Tokens still come from Pi; no word-by-word timer. `prefers-reduced-motion` drops the blur.

## Verification

- **unit verified:** `bun test packages/ui/test/stream-text.test.ts packages/ui/test/thinking-block.test.ts packages/ui/test/work-log.test.ts packages/ui/test/conversation.test.ts` — 35 pass (2026-08-22, darwin).
- **desktop:** not verified here.
- **packaged:** not verified.

## Owner feedback

2026-08-22: no thinking icon on the smaller Working line; current running Thinking keeps it. Integrate Beautiful UI stream text.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
