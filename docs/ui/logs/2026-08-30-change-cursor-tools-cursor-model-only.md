# Context prompt: Cursor tools only on Cursor models

Kind: change
Status: in source
Surface: Context prompt Tools group, Pi active tool set, compiled prompt A
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md) §12
Related architecture: [`../../architecture/extension-model.md`](../../architecture/extension-model.md)
Related: [`2026-08-27-change-hide-unauthenticated-cursor.md`](./2026-08-27-change-hide-unauthenticated-cursor.md), parked [`../../version/v5/logs/2026-08-30-parked-cursor-cli-backend.md`](../../version/v5/logs/2026-08-30-parked-cursor-cli-backend.md)

## Intent

Cursor question, Cursor skill, and the Cursor activity tool should load only while the live Pi session model is Cursor. The baked `pi-cursor-sdk` provider stays loaded for Accounts, catalog, and local SDK streaming. The Cursor skill *source* in Settings is unchanged.

## Expected / actual (before)

Expected: non-Cursor Pi models see Pho/Pi tools only.
Actual: `pi-cursor-sdk` registered Cursor tools on every Pi session. Pho Code `applyToolPolicy` then called `setActiveToolsByName` with every registered name (minus Plan-forbidden tools), which re-enabled those Cursor tools for Anthropic/OpenAI/etc. Context prompt listed them via `getAllTools()` (18/18). `setSessionModel` did not re-apply the policy.

## Changes and decisions

- Filter Cursor SDK tool names (`cursor`, `cursor_*`) out of the active set, Context prompt Tools group, and compiled A unless `session.model.provider` is `cursor`.
- Re-apply tool policy after `setSessionModel` so empty chats gain/lose the chips when the picker moves on or off Cursor.
- Uncustomized chats keep Pi’s live system prompt. Pi `setActiveToolsByName` rebuilds that prompt from the active tool set, so inactive Cursor snippets are omitted without a Pho override.
- Custom records that still list Cursor tools are stripped at inspect/injection time on a non-Cursor model; the JSONL entry is not rewritten after the first message.
- Compaction is not this slice. A Cursor-CLI / ACP backend is parked under V5.

## Verification

- **unit verified:** `bun test packages/runtime/test/runtime-plan-context.test.ts packages/runtime/test/context-prompt.test.ts --timeout 20000` — 19 pass
- **unit verified:** `bun test packages/runtime/test/cursor-catalog.test.ts --timeout 20000` — 1 pass
- **typecheck:** `bun run typecheck` — pass (11 packages)
- **lint:** `bun run lint` — 0 errors; 8 pre-existing `react-hooks/exhaustive-deps` warnings
- **desktop:** not exercised as a Playwright journey
- **packaged:** not verified

## Owner feedback

2026-08-30: everything related to Cursor should be loaded on a Cursor model only; Cursor CLI as a Codex/Claude-style backend can wait.

## Handoff

Living contract: conversation-ui §12 and [`../../architecture/extension-model.md`](../../architecture/extension-model.md). Do not start a Cursor-CLI backend while V5 is blocked.
