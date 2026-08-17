# Milestone 3: in-process file-tool policy

Status: in source, not accepted  
Owner: features/sandbox  
Plan: [`../implementation-plan.md`](../implementation-plan.md#milestone-3-in-process-file-tool-policy)  
Related logs: [`2026-08-17-m2-permission-skip.md`](./2026-08-17-m2-permission-skip.md), [`2026-08-16-m1-settings.md`](./2026-08-16-m1-settings.md), [`2026-08-17-m1-acceptance-review.md`](./2026-08-17-m1-acceptance-review.md), [`2026-08-17-deny-copy.md`](./2026-08-17-deny-copy.md), [`2026-08-17-m4-packaged-macos.md`](./2026-08-17-m4-packaged-macos.md), [`2026-08-17-owner-m3-tmp-ask.md`](./2026-08-17-owner-m3-tmp-ask.md), [`../../../ui/logs/2026-08-16-change-sandbox-settings.md`](../../../ui/logs/2026-08-16-change-sandbox-settings.md)

## Intent

`read` / `write` / `edit` obey the same Settings filesystem policy as Seatbelt bash. In-policy file tools skip permission asks. Out-of-policy is deny with a sandbox reason. V3 still captures successful write/edit. Permission denies still hold.

## Contracts and files

- Product: [`../product.md`](../product.md) permission interaction table and hard-coded denies
- Plan: canonical matcher shared with bash policy; `tool_call` intercept for `read`/`write`/`edit` only; skip ask when in policy and healthy; do not intercept `move_to_trash`, retrieval, or MCP
- Runtime matcher: `packages/runtime/src/sandbox-policy.ts` `evaluateSandboxFileToolAccess`
- Runtime service: `AgentSandbox.evaluateFileTool` (healthy only; failed/off defer to permission-system)
- Intercept: `packages/runtime/src/sandbox-feature.ts` `tool_call` block
- Authorizer: `packages/runtime/src/sandbox-permission.ts` skip write/edit/read **asks**; **deny** out-of-policy asks including `path` / `external_directory` (deny is allowed by the bounded-delegation envelope; **allow** on those surfaces is still capped to defer)
- Not in this milestone: packaged `rg`/engine staging (M4)

## Changes and decisions

- File-tool roots match Settings: workspace, platform temp, additional write (also readable), additional read. Hard deny-read of `~/.ssh`, `~/.aws`, `~/.gnupg`, agent/app-data roots. Hard deny-write of `.env` / `.env.*` / `*.pem` / `*.key` plus the engine’s mandatory writes (shell rc, `.git/hooks`, `.git/config`, `.mcp.json`, `.vscode`, `.idea`).
- Canonicalize through existing ancestors so `/var` vs `/private/var` cannot bypass a root.
- Healthy intercept is fail-closed: missing path is deny. Failed/unavailable/off file tools stay on permission-system only.
- Balanced workspace `write`/`edit` skip the write-surface ask. Guarded `path` asks can still appear (same bounded-delegation limit as M2 bash+path). Extra write paths outside the workspace may still prompt on `external_directory`; after Allow once the write succeeds. Out-of-policy extra siblings deny with no dialog.
- `.env` remains a permission-system path deny. `.mcp.json` is the sandbox-specific protected write (permission would have asked). `~/.ssh/id_rsa` stays denied in developer mode; the integration probe never changes the owner’s key bytes.
- V3 ledger still records the allowed workspace write. Denied writes do not capture a successful pending file.

## Verification

macOS arm64, 2026-08-17. Isolated temp agent/workspace/userData. Not packaged.

- **unit verified:** `bun run typecheck` — pass. `bun run lint` — 0 errors (4 pre-existing `react-hooks/exhaustive-deps` warnings in `App.tsx` and `context-prompt-dialog.tsx`). `bun test packages/runtime/test/sandbox-policy-file.test.ts packages/runtime/test/sandbox-permission.test.ts` — pass, including the healthy-only missing-path deny after the off/failed defer fix.
- **integration verified:** `bun test packages/runtime/test/sandbox-file-tool-runtime.test.ts packages/runtime/test/sandbox-permission-runtime.test.ts packages/runtime/test/sandbox-settings-runtime.test.ts` — pass. Balanced: workspace write with no dialog and V3 pending capture; `.env` still permission-denied; `.mcp.json` sandbox-denied; extra write path allowed (external-directory Allow once if prompted); sibling denied with sandbox reason; disable restores write asks. Developer: `~/.ssh/id_rsa` denied, key bytes unchanged.
- **desktop verified:** `bun run --filter @pho-code/desktop build` then `cd apps/desktop && bunx playwright test tests/sandbox.spec.ts` — pass (20.3s, 2 tests). Existing bash skip journey plus: enable → workspace `USE_WRITE` with no dock and a Changes file count; default extra sibling denied; Settings extra write path then allows that file.
- **packaged:** not verified. Milestone 4.

`git diff --check` — clean.

## Mistakes and corrections

First extra-write runtime helper sent `selected: "Allow once"` (the label) instead of `Yes` (the host-dialog value), so the dock never settled. Correction: resolve with `Yes`, matching other runtime permission tests.

Unit tests that `mkdtemp` under `$HOME` failed inside the Cursor command sandbox (`EPERM`). Matcher tests now use synthetic home paths without creating directories. Runtime/Electron still create real extra roots and trash them.

A first matcher used `path.resolve` for missing files, so `/var/folders` did not match a realpath’d tmpdir. Correction: walk to an existing ancestor and `realpath` that before joining the remainder.

The file-tool authorizer denied missing-path asks even when sandbox was off or failed, which would have converted those asks into sandbox denies instead of leaving them on the permission-system. Correction: defer unless `enabled` and `healthy` before the missing-path fail-closed deny.

## Owner feedback

None yet.

## UI impact

No new chrome. Settings extra write/read lists now also gate in-process file tools, not only Seatbelt bash. Workspace writes under a healthy sandbox no longer open the permission dock in balanced. Out-of-policy file tools fail as ordinary tool errors.

## Blockers and handoff

Not accepted. Packaged staging is Milestone 4. See [`2026-08-17-m4-packaged-macos.md`](./2026-08-17-m4-packaged-macos.md).
