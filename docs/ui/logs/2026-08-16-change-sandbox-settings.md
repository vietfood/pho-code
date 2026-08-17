# Settings Sandbox section

Kind: change  
Status: accepted (feature Milestones 0–1; add-on not accepted)  
Surface: floating Settings dialog  
Owner: features/sandbox (policy); ui/settings chrome (section host)  
Owning plan: [`../../features/sandbox/implementation-plan.md`](../../features/sandbox/implementation-plan.md)  
Related logs: [`../../features/sandbox/logs/2026-08-16-m1-settings.md`](../../features/sandbox/logs/2026-08-16-m1-settings.md), [`../../features/sandbox/logs/2026-08-16-m0-engine-pin.md`](../../features/sandbox/logs/2026-08-16-m0-engine-pin.md), [`../../features/sandbox/logs/2026-08-17-m1-acceptance-review.md`](../../features/sandbox/logs/2026-08-17-m1-acceptance-review.md), [`../../features/sandbox/logs/2026-08-17-m2-permission-skip.md`](../../features/sandbox/logs/2026-08-17-m2-permission-skip.md), [`../../features/sandbox/logs/2026-08-17-m3-file-tool-policy.md`](../../features/sandbox/logs/2026-08-17-m3-file-tool-policy.md), [`../../features/sandbox/logs/2026-08-17-m4-packaged-macos.md`](../../features/sandbox/logs/2026-08-17-m4-packaged-macos.md), [`../../features/sandbox/logs/2026-08-17-owner-m3-tmp-ask.md`](../../features/sandbox/logs/2026-08-17-owner-m3-tmp-ask.md), [`2026-08-17-change-sandbox-honesty.md`](./2026-08-17-change-sandbox-honesty.md), [`2026-08-17-feedback-sandbox-tmp-write.md`](./2026-08-17-feedback-sandbox-tmp-write.md)

## Intended change

Add a Settings section **Sandbox** after Permissions so the owner can enable the OS box, choose deny vs allowlist, and see healthy/failed/off status with honesty copy.

## Expected / actual (before)

Expected: a reviewable in-app control for agent-tool sandbox.  
Actual: Milestone 0 wrap existed only in runtime tests.

## Changes and decisions

- Section order: Appearance, Accounts, GitHub, Skills, Archived, Permissions, Sandbox.
- Honesty copy states renderer sandbox, permission dialogs, domain allowlists, owner PTY, V3 Undo, and process separation are not this box.
- Enable, network mode, and registry-defaults apply immediately while idle. Domain and path lists use a Save control so typing does not apply a half-edited allowlist.
- Controls disable while a run is live; copy says wait until idle.
- Status never shows proxy ports, Seatbelt profiles, or `rg` paths.

## Verification

- **unit verified:** `bun test packages/ui/test/sandbox-settings.test.ts packages/ui/test/settings-section.test.ts` — Sandbox after Permissions; honesty copy; idle-pending copy.
- **desktop verified:** `cd apps/desktop && bunx playwright test tests/sandbox.spec.ts` — Settings section visible, enable → Healthy, wrap/deny/disable journey. See [`../../features/sandbox/logs/2026-08-16-m1-settings.md`](../../features/sandbox/logs/2026-08-16-m1-settings.md).

## Mistakes / corrections

None in the chrome itself. The owning Milestone 1 log records factory/locator mistakes that blocked the Electron review.

## Owner feedback

Without UI, the wrap cannot be reviewed.

2026-08-17: owner reviewed the live Settings section and accepted Milestones 0–1. Out-of-workspace bash to Homebrew Cellar was blocked (permission-system deny; skip-ask remains Milestone 2).

## Fix / handoff

Milestones 0–1 accepted 2026-08-17. Milestone 2 still owns skip-ask. This section is the only owner control surface for the add-on.

2026-08-17: extra write/read lists also gate in-process `read`/`write`/`edit` (Milestone 3, in source, not accepted).
