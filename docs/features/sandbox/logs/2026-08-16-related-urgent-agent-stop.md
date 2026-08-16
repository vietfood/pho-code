# Related: urgent agent-stop is not this sandbox

Status: ready for review  
Owner: features/sandbox  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`../../../urgent/agent-stop/logs/2026-08-16-research-handoff.md`](../../../urgent/agent-stop/logs/2026-08-16-research-handoff.md)

## Intent

Cross-link bounded Stop so agents do not treat `abortBash()` as Seatbelt, or wait on sandbox to make Stop work.

## Contracts and files

- Sandbox product: [`../product.md`](../product.md) — OS box for agent `bash` children
- Agent-stop product: [`../../../urgent/agent-stop/product.md`](../../../urgent/agent-stop/product.md) — in-process Stop; may call Pi `abortBash()`; not a sandbox

## Changes and decisions

No sandbox contract change. Agent-stop Milestone 1 must not wait on sandbox Milestone 0. Sandbox must not be described as the fix for a Stop button that hangs.

## Verification

Not verified: documentation-only reciprocal link.

## Mistakes and corrections

Do not call cancelling a bash child a sandbox. Do not call Seatbelt a Stop button.

## Owner feedback

None new. This log exists so the 2026-08-16 urgent Stop track stays distinct from the sandbox add-on.

## UI impact

None.

## Blockers and handoff

Sandbox implementation remains “not started.” Agent-stop remains proposed.
