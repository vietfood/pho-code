# Glass strength 0% equals opaque

Kind: change  
Status: implemented  
Surface: appearance glass / settings slider / shell chrome fills  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-19-change-glass-composer-right-bar.md`](./2026-08-19-change-glass-composer-right-bar.md), [`2026-08-20-change-glass-settings-composer-center.md`](./2026-08-20-change-glass-settings-composer-center.md), [`2026-08-27-change-unified-surface-color.md`](./2026-08-27-change-unified-surface-color.md)

## Intended change

Owner expected the Glass strength slider to reach the opaque appearance at 0%: "frosted glass strength didn't work yet (because 0% isn't the same as opaque version)."

## Expected / actual (before)

Expected: strength 0% looks identical to Frosted glass off — solid fills, no blur.

Actual: `glassCssTokens` interpolated from a deliberate frost floor (`blurPx = 8 + t * 16`, `opacityPercent = 84 - t * 20`), so 0% still rendered 8px blur and 84% fills. True opaque existed only in the glass-off branch of `applyAppearanceTheme`, which hardcodes 0px/100%. The slider could never reach it.

## Changes and decisions

- `packages/protocol/src/settings.ts`: `glassCssTokens` now interpolates from the opaque baseline — `blurPx = t * 24` (0% → 0px, 100% → 24px) and `opacityPercent = 100 - t * 36` (0% → 100%, 100% → 64%). Sidebar blur keeps the 1.2× multiplier; the shared sidebar/pane/composer fill opacity contract from the unified-surface-color change is unchanged. The strength doc comment now reads "0 = opaque, 100 = strong".
- `packages/protocol/test/protocol.test.ts`: the glass token test now pins 0% to exactly 0px blur and 100% opacity on all three fills; mid (55%) and max (100%) readability bounds unchanged and still hold (80% / 13px, 64% / 24px).
- With glass on at 0%, `data-glass="on"` rules still apply but every fill resolves to 100% opacity with 0px blur, which is visually identical to glass off; the toggle remains the way to remove the composer shadow/frost chrome entirely.

## Verification

- **unit verified:** `bun test packages/protocol/test/protocol.test.ts` — 26 pass, including the new 0% opaque assertions.
- **typecheck/lint:** `bun run typecheck` clean; `bun run lint` 0 errors (9 pre-existing warnings in untouched files).
- **desktop verified:** `bun run test:desktop -- tests/settings.spec.ts` — 2 pass. The spec drives strength 70 and asserts composer opacity < 100 and sidebar == pane opacity; both hold under the new formula (70% → 75 opacity).
- **packaged:** not verified; settings token math only, no packaged resources touched.

## Owner feedback

2026-08-27: "I think frosted glass strength didn't work yet (because 0% isn't the same as opaque version). Do you know why?" — root cause was the intentional frost floor in `glassCssTokens`; owner approved interpolating from opaque instead.

## Mistakes and corrections

- The first `test:desktop` attempt failed with "Process failed to launch!" inside the agent sandbox (both specs, at launch, no assertions run). Re-running unsandboxed passed; the failure was environmental, not from this change.

## Handoff

- If a minimum frost is ever wanted again, reintroduce it as a floor on the slider range (e.g. `MIN_GLASS_STRENGTH > 0`) rather than inside the token formula, so the 0% = opaque contract stays honest.
