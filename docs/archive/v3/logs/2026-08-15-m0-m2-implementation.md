# V3 milestones 0–2 implementation record

Status: ready for review; not owner-accepted  
Owner: version/v3  
Plan: [`../implementation-plan.md`](../implementation-plan.md) — Milestones 0–2  
Related logs: [`../../../ui/logs/2026-08-15-change-v3-right-sidebar.md`](../../../ui/logs/2026-08-15-change-v3-right-sidebar.md), [`../../../features/terminal/logs/2026-08-16-promotion.md`](../../../features/terminal/logs/2026-08-16-promotion.md)

## Intent

Record the implemented change-capture, review, and safe per-file Undo slices without turning the implementation plan into an append-only session journal.

## Contracts and files

- Pi `0.84.1` `beforeToolCall` / `tool_call` ordering around built-in `write` and `edit`.
- JSON-safe change-review bridge commands and bounded `changeReviewUpdated` events.
- Runtime change ledger under `userData/change-ledger/v1/`.
- Changes surface in the persistent right sidebar.
- Unit/integration evidence under `packages/runtime/test/`; Electron evidence in `apps/desktop/tests/change-review.spec.ts`; packaged Undo/Trash journey.

## Changes and decisions

- Milestone 0 captures exact before/after bytes for attributable Pi writes/edits, including failure and two-session isolation. Capture, reconcile, conflict refresh, Approve, and Undo serialize per review scope with revision checks inside the lock.
- Milestone 1 uses Pi's public `generateUnifiedPatch` and presents a bounded unified diff. Per-file Approve preceded Approve-all of visible pending/conflict paths. Plain add/remove tinting remains; syntax-highlighted diff lines are deferred.
- Milestone 2 binds preview tokens to workspace, canonical path, file kind, review revision, after-hash, and device/inode identity. Apply holds the review-scope lock through restore/Trash and finalization. Sibling temporary files are journaled and recovered or moved to Trash after failure.
- Undo all remains unavailable.

## Verification

- Unit/integration evidence: write, edit, failure, original edit hash, two independent sessions, conflict refresh, revision serialization, restore, and created-file Trash paths.
- Desktop evidence: Changes diff, Approve, safe Undo, conflict refusal/acknowledgement, and relaunch journey.
- Packaged evidence: created-file Undo through the real macOS Trash path without a Pi CLI.
- Not verified: owner workflow using an external editor to create a conflict.

This record preserves previously reported evidence; this documentation refactor does not rerun those checks.

## Mistakes and corrections

- Preview/apply originally needed stronger filesystem identity binding. The reviewed implementation added device/inode checks and a final directory-entry identity check.
- A residual TOCTOU remains between the final identity check and path-based `rename`/Trash. It is documented, not claimed closed.
- Unknown filesystem errors are normalized to `change_undo_failed` / `Undo failed.` without raw codes or absolute paths.
- Conflict acknowledgement was clarified so Move chat to Trash cannot remain permanently blocked.

## Owner feedback

Direction approved on 2026-08-15. Milestones remain unaccepted pending the stated owner proof and acceptance gate.

## UI impact

The Changes surface shares the right-sidebar host with Context prompt and the terminal add-on. V3 owns change-review semantics; UI owns host chrome.

## Blockers and handoff

- Run the external-editor owner proof in a disposable workspace.
- Reassess the documented residual TOCTOU at acceptance.
- Scan terminal and UI logs before changing the shared right-sidebar union or host behavior.
