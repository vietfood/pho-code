# Milestone 0–1 acceptance review

Status: accepted  
Owner: features/sandbox  
Plan: [`../implementation-plan.md`](../implementation-plan.md#milestone-1-settings--bash-wrap-in-electron)  
Related logs: [`2026-08-16-m0-engine-pin.md`](./2026-08-16-m0-engine-pin.md), [`2026-08-16-m1-settings.md`](./2026-08-16-m1-settings.md), [`../../../ui/logs/2026-08-16-change-sandbox-settings.md`](../../../../ui/logs/2026-08-16-change-sandbox-settings.md)

## Decision

The owner accepted sandbox Milestones 0 and 1 on 2026-08-17 after reviewing Settings → Sandbox in the running Electron app. The add-on as a whole is **not** accepted. Permission skip, in-process file-tool policy, and packaged staging remain Milestones 2–4.

## Accepted boundary

- `@anthropic-ai/sandbox-runtime` `0.0.73` plus bundled ripgrep `15.2.0` initialize a fail-closed Seatbelt box for agent `bash` / `user_bash`.
- Settings section **Sandbox** (after Permissions) is the only owner control: enable, deny vs allowlist, registry-defaults toggle, extra paths, honesty copy, and status.
- Apply is idle-only. Factory replaces bash only while enabled. Disable rebinds idle sessions so built-in bash stays permission-gated.
- Default remains off. Enabled and unhealthy refuses bash. No silent unsandbox.
- Permission asks and denies for bash still fire. Skip-ask is Milestone 2.

Not accepted: converting in-box `ask` to allow, intercepting `read`/`write`/`edit`, `package:mac` staging, wrapping PTY/MCP/`pho-web`/Cursor.

## Acceptance evidence

Milestone 0 (`2026-08-16-m0-engine-pin.md`):

- **unit verified:** status mapping, policy, staged `rg` PATH, SHA-256 fail-closed.
- **integration verified:** isolated workspace `touch` via wrapped bash; `ls ~/.ssh` Operation not permitted; deny-network `curl` failed; `reset()` returned.

Milestone 1 (`2026-08-16-m1-settings.md`):

- **unit verified:** protocol bounds, Settings section order, honesty copy.
- **integration verified:** idle enable wraps workspace `touch`; deny-network `curl` fails; disable restores bash asks.
- **desktop verified:** `cd apps/desktop && bun run build && bunx playwright test tests/sandbox.spec.ts` — honesty copy, enable → Healthy on Homebrew-less `PATH` with staged `rg`, workspace `touch`, `curl` denied, disable restores Allow once.

**owner-verified:** 2026-08-17 live app. Owner enabled the Settings surface and had an agent write a Zig program. Bash probing `/opt/homebrew/Cellar/zig/...` failed. The visible tool output was `[pi-permission-system] User denied external directory access for bash command …`. That is the permission layer (expected after Milestone 1). Out-of-workspace bash was blocked. Seatbelt wrap itself is the desktop/runtime evidence above, not this permission string.

**packaged:** not this milestone.

## Residual limits

- Allowlist-domain success and extra write-path enforcement were not in the Electron journey; proportional M1 verification used deny-network `curl` and workspace `touch`.
- Permission dialogs still appear for wrapped bash until Milestone 2.
- `package:mac` does not yet stage the engine or `rg`.

## Architecture promotion

Protocol snapshot + `updateSandboxSettings`, application idle-only apply, runtime factory wrap while enabled, Settings Sandbox section, and `userData/sandbox-settings.json` are current architecture for Milestones 0–1. Permission skip, file-tool intercept, and packaged resource staging stay on the add-on plan.

## Handoff

Milestone 2: skip permission **asks** for healthy in-box bash. Denies remain. Disable restores today’s asks. Do not start that work in this review.
