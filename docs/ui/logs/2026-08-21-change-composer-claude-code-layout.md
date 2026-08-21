# Composer relayout: context rail, prompt-only field, flat toolbar

Kind: change
Status: in source
Surface: composer (hero and docked variants)
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-18-change-plan-agent-composer-chrome.md`](./2026-08-18-change-plan-agent-composer-chrome.md), [`2026-08-20-change-glass-settings-composer-center.md`](./2026-08-20-change-glass-settings-composer-center.md)

## Intent

Owner asked for the Claude Code composer shape: context chips on a rail above the field, a field that holds only the prompt plus a `↵` send affordance, and a flat mode/model/usage toolbar under the field. Visual reference only — no Claude Code code, branding, or features were copied.

## Expected / actual (before)

Expected: the field reads as one prompt line; session context and controls sit outside it in quiet rows.
Actual: the hero centered a workspace/machine breadcrumb over a tall bordered box that also carried the mode, model, thinking, and send controls, with a separate meta strip (folder + usage) underneath. The docked variant repeated the folder inside that strip.

## Changes and decisions

- New `packages/ui/src/composer-rail.tsx`: machine and workspace chips above the field in both variants, plus an optional `+` attach button. The rail replaces `EmptySessionStage`'s centered `SessionContext` and the meta strip's folder, so `Conversation` now always passes `metaHint`.
- No branch or worktree chip. The protocol carries no branch state and git branch switching is out of scope for this track; a decorative chip would have been fake chrome.
- The rail `+` renders only when the selected model accepts images. Non-vision models keep the explanatory disabled `Images…` entry in the mode menu instead of a dead square on the rail.
- New `packages/ui/src/composer-toolbar.tsx`: flat row under the field. Leading holds the mode chip and, while a run is live, Steer/Follow-up. Trailing holds the model picker, thinking chip, and the Pi usage meter. `composer-meta-strip.tsx` and its test are retired (trashed, not deleted).
- `.composer-field` puts the send control at the field's trailing edge, sized to one prompt line box (1.5rem) so bottom alignment centers the glyph on the caret line rather than floating it above the text; on a grown field it rides the last line. Send is a `CornerDownLeft` glyph that stays quiet until there is something to send (`is-ready`); Stop reuses the same shape with the destructive tint. `aria-label="Send"` / `data-testid="stop-button"` are unchanged, so existing desktop specs still drive it; the send button also gained `data-testid="send-button"`.
- The mode button is now a labeled chip (`Agent` / `Plan`) since it sits in a text row. Its accessible name stays "Agent mode and attachments" for `packaged.spec.ts`. Mode tint dropped from 16%/24% to 9%/16% so the quietest row is not the loudest control.
- `--composer-radius` 1.25rem → 1rem, and the field's minimum height drops to one line in both variants now that the box no longer wraps the control row.
- `host-ui.spec.ts` and `conversation.test.ts` moved from `session-context` / `composer-meta-strip` to `composer-rail` / `composer-toolbar`.

## Verification

- **unit verified:** `bun test packages/ui` — 262 pass (new `composer-rail.test.ts`, `composer-toolbar.test.ts`).
- **desktop verified:** `bun run test:desktop` — 29 pass. A temporary screenshot spec confirmed hero, typed-hero, docked, and dark-mode chrome in the real Electron surface; it was trashed after review. Owner flagged the send glyph sitting high against the placeholder; the 1.5rem sizing above is the fix, re-checked in Electron at empty, typed, and three-line states.
- **typecheck:** `bun run typecheck` — all packages pass. **lint:** `bun run lint` — 0 errors (8 pre-existing warnings, none in the changed files).
- **packaged:** not verified.

## Owner feedback

2026-08-21: redesign the composer after the Claude Code composer (screenshot supplied), replacing the current centered breadcrumb + all-in-one box.

## Handoff

Living contracts: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md), [`../../references-and-attribution.md`](../../references-and-attribution.md).
