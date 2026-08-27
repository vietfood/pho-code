# Composer: hide Cursor models until sign-in

Kind: change
Status: in source
Surface: model picker, session selected model, Settings Accounts
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related architecture: [`../../architecture/extension-model.md`](../../architecture/extension-model.md)

## Intent

Owner asked that a first-time session with no Cursor account must not show Cursor in the model picker. Cursor should appear only after Settings sign-in or an API key (`CURSOR_API_KEY` or a stored key).

## Expected / actual (before)

Expected: native Pi providers stay hidden until authenticated; Cursor should match.
Actual: baked `pi-cursor-sdk` registers a placeholder API key so Pi treats Cursor as configured and advertises fallback `cursor/*` models on the first chat.

## Changes and decisions

- Settings → Accounts still lists Cursor at boot so the owner can add a key. The placeholder does not count as connected.
- The session catalog omits Cursor models until a stored Cursor credential or a real `CURSOR_API_KEY` exists.
- If Pi binds a new session to Cursor without those credentials, the harness rebinds to the first non-Cursor model when one exists and does not project Cursor as the selected model.
- `setSessionModel` and prompt admission refuse unauthenticated Cursor.

## Verification

- **unit verified:** `bun test packages/runtime/test/cursor-sdk-policy.test.ts packages/runtime/test/cursor-catalog.test.ts packages/runtime/test/credentials.test.ts` — 8 pass, including a real-session catalog round-trip (hide → import → show → logout → hide).
- **lint:** `bun run --filter @pho-code/runtime lint -- src/cursor-sdk-policy.ts src/credentials.ts src/pi-runtime.ts src/index.ts test/cursor-sdk-policy.test.ts test/cursor-catalog.test.ts test/credentials.test.ts` — 0 errors.
- **typecheck:** `bun run --filter @pho-code/runtime typecheck` reports pre-existing hosted-runtime / Codex option errors; none in the Cursor catalog files.
- **desktop:** not exercised as a Playwright journey.
- **packaged:** not verified.

## Owner feedback

2026-08-27: if I don't have any agent (first time), it shouldn't show Cursor; show Cursor only after sign-in or an API key. Happened because Pi does not support Cursor natively and the harness wired `pi-cursor-sdk`.

## Handoff

Living contract: [`../../architecture/extension-model.md`](../../architecture/extension-model.md). Composer warning dialog on Cursor select is unchanged.
