# Ask-back questionnaire card on the permission dock

Kind: change
Status: implemented (feature Milestone 0; add-on not accepted)
Surface: composer-dock host dialog
Owner: features/plan-agent (card semantics); ui/conversation chrome (dock host)
Owning plan: [`../../features/plan-agent/implementation-plan.md`](../../features/plan-agent/implementation-plan.md)
Related logs: [`../../features/plan-agent/logs/2026-08-16-m0-ask-back.md`](../../features/plan-agent/logs/2026-08-16-m0-ask-back.md), [`2026-08-16-decision-plan-sidebar-surface.md`](./2026-08-16-decision-plan-sidebar-surface.md)

## Intended change

When the model calls `ask_user_question`, show a juicesharp/Claude questionnaire card: A/B/C/(D), descriptions, Type something, optional note/preview, tabs, review, Submit, Escape cancel. Do not reuse “Pending approval”.

## Expected / actual (before)

Expected: structured ask-back in Agent chat.
Actual: only permission select/confirm/input docks existed.

## Changes and decisions

- `HostDialog` dispatches `kind: "questionnaire"` to `AskUserCard`. Permission chrome is unchanged.
- Visual density from Beautiful UI ApprovalCard (lettered rows, Type something, header chips, review). Enter is card-owned; host Enter resolution returns null for questionnaires.
- Preview markdown uses existing `ConservativeMarkdown`. 8 KiB fields are rejected upstream, not truncated in the card.

## Verification

- Unit verified: `bun test packages/ui/test/ask-user-card-state.test.ts packages/ui/test/host-dialog.test.ts packages/ui/test/host-dialog-keys.test.ts` — questionnaire chrome, letter/digit shortcuts, Submit blocked until review.
- Desktop verified: `apps/desktop/tests/ask-user.spec.ts` — 1 passed after `electron-vite build`.

## Owner feedback

Use the Beautiful UI approval card as design inspiration for ask-back.

## Mistakes and corrections

`sr-only` radio `.check()` is intercepted by the option label. Tests click the label row.

## Handoff

Plan/Agent composer control and Plan sidebar are Milestone 1. Keep this card distinct from permission docks when those land.
