# Settings Sandbox honesty copy after skip-ask

Kind: change
Status: in source (sandbox Milestone 4; add-on not accepted)
Surface: floating Settings dialog, Sandbox section disclosure
Owner: features/sandbox (policy); ui/settings chrome (copy host)
Owning plan: [`../../features/sandbox/implementation-plan.md`](../../archive/features/sandbox/implementation-plan.md)
Related logs: [`../../features/sandbox/logs/2026-08-17-m4-packaged-macos.md`](../../archive/features/sandbox/logs/2026-08-17-m4-packaged-macos.md), [`../../features/sandbox/logs/2026-08-17-m2-permission-skip.md`](../../archive/features/sandbox/logs/2026-08-17-m2-permission-skip.md), [`../../features/sandbox/logs/2026-08-17-m3-file-tool-policy.md`](../../archive/features/sandbox/logs/2026-08-17-m3-file-tool-policy.md), [`2026-08-16-change-sandbox-settings.md`](./2026-08-16-change-sandbox-settings.md)

## Intended change

Replace the Milestone 1 placeholder “permission dialogs may still appear for bash until skip-ask lands” with product honesty that matches Milestones 2–3: in-box bash and in-policy file tools skip asks while sandbox is on and healthy; denies still hold.

## Expected / actual (before)

Expected: Settings copy names what is boxed (agent bash), what is policy-gated (file tools), and that skip-ask is live when healthy.
Actual: disclosure still advertised skip-ask as future work.

## Changes and decisions

- `SANDBOX_DISCLOSURE` in `packages/protocol/src/sandbox.ts` now says healthy sandbox skips in-box bash and in-policy read/write/edit asks.
- Permanent-removal and out-of-policy denies remain named.
- Copy still must not mention `sandbox-exec`, proxy ports, or `rg` paths.

## Verification

- **unit verified:** `bun test packages/protocol/test/sandbox.test.ts packages/ui/test/sandbox-settings.test.ts` — disclosure no longer contains “until skip-ask lands”.
- **desktop verified:** `cd apps/desktop && bunx playwright test tests/sandbox.spec.ts` — Settings still shows Chromium renderer honesty copy.
- **packaged verified:** packaged sandbox journey asserts the skip-ask honesty sentence in Settings.

See [`../../features/sandbox/logs/2026-08-17-m4-packaged-macos.md`](../../archive/features/sandbox/logs/2026-08-17-m4-packaged-macos.md).

## Mistakes / corrections

None yet.

## Owner feedback

None yet.

## Handoff

Product chrome only. Packaged staging and notices are [`../../features/sandbox/logs/2026-08-17-m4-packaged-macos.md`](../../archive/features/sandbox/logs/2026-08-17-m4-packaged-macos.md).
