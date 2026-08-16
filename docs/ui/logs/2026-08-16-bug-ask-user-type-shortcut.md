# Type something must not select option C

Kind: bug
Status: implemented (feature Milestone 0 chrome; add-on not accepted)
Surface: ask-user questionnaire card
Owner: features/plan-agent (card semantics); ui/conversation chrome (dock host)
Owning plan: [`../../features/plan-agent/implementation-plan.md`](../../features/plan-agent/implementation-plan.md)
Related logs: [`2026-08-16-change-ask-user-card.md`](./2026-08-16-change-ask-user-card.md), [`../../features/plan-agent/logs/2026-08-16-feedback-ask-user-allow.md`](../../features/plan-agent/logs/2026-08-16-feedback-ask-user-allow.md)

## Intended change

Typing a custom answer that starts with `c` (or `a`/`b`/`d` / `1`–`4`) must stay in the Type something field. Letter and digit shortcuts only apply when the owner is not typing in a text field.

## Expected / actual (before)

Expected: Type something accepts arbitrary text, including letters that match option shortcuts.
Actual: window-level `keydown` always mapped A–D / 1–4 onto options, so typing `c` selected option C.

## Changes and decisions

- `isAskUserTextEntryTarget` ignores shortcuts for `input` types that accept text, `textarea`, `select`, and contenteditable. Radio/checkbox rows still use letter shortcuts.
- Enter-to-submit is unchanged: a filled custom answer plus Enter still advances or submits.

## Verification

- Unit verified: `bun test packages/ui/test/ask-user-card-state.test.ts` — 3 pass (letter shortcuts, text-entry target, submit/review).
- Desktop: not verified.

## Owner feedback

Should be able to type an answer with `c` without the card choosing C.

## Mistakes and corrections

The original card skipped Enter only for `button, textarea`, not `input`, and never skipped letter shortcuts for any typing target.

## Handoff

Keep this card distinct from permission docks. Ask-user itself is allow-listed; see the related plan-agent feedback log.
