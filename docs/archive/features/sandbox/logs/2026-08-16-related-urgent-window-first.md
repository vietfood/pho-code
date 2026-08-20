# Related: urgent window-first track is not this sandbox

Status: ready for review  
Owner: features/sandbox  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`window-first research`](../../../urgent/window-first-pi-core/logs/2026-08-16-research-handoff.md), [`2026-08-16-m1-settings.md`](./2026-08-16-m1-settings.md)

## Intent

Cross-link the new urgent track so agents do not fold OS boxing of agent `bash` into Electron `utilityProcess` work.

## Contracts and files

- Sandbox product: [`../product.md`](../product.md) — agent `bash` Seatbelt; not Phase F; not renderer sandbox
- Archived product: [`window-first-pi-core`](../../../urgent/window-first-pi-core/product.md) — accepted window-first boot; process extraction deferred to Phase F

## Changes and decisions

No sandbox contract change. Window-first / `utilityProcess` must not become a prerequisite for sandbox Milestone 0. Sandbox must not be described as the fix for long startup.

## Verification

Not verified: documentation-only reciprocal link.

## Mistakes and corrections

Do not call process separation a sandbox unless filesystem, network, credential, and child-process authority is constrained and tested. That sentence already lives in the sandbox product and in roadmap Phase F.

## Owner feedback

None new. This log exists so the two 2026-08-16 tracks stay distinct.

## UI impact

None.

## Blockers and handoff

Sandbox implementation remains “not started.” Urgent window-first remains proposed.
