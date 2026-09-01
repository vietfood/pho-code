# Related add-on: approval foundation in Pho Agent

Date: 2026-09-01
Status: Implemented for the approval-modes add-on; V5 remains blocked
Owner: features/approval-modes with packages/pho-agent
Related: [`../../../features/approval-modes/logs/2026-09-01-m0-m3-pi-implementation.md`](../../../features/approval-modes/logs/2026-09-01-m0-m3-pi-implementation.md)

## Owner direction

The owner directed the foundational approval feature into `packages/pho-agent`
instead of leaving its reusable state machine in Pho Code.

## Ownership landed

Pho Agent now owns backend-neutral approval action/decision contracts, exact
canonical input fingerprints, the per-session controller, ordered policy and
final revalidation, one-use/session grants, reviewer lifecycle and circuit
breaker, a bounded process-wide reviewer pool, and Pi whole-action interception.
Pho Code supplies product invariants, boundary/sandbox execution, reviewer-model
resolution, settings/history/migration, and UI.

The source direction remains one-way: Pho Agent imports no `@pho-code/*` package.
The focused Pho Agent approval suite passed 22/22 and workspace typecheck passed.

## V5 status

This is implementation for an independently promoted add-on. It does not lift
the 2026-08-28 V5 hold, accept redirected V5 M0, or authorize external-backend
approval work. Codex and ACP stay Ask-only until their native mode capabilities
can be characterized under resumed V5 scope.
