# Desktop build fails on unaliased approval runtime subpaths

Kind: fix
Status: fixed in source
Surface: desktop build (`electron-vite`), Electron main bundle
Owner: conversation UI track (build config); caused by in-progress [`approval-modes`](../../features/approval-modes/README.md) work
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-09-01-bug-changes-tile-session-switch.md`](./2026-09-01-bug-changes-tile-session-switch.md)

## Intent

`bunx electron-vite build` (and therefore `bun run test:desktop`) must succeed
so renderer changes can be desktop-verified.

## Expected / actual (before)

Expected: build succeeds.
Actual: build failed with
`[vite:load-fallback] Could not load …/packages/pho-agent/packages/runtime/src/index.ts/approval-controller … ENOTDIR`
(imported by `packages/runtime/src/pi-runtime.ts`).

Root cause: the in-progress approval-modes work added
`@pho-agent/runtime/approval-controller`, `/approval-feature`, and
`/approval-reviewer` imports (the submodule exports them), but
`apps/desktop/electron.vite.config.ts` keeps an exact-match alias map whose
bare `@pho-agent/runtime` entry prefix-matches any unlisted subpath and
resolves it as `src/index.ts/<subpath>`. The three new subpaths had no exact
alias entries.

## Changes and decisions

- `apps/desktop/electron.vite.config.ts`: added exact aliases for the three
  approval subpaths ahead of the bare `@pho-agent/runtime` entry, matching the
  existing pattern. No other subpath imports are missing (checked
  `packages/runtime/src`, `packages/application/src`, `apps/desktop/electron`,
  and the `@pho-agent/protocol/*` set against both alias maps).
- This only completes wiring the in-progress work already requires; it changes
  no runtime behavior.

## Verification

- **build:** `bunx electron-vite build` — pass.
- **desktop:** `bunx playwright test tests/change-review.spec.ts` — 4/4 pass.
- **unit / typecheck / lint:** recorded in
  [`2026-09-01-bug-changes-tile-session-switch.md`](./2026-09-01-bug-changes-tile-session-switch.md);
  the remaining root lint error is the pre-existing
  `packages/pho-agent/packages/runtime/src/runtime.ts`
  `consistent-type-imports` issue, not this change.
- **packaged:** not verified; packaging must keep resolving these subpaths
  through the same alias map (no staged-resource change).

## Owner feedback

None; found while desktop-verifying the Changes session-switch fix.

## Handoff

When the approval-modes workstream next edits
[`features/approval-modes`](../../features/approval-modes/README.md), its logs
should note that new `@pho-agent/runtime/*` subpath imports need matching exact
aliases in `electron.vite.config.ts`, or the desktop main bundle fails with
`ENOTDIR`. A lint rule or a prefix-safe alias helper would remove the footgun.
