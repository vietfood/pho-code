# V3 Milestone 3 review and implementation handoff

Status: ready for implementation  
Owner: version/v3  
Plan: [`../implementation-plan.md`](../implementation-plan.md) — Milestone 3  
Related logs: [`2026-08-15-m0-m2-implementation.md`](./2026-08-15-m0-m2-implementation.md), [`../../../ui/logs/2026-08-15-change-v3-right-sidebar.md`](../../../ui/logs/2026-08-15-change-v3-right-sidebar.md)

## Intent

Review the implemented Milestones 0–2 change rather than assuming its recorded tests make it acceptance-ready, then give the next implementer a bounded safety, correctness, performance, UX, and verification slice.

Review target: the V3 implementation from the parent of `1919815` through `c0b9706`, plus the current V3 product/plan and current source after the documentation reorganization.

## Findings

### P1 — Persist a safe outside-workspace capture result

`packages/runtime/src/change-path.ts` returns the original requested path as `relativePath` for an outside-workspace target. Absolute paths and `../` paths then fail `packages/runtime/src/change-ledger-store.ts` validation, so `begin()` cannot save the intended `outside-workspace` unavailable record. The fallback `recordCaptureFailure()` can repeat the same invalid path. An allowed or attempted Pi call can therefore disappear from review instead of degrading honestly.

Grok should separate a safe persisted/display identity from the raw privileged tool argument. Protocol data must not expose the absolute target. Add direct tests for absolute outside paths, traversal, symlink-parent escape, and failed persistence.

### P1 — Bound diff computation before the synchronous diff engine

`packages/runtime/src/change-diff.ts` calls Pi's synchronous `generateUnifiedPatch` on complete captured text before applying output paging limits. The 2 MiB byte cap does not bound line count or worst-case diff complexity. A pathological but allowed tracked file can monopolize Electron main and stall chat/UI.

Grok should add source-owned input-complexity limits before invoking the diff engine and return an honest typed limitation when the limit is exceeded. Output truncation alone is not the fix.

### P2 — Do not drop the remainder of a long changed line

When the first diff line cannot fit, `buildUnifiedDiffPage()` slices its text and advances `nextHunkLine` to the following line. Loading the next page therefore omits the remainder while presenting ordinary pagination. This breaks exact review for long minified/generated lines.

Grok should add a character offset to the diff cursor or return an explicit line-truncation state. Tests must concatenate all pages and prove equality with the bounded serialized diff.

### P2 — Treat ledger manifests and blobs as bounded untrusted persisted data

`packages/runtime/src/change-ledger-store.ts` reads and parses a manifest without a file-size bound. Its decoder does not cap arrays or strings, validate hashes/timestamps/aggregate sizes, reject duplicate identities, or enforce cross-field state invariants. `getBlob()` validates the blob filename but does not verify that the loaded bytes still hash to that id, so a tampered/corrupt blob can be displayed under a false before/after identity. Restore later checks the before hash, but review exactness is already lost.

Grok should implement bounded reads and strict schema/state validation, verify content-addressed bytes on every trust path, and normalize corruption without blocking ordinary chat.

### P2 — Validate complete IPC payloads before runtime delegation

`packages/application/src/bootstrap.ts` accepts any array as `relativePaths`; `packages/runtime/src/change-review.ts` then calls `.trim()` on every element. A malformed renderer payload can produce a generic `TypeError`, and large arrays, scope strings, cursors, and tokens do not have complete source-owned limits. Invalid cursors currently restart from page zero rather than fail.

Grok should add protocol/application validators for every command, bounded unique path arrays, strict cursor grammars, and normalized `invalid_command` errors. Runtime validation remains defense in depth.

### P2 — Disclose capture-cap overflow instead of silently omitting it

At `MAX_CHANGE_PATHS_PER_RUN`, `packages/runtime/src/change-capture.ts` returns `null` for a new path. Settlement also finds no file and returns without a review record or run-level diagnostic. The UI can therefore imply that its tracked set is complete even though later Pi write/edit calls were dropped.

