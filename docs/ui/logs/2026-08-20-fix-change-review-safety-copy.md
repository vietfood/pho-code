# Restore change-review safety copy

Kind: bug
Status: implemented
Surface: change review / Approve / Undo
Owner: personal v3
Owning plan: [`../../archive/v3/implementation-plan.md`](../../archive/v3/implementation-plan.md)
Related log: [`2026-08-20-bug-appearance-reverts-on-new-session.md`](./2026-08-20-bug-appearance-reverts-on-new-session.md)

## Intended change

Restore the accepted V3 safety and data-ownership disclosures that were blanked during an unrelated Settings copy edit.

## Expected / actual (before)

Expected: change review explains that writes are already on disk, which tools are tracked, what capture limits omit, when a ledger is unreadable, which metadata Undo cannot restore, and where retained snapshots live.

Actual: all of those source-owned strings were empty. The review sheet therefore hid material limitations, and the accepted protocol tests for the tracked-file limit and already-applied semantics failed.

## Changes and decisions

- Restored the accepted V3 strings without changing protocol shapes, persistence, review behavior, or layout.
- Kept `trackedOnly` as the concise “Changes” heading.
- Did not add Settings or make safety copy configurable.

## Verification

Pending the focused protocol rerun and the V5 Milestone 0 exit lane.
