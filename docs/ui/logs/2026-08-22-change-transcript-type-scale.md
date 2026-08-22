# Transcript type scale, contrast, and block rhythm

Kind: change
Status: in source
Surface: chat transcript / markdown
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-inline-code-chips.md`](./2026-08-22-change-inline-code-chips.md)

## Intent

Owner compared a Claude Code desktop screenshot against the harness and asked why the reference reads so much better. The gap was not the font — both stacks resolve to SF Pro on macOS — but size, block rhythm, and body contrast.

## Expected / actual (before)

Expected: body prose is the highest-contrast text on screen, and paragraphs read as discrete blocks.

Actual:

- Assistant prose rendered at `text-foreground/80` in **two** places — the transcript segment wrapper and the `.chat-markdown` root itself. On the default light palette that turned `#27272a` into roughly `#54545a`, dropping contrast from ~14:1 to ~8:1. The one element that mattered most was the one being dimmed.
- Every markdown block (`p`, `ul`, `ol`, `pre`, tables) carried `margin: 0.5rem 0` = 8px, while intra-paragraph leading was 21.7px. The gap *between* paragraphs was smaller than the gap between lines *inside* one, so the transcript read as an undifferentiated wall. `li + li` had the same inversion at 4px.
- `h2` at `1.125em` (15.75px) was barely distinguishable from body, yet was introduced by a 20px top margin — a large gap announcing a heading that did not arrive.
- No font smoothing was set, so Electron inherited Chromium's subpixel default.
- Links were `color: inherit` + permanent underline, so a file-heavy answer had no scannable colour anchor.

## Changes and decisions

- `DEFAULT_CHAT_FONT_SIZE` 14 → 15. The clamp range (12–20) and the Settings slider are unchanged, so anyone who already set a size keeps it; this moves the default only.
- `.chat-text` and `.chat-markdown` leading 1.55 → 1.65.
- Body contrast restored to full `--foreground` in both `transcript.tsx` and `markdown.tsx`. Gray is now reserved for metadata: tool rows, collapsed summaries, timestamps, and the dense thinking variant.
- The `.chat-markdown` root also dropped `text-sm leading-relaxed`. Those utilities were already dead — `theme.css` `.chat-markdown` wins on both size and leading — so they only misled readers about where the scale came from.
- Block margin 0.5rem → 0.9rem and `li + li` 0.25rem → 0.4rem, so block gap exceeds leading rather than sitting under it.
- Heading margin `1.25rem 0 0.5rem` → `1.6rem 0 0.6rem`; `h2` 1.125em → 1.2em; `h3` 1em → 1.05em. Headings now carry a size delta that justifies their space.
- Assistant segment gap `pb-4` → `pb-6`.
- `body` gains `-webkit-font-smoothing: antialiased`, `-moz-osx-font-smoothing: grayscale`, `text-rendering: optimizeLegibility`.
- Markdown links take `--primary` with the underline moved to `:hover`.
- The dense thinking variant is untouched: `.chat-markdown.chat-markdown-dense` (0-2-0) still beats the root `.text-foreground` utility, and `twMerge` keeps the explicit `text-secondary-label` its call sites pass.

Explicitly **not** changed: `chat-column` stays at `48rem`. Measure was checked and rejected as a cause — the column runs ~110 characters and a counted line in the reference screenshot runs ~113. Line length is not the problem.

## Verification

- **unit verified:** `bun test packages/ui/test/appearance-fonts.test.ts packages/ui/test/appearance-theme.test.ts packages/ui/test/conversation.test.ts` — 30 pass. `appearance-fonts.test.ts` updated for the new default.
- **typecheck:** `@pho-code/ui` and `@pho-code/protocol` clean.
- **desktop:** not verified here.
- **packaged:** not verified.

## Owner feedback

2026-08-22: asked why Claude Code's text, inline code, and composer look better, then approved the resulting plan.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
