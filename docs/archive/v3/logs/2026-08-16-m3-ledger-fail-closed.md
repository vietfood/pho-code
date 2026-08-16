# V3 ledger fail-closed follow-up

Status: ready for review; not owner-accepted  
Owner: version/v3  
Plan: [`../implementation-plan.md`](../implementation-plan.md) — Milestone 3  
Related logs: [`2026-08-16-m3-hardening.md`](./2026-08-16-m3-hardening.md), [`2026-08-16-m3-review-handoff.md`](./2026-08-16-m3-review-handoff.md), [`../../../ui/logs/2026-08-15-change-v3-right-sidebar.md`](../../../ui/logs/2026-08-15-change-v3-right-sidebar.md)

## Intent

Close the two remaining ledger findings from the 2026-08-16 Codex review, record the owner-proof decision, and leave V3 unarchived.

## Contracts and files

- Fail-closed listing: `packages/runtime/src/change-ledger-store.ts`, `change-capture.ts`, `pi-runtime.ts`.
- Capture-cap for operations and encoded manifest bytes: `exceedsPersistenceBudget()`, `MAX_CHANGE_OPERATIONS_PER_RUN`.
- Protocol/UI: `ledgerUnreadable`, `CHANGE_REVIEW_COPY.ledgerUnreadable`, Changes sheet banner.

## Changes and decisions

1. `listForSession` no longer treats a corrupt manifest as missing. Invalid JSON, oversized files, and schema failures are `unreadable`. Parseable-but-invalid JSON is attributed by bounded peeked `workspaceId`/`sessionId`; unreadable review summaries use the reserved synthetic run id because corrupt files cannot safely be addressed as a real run. Unparseable files are unattributed and fail closed for every session's removal.
2. `hasBlockingReview` is true when the listing is unreadable. `hasUnreadableReview` makes chat removal throw `change_review_corrupt` with the ledger-unreadable copy. Ordinary chat still opens.
3. Session snapshots include a synthetic `CHANGE_UNREADABLE_RUN_ID` review set so the Changes sheet can open the diagnostic instead of showing an empty pending list.
4. `begin` / `recordCaptureFailure` clone the manifest, apply the new file/operation, and if the next state would exceed 200 files, 1,600 operations, or 1 MiB encoded JSON, restore the previous state and set `captureCapped` instead of throwing on persist.

Owner-proof decision: the Electron disposable-workspace overwrite in `change-review.spec.ts` is sufficient evidence that Undo refuses when current bytes differ from the recorded agent result. A human TextEdit/VS Code session remains optional personal confirmation. It is not a remaining P1 for these ledger fixes, and it is not treated as owner acceptance of V3.

## Verification

Environment: macOS 26.5.2, Darwin 25.5.0 arm64.

| Command | Result | Class |
| --- | --- | --- |
| `bun test packages/protocol/test/change-review.test.ts packages/runtime/test/change-ledger.test.ts packages/ui/test/change-review-sheet.test.ts` | 49 pass | unit |
| `bun run typecheck` | pass | unit |
| `bun run lint` | pass; 4 pre-existing hook-deps warnings | unit |
| `bun test` | 559 pass, 0 fail | unit + integration |

Desktop and packaged lanes were not rerun for this ledger-only follow-up.

Independent review of this slice: no remaining P0/P1 from the Codex note. Residual: unattributed unreadable files block removal of every chat; directory `fsync` remains best-effort; rename/Trash TOCTOU remains documented.

## Mistakes and corrections

The Milestone 3 hardening log recorded `listForSession` skipping corrupt files so chat is not blocked. That skipped pending review and unblocked chat removal. Chat stays available; removal and review now fail closed.

## Owner feedback

Codex: not ready to accept/archive V3. Fix the two ledger issues, decide the owner-proof gate, then review. This log does not accept or archive V3.

## UI impact

An unreadable-ledger banner can appear in the existing Changes surface. The right-sidebar host did not change.

## Blockers and handoff

- V3 remains implemented in source and unaccepted.
- Do not write the acceptance review, promote architecture, or move V3 to `docs/archive/v3/` until the owner gate.
- Optional: owner TextEdit conflict in a disposable workspace; desktop/packaged rerun before acceptance.
