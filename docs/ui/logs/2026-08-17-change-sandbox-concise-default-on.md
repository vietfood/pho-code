# Settings Sandbox: shorter copy and default on

Kind: change  
Status: accepted with the sandbox add-on  
Surface: floating Settings dialog, Sandbox section  
Owner: features/sandbox (policy); ui/settings chrome (copy host)  
Owning plan: [`../../features/sandbox/implementation-plan.md`](../../features/sandbox/implementation-plan.md)  
Related logs: [`../../features/sandbox/logs/2026-08-17-acceptance-review.md`](../../features/sandbox/logs/2026-08-17-acceptance-review.md), [`2026-08-16-change-sandbox-settings.md`](./2026-08-16-change-sandbox-settings.md), [`2026-08-17-change-sandbox-honesty.md`](./2026-08-17-change-sandbox-honesty.md), [`2026-08-17-feedback-sandbox-tmp-write.md`](./2026-08-17-feedback-sandbox-tmp-write.md)

## Intended change

Owner asked to wrap the add-on, shorten Settings copy, make the text boxes more compact, and turn sandbox on by default because workspace (and temp) read/write stay allowed in-policy.

## Expected / actual (before)

Expected: a short honesty paragraph, compact path/domain fields, sandbox on for a new userData root.  
Actual: a long disclosure, tall textareas, default off.

## Changes and decisions

- `SANDBOX_DISCLOSURE` now names Seatbelt, allowed workspace/temp, skip-ask, and what is not boxed (Pho Code, Pi, owner terminal, MCP, Undo).
- Labels: Enable sandbox; Domains; Extra read/write paths; Package registries; Save.
- Textareas use a shorter min-height and `~/path` / `github.com` placeholders.
- Hint under extra write paths: “Workspace and temp are already writable.”
- Persist default is on. Missing `enabled` key coerces on; explicit `false` is kept. Deterministic tests stay off unless a settings file opts in.
- Opening Settings refetches the snapshot so sandbox status is not stuck on Starting from bootstrap.

Settings keeps a Sandbox section after Permissions. Archived remains archived chats. The add-on folder stays under `docs/features/sandbox/` while current.

## Verification

Recorded in [`../../features/sandbox/logs/2026-08-17-acceptance-review.md`](../../features/sandbox/logs/2026-08-17-acceptance-review.md).

## Mistakes / corrections

None yet.

## Owner feedback

2026-08-17: wrap up; less verbose Settings; concise text boxes; default on because workspace read/write stay allowed.

## Handoff

No further Settings copy work in this slice.