Grok should persist a bounded run-level overflow diagnostic or reserved unavailable summary without exceeding the path cap. The UI must state that additional recovery was not captured.

### P2 — Reconcile implemented UI with the product contract

The current unified diff has line numbers and add/remove tinting, but the V3 product promises syntax highlighting, search, whitespace visibility, and bounded context expansion. The Milestones 0–2 log explicitly defers syntax highlighting, and the sheet has no search or whitespace controls. The old Milestone 1 sequence also still named before/agent/current tabs even though the approved product now says unified-diff only.

Grok should implement the promised unified-diff capabilities without adding an editor, or stop for an owner-approved product amendment. The plan now removes the stale tab requirement while retaining the bounded file-view bridge for diagnostics.

### P2 — Define atomic-restore metadata and crash durability

`packages/runtime/src/change-recovery.ts` restores exact bytes through a sibling replacement file, but the accepted behavior for mode bits, ownership, extended attributes, and containing-directory durability is not stated or tested. Opening the temporary file with the prior mode is still subject to process umask, and rename changes inode/metadata.

Grok should define the personal-V3 metadata contract, preserve required mode bits, and add the narrow file/directory sync behavior required by the accepted crash guarantee. Do not overclaim preservation that ordinary replacement does not provide.

## Positive evidence

- Preview tokens are single-use, time-limited, scope-bound, revision-bound, and kept out of renderer authority.
- Apply holds the review-scope lock through filesystem action and manifest finalization.
- Modified-file recovery checks current bytes and filesystem identity through an open descriptor, then rechecks the directory entry immediately before rename.
- Created-file recovery uses the injected OS Trash service and has no permanent-deletion fallback.
- Conflict acknowledgement does not rewrite the workspace and allows chat removal to become unblocked.
- Errors crossing the review boundary are normalized; the existing regression test covers raw filesystem-path/code redaction.
- The renderer routes review state by composite workspace/session/run identity and guards stale asynchronous loads by generation.

These strengths should be preserved while fixing the findings.

## Contracts and likely files

- Protocol validation and limitations: `packages/protocol/src/change-review.ts`, protocol tests.
- Application validation: `packages/application/src/bootstrap.ts`, application tests.
- Capture/path/storage: `packages/runtime/src/change-{capture,path,ledger-store,record}.ts`.
- Diff bounds/paging: `packages/runtime/src/change-diff.ts`.
- Recovery metadata/durability: `packages/runtime/src/change-{identity,recovery,review}.ts`.
- Workbench completeness: `packages/ui/src/change-review-sheet.tsx`, renderer hook, UI and Electron tests.
- Pi characterization and packaged proof: runtime integration, `apps/desktop/tests/change-review.spec.ts`, and packaged tests.

Keep imports at module top and preserve exhaustive TypeScript switches. Do not modify reference submodules.

## Verification

Review performed from source and the complete V3 change scope. No code, Electron, or packaged checks were rerun for this documentation-only review. Existing PASS statements remain historical evidence only.

Milestone 3 must create a new dated acceptance log containing fresh commands and results. Follow [the test skill](../../../../.agents/skills/test-pho-code/SKILL.md) and the plan's proportional verification.

## Owner feedback

The owner requested a Milestone 3 plan suitable for a Grok implementation handoff and asked that code feedback cover multiple factors, including safety and correctness.

## UI impact

The Changes surface remains secondary to conversation and unified-diff only. Milestone 3 may complete search, whitespace, context, highlighting, focus, and bounded-error behavior inside that surface, but must not add editor authority or change the shared right-sidebar host without updating the related UI and terminal logs.

## Blockers and handoff

No product choice blocks the first four implementation steps. A choice is required only if Grok proposes narrowing the promised workbench capabilities or accepting a metadata/durability limitation.

Implement in the order listed in Milestone 3. Run focused tests after each boundary, then the full root, Electron, packaged, owner, and independent-review gates. Do not mark Milestones 0–2 accepted merely because Milestone 3 fixes compile or unit failures.
