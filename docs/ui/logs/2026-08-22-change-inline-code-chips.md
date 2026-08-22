# Borderless inline code chips, breathable code blocks, larger prompt text

Kind: change
Status: in source
Surface: chat markdown code / composer prompt field
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-transcript-type-scale.md`](./2026-08-22-change-transcript-type-scale.md), [`2026-08-16-change-inline-code-shiki-palette.md`](./2026-08-16-change-inline-code-shiki-palette.md), [`2026-08-22-change-composer-radius-border.md`](./2026-08-22-change-composer-radius-border.md)

## Intent

In the owner's screenshot of a file-heavy investigation report, every symbol and path rendered as a hard-edged rectangle — roughly fifteen boxes per screen. The reference renders the same content as soft tinted chips that read as emphasis, not interruption.

## Expected / actual (before)

Expected: inline code is emphasis; code blocks are readable at editor density.

Actual:

- `.chat-markdown :not(pre) > code` had a 1px border, a fill, **and** `padding: 0.02em 0.28em` — 0.24px of vertical padding at that size. The fill hugged the glyphs and the border drew a hard rectangle around them. At `0.86em` the mono glyphs were ~12px against 14px sans, and mono reads optically smaller than its point size, so chips came out around 11px.
- The chip fill mixed against `--background`, so a chip inside the user bubble or a tool row sat on the wrong base.
- Code blocks ran `font-size: 0.8em; line-height: 1.2` in both the codeblock and Shiki paths — 11.2px on 13.4px leading, tighter than any editor.
- The composer prompt was `calc(var(--font-size-chat) * 0.92)` = 12.9px, a step *under* transcript body, so the primary input read as a status bar.

## Changes and decisions

- Inline chip: border dropped entirely, `padding: 0.12em 0.36em`, `font-size: 0.9em`, radius `0.3rem`.
- New `--code-chip-bg` token, mixed against `transparent` rather than `--background`, so chips keep the same weight on any surface and palettes can tune the chip independently of `--muted`.
- `pre code` 0.85em/1.5 → 0.875em/1.55. Codeblock and Shiki paths 0.8em/1.2 → 0.875em/1.55, with block padding `0.35rem 0.65rem` → `0.7rem 0.85rem`.
- Composer prompt goes to full `--font-size-chat` at leading 1.5 — the field now matches transcript body instead of undercutting it. `.composer-send` grows 1.5rem → 1.75rem to stay sized to one prompt line box under the new leading, keeping the glyph centred on the caret line.
- Composer horizontal inset `px-3` → `px-4` in both variants; 12px was tight against a 15px prompt.

## Decisions reversed mid-change

The original plan also proposed dropping the composer drop shadow and giving the empty field a two-line minimum height. Both were **reverted** on reading the logs: [`2026-08-22-change-composer-glass-frost.md`](./2026-08-22-change-composer-glass-frost.md) makes the shadow part of a deliberate, unit-tested glass contract, and [`2026-08-21-change-composer-claude-code-layout.md`](./2026-08-21-change-composer-claude-code-layout.md) deliberately dropped the field to one line box in both variants once the control row moved out. The plan was written against a screenshot that predated both. Composer radius, outline, and glass are untouched.

## Verification

- **unit verified:** `bun test packages/ui/test/appearance-fonts.test.ts packages/ui/test/appearance-theme.test.ts packages/ui/test/conversation.test.ts` — 30 pass, including the glass shadow assertion that caught the reverted change.
- **typecheck:** `@pho-code/ui` and `@pho-code/protocol` clean.
- **desktop:** not verified here.
- **packaged:** not verified.

## Owner feedback

2026-08-22: asked why Claude Code's inline code and composer look better, then approved the resulting plan.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md).
