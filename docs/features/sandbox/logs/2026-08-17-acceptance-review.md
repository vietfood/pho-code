# Agent-tool sandbox acceptance review

Status: accepted  
Owner: features/sandbox  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`2026-08-17-m1-acceptance-review.md`](./2026-08-17-m1-acceptance-review.md), [`2026-08-16-m0-engine-pin.md`](./2026-08-16-m0-engine-pin.md), [`2026-08-16-m1-settings.md`](./2026-08-16-m1-settings.md), [`2026-08-17-m2-permission-skip.md`](./2026-08-17-m2-permission-skip.md), [`2026-08-17-m3-file-tool-policy.md`](./2026-08-17-m3-file-tool-policy.md), [`2026-08-17-deny-copy.md`](./2026-08-17-deny-copy.md), [`2026-08-17-m4-packaged-macos.md`](./2026-08-17-m4-packaged-macos.md), [`2026-08-17-owner-m3-tmp-ask.md`](./2026-08-17-owner-m3-tmp-ask.md), [`../../../ui/logs/2026-08-16-change-sandbox-settings.md`](../../../ui/logs/2026-08-16-change-sandbox-settings.md), [`../../../ui/logs/2026-08-17-change-sandbox-honesty.md`](../../../ui/logs/2026-08-17-change-sandbox-honesty.md), [`../../../ui/logs/2026-08-17-feedback-sandbox-tmp-write.md`](../../../ui/logs/2026-08-17-feedback-sandbox-tmp-write.md), [`../../../ui/logs/2026-08-17-change-sandbox-concise-default-on.md`](../../../ui/logs/2026-08-17-change-sandbox-concise-default-on.md)

## Decision

The owner accepted the agent-tool sandbox add-on on 2026-08-17 after exercising Milestones 1–4 in the live app, including a `/tmp` write that asked once (implicit temp + `external_directory`, not a policy hole). This review does **not** move the folder to `docs/archive/features/`. Accepted add-ons stay under `docs/features/` while current.

## Accepted boundary

- `@anthropic-ai/sandbox-runtime` `0.0.73` plus bundled ripgrep `15.2.0` initialize a fail-closed Seatbelt box for agent `bash` / `user_bash`.
- Settings section **Sandbox** (after Permissions) is the only owner control. Copy is short: Seatbelt for agent bash; workspace and temp stay allowed; healthy in-box bash and in-policy file tools skip asks; not a sandbox for Pho Code, Pi, the owner terminal, MCP, or Undo.
- Enable defaults **on**. Missing `sandbox-settings.json` or a missing `enabled` key turns the box on. Explicit `false` is kept. Network still defaults to deny. Workspace and temp read/write stay in-policy.
- Apply is idle-only. Creating or opening a session initializes the engine with that workspace so status is not stuck on Starting. Opening Settings refetches the snapshot.
- Healthy sandbox skips bash and in-policy `read` / `write` / `edit` **asks**. Permanent-removal and privilege-escalation **denies** still hold. Extra-workspace in-policy writes may still ask on `external_directory`.
- Out-of-policy bash is OS `EPERM` with owner-action copy (Do not retry; Settings → Sandbox). Out-of-policy file tools are denied in-process. No silent unsandbox retry.
- Packaged macOS stages the pinned engine (nested deps under the engine) and `rg` as app-owned resources. Missing `rg` is `rg-missing` and refuses bash while enabled.
- Deterministic tests (`PHO_CODE_TEST_MODEL=1`) keep sandbox off unless `userData/sandbox-settings.json` opts in, so permission journeys stay unsandboxed.

Not this add-on: wrapping PTY / MCP / `pho-web` / Cursor; Linux packaged bubblewrap; Phase F Pi-process containment; project `.pi/sandbox.json`.

## Acceptance evidence

Milestone 0–1: [`2026-08-17-m1-acceptance-review.md`](./2026-08-17-m1-acceptance-review.md).  
Milestone 2: [`2026-08-17-m2-permission-skip.md`](./2026-08-17-m2-permission-skip.md).  
Milestone 3: [`2026-08-17-m3-file-tool-policy.md`](./2026-08-17-m3-file-tool-policy.md), [`2026-08-17-owner-m3-tmp-ask.md`](./2026-08-17-owner-m3-tmp-ask.md).  
Milestone 4: [`2026-08-17-m4-packaged-macos.md`](./2026-08-17-m4-packaged-macos.md).

Acceptance-gate checks, macOS arm64, 2026-08-17, isolated temp userData/workspace:

- **unit verified:** `bun run typecheck` — pass. `bun run lint` — 0 errors (4 pre-existing `react-hooks/exhaustive-deps` warnings). `git diff --check` — clean.
- **unit / integration verified:** `bun test` — 654 pass, 2 fail. The failures are pre-existing `CHANGE_REVIEW_COPY` empty-string asserts in `packages/protocol/test/change-review.test.ts` (V3 Changes copy, not sandbox). Focused sandbox protocol/UI/runtime tests passed, including persist default-on and explicit `false`.
- **desktop verified:** `bun run test:desktop` — 22 pass, including default-on Healthy, skip-ask bash, denied curl, extra write path, and disable restoring Allow once.
- **packaged verified:** `bun run build` — pass. `bun run package:mac` — unsigned `.app`. `bun run test:packaged` — 5 pass, including staged `rg`, sandbox starts Healthy, workspace `touch`, denied curl, out-of-policy file-tool deny, Homebrew-less `PATH`.

**owner-verified:** 2026-08-17 live app. M1 Settings + wrap; M2 skip-ask; M3 workspace write; `/tmp` write asked once and succeeded after Allow (implicit temp). Owner then asked to wrap up, shorten Settings, and default on because workspace read/write stay allowed.

## Residual limits

- Extra-workspace in-policy writes can still prompt on `external_directory`. `/tmp` and `os.tmpdir()` are implicit writable roots.
- Allowlist-domain success is not a required Electron journey; network default remains deny.
- Linux packaged bubblewrap, PTY/MCP/`pho-web`/Cursor wrap, and Pi-process containment stay deferred.

## Architecture promotion

Protocol snapshot + `updateSandboxSettings`, application idle-only apply, runtime factory wrap while enabled, session-create initialize, Settings Sandbox section, `userData/sandbox-settings.json` default on, bash skip-ask, in-process file-tool policy, and packaged engine/`rg` staging are current architecture. Pi-process containment remains deferred.

## Handoff

No remaining sandbox milestone. Later expansions (Linux packaged, wrapping other tools, Phase F) are separate promotions. Do not start them from this review.
