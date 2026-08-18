# Milestone 4: packaged macOS, docs, honesty

Status: in source, not accepted  
Owner: features/sandbox  
Plan: [`../implementation-plan.md`](../implementation-plan.md#milestone-4-packaged-macos-docs-honesty)  
Related logs: [`2026-08-17-m3-file-tool-policy.md`](./2026-08-17-m3-file-tool-policy.md), [`2026-08-17-m2-permission-skip.md`](./2026-08-17-m2-permission-skip.md), [`2026-08-17-m1-acceptance-review.md`](./2026-08-17-m1-acceptance-review.md), [`2026-08-17-deny-copy.md`](./2026-08-17-deny-copy.md), [`2026-08-17-owner-m3-tmp-ask.md`](./2026-08-17-owner-m3-tmp-ask.md), [`../../../ui/logs/2026-08-16-change-sandbox-settings.md`](../../../../ui/logs/2026-08-16-change-sandbox-settings.md), [`../../../ui/logs/2026-08-17-change-sandbox-honesty.md`](../../../../ui/logs/2026-08-17-change-sandbox-honesty.md)

## Intent

Unsigned macOS `.app` loads the pinned Anthropic engine and bundled `rg` from app-owned resources, without a Pi CLI and without Homebrew `rg` on `PATH`. Notices, architecture, and Settings honesty match shipped behavior. The add-on stays unaccepted until owner review of Milestones 2–4.

## Contracts and files

- Product: [`../product.md`](../product.md) packaged-resources invariant and honesty bullets
- Plan: `package:mac` stages engine + `rg`; packaged smoke; notices; architecture no longer lists tool-policy sandbox as wholly deferred
- Staging: `scripts/stage-app-resources.ts` `requireRipgrep`; `scripts/package-mac.ts` walks `@pho-code/runtime` and nests sandbox-runtime deps
- Electron: `apps/desktop/electron.vite.config.ts` externalizes `@anthropic-ai/sandbox-runtime`
- Honesty: `packages/protocol/src/sandbox.ts` `SANDBOX_DISCLOSURE`
- Packaged journey: `apps/desktop/tests/packaged.spec.ts`

## Changes and decisions

- `package:mac` now stages pinned `rg` into `Contents/Resources/features/ripgrep/` the same way GitHub MCP is required.
- Production package collection walks `@pho-code/runtime` without copying that workspace package, so `@anthropic-ai/sandbox-runtime` `0.0.73` lands in app `node_modules`.
- Nested `zod` 3 / `commander` / `node-forge` / `@pondwader/socks5-server` live under the engine so they do not collide with top-level `zod` 4.
- Missing staged `rg` remains `rg-missing` and refuses bash when enabled (Milestone 0 runtime contract). Packaged evidence is the complementary happy path: `rg` is present and enable reaches Healthy on a Homebrew-less `PATH`.
- No `pi-sandbox`. No silent unsandbox.

## Verification

macOS arm64, 2026-08-17. Isolated temp userData/workspace. Homebrew-less `PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`).

- **unit verified:** `bun test packages/protocol/test/sandbox.test.ts packages/runtime/test/sandbox-artifact.test.ts packages/ui/test/sandbox-settings.test.ts scripts/package-mac.test.ts scripts/stage-app-resources.test.ts` — 16 pass. Protocol honesty copy; nested `zod` 3 under the engine; notices name `@anthropic-ai/sandbox-runtime 0.0.73` and `ripgrep 15.2.0`; no `pi-sandbox`.
- **unit verified:** `bun run typecheck` — pass. `bun run lint` — 0 errors (4 pre-existing `react-hooks/exhaustive-deps` warnings). `git diff --check` — clean.
- **desktop verified:** `bun run --filter @pho-code/desktop build` then `cd apps/desktop && bunx playwright test tests/sandbox.spec.ts` — 2 pass. Honesty copy still present; enable → Healthy; skip-ask bash; extra write path.
- **packaged verified:** `bun run package:mac` — unsigned `apps/desktop/release/mac-arm64/Pho Code.app` with `Contents/Resources/features/ripgrep/15.2.0/darwin-arm64/rg`. `bun run test:packaged` — 5 pass, including enable → Healthy on Homebrew-less `PATH`, workspace `touch`, denied `curl` with “Do not retry”, and out-of-policy file-tool deny.

Missing staged `rg` → `rg-missing` remains the Milestone 0 runtime contract. This slice proves the complementary packaged happy path.

## Mistakes and corrections

The first packaged curl assertion looked for `Bash failed|not permitted|denied` on the tool detail. Seatbelt network deny surfaces as `curl: (56) CONNECT tunnel failed, response 403` plus the owner-action footer. Correction: assert “Sandbox blocked” / “Do not retry” / “Settings → Sandbox”.

## Owner feedback

None yet. Owner will test Milestones 2, 3, and 4 manually.

## UI impact

Settings disclosure no longer says skip-ask is future work. See [`../../../ui/logs/2026-08-17-change-sandbox-honesty.md`](../../../../ui/logs/2026-08-17-change-sandbox-honesty.md).

## Blockers and handoff

Not accepted. Independent review of pins, PATH/`rg` staging, permission skip, and no unsandbox retry remains the add-on gate.
