# V3 Milestone 3 hardening implementation

Status: ready for review; not owner-accepted  
Owner: version/v3  
Plan: [`../implementation-plan.md`](../implementation-plan.md) — Milestone 3  
Related logs: [`2026-08-16-m3-review-handoff.md`](./2026-08-16-m3-review-handoff.md), [`2026-08-15-m0-m2-implementation.md`](./2026-08-15-m0-m2-implementation.md), [`../../../ui/logs/2026-08-15-change-v3-right-sidebar.md`](../../../ui/logs/2026-08-15-change-v3-right-sidebar.md), [`../../../ui/logs/2026-08-16-change-inline-code-shiki-palette.md`](../../../ui/logs/2026-08-16-change-inline-code-shiki-palette.md)

## Intent

Close the Milestone 3 safety, boundedness, workbench-contract, and recovery-durability findings from the independent Milestones 0–2 review, then run the complete V3 exit checks as fresh evidence. This slice does not add Undo all, shell/MCP mutation tracking, a second editor, or a generic settings engine.

## Contracts and files

- Persistable capture identities and path-cap overflow: `packages/runtime/src/change-path.ts`, `change-capture.ts`, `test-model.ts`.
- Ledger/blob trust: `packages/runtime/src/change-ledger-store.ts`, `change-review.ts` `verifiedBlob()`.
- IPC validators: `packages/protocol/src/change-review.ts`, `packages/application/src/bootstrap.ts`.
- Diff complexity and lossless paging: `packages/runtime/src/change-diff.ts`, `apps/desktop/src/use-change-review.ts`.
- Workbench: `packages/ui/src/change-review-sheet.tsx`, `shiki-highlight.ts`, `theme.css`.
- Recovery metadata and durability: `packages/runtime/src/change-recovery.ts`, `change-fsync.ts`.
- Product copy: POSIX mode bits, residual rename/Trash TOCTOU, capture-cap diagnostic.

## Changes and decisions

1. Outside-workspace, traversal, symlink-escape, and malformed `path` args persist under `.pho-code-untracked/<kind>-<16 hex>` instead of a raw tool argument. Protocol snapshots never include the absolute target.
2. Hitting `MAX_CHANGE_PATHS_PER_RUN` (200) sets run-level `captureCapped` and stops adding files. The Changes sheet shows `CHANGE_REVIEW_COPY.captureCapped`.
3. Manifest load is byte-bounded before JSON parse. Decoded records cap files/operations/strings, require 64-hex hashes and blob ids, reject duplicate paths and `toolCallId`s, and reject pending+limitation or pending without required hashes. `getBlob()` and `verifiedBlob()` refuse bytes that do not hash to the id. Corrupt `load()` throws `change_review_corrupt`; `listForSession` skips corrupt files so chat is not blocked.
4. Application validators require persistable unique `relativePaths`, strict `line:` / `hunk:` cursors, bounded tokens, and `contextLines`. Malformed or out-of-range cursors fail `invalid_command` instead of restarting at page zero.
5. Diff generation checks input line count before Pi `generateUnifiedPatch` and generated patch size after. Oversized changed lines page with a `:char:` offset; the renderer concatenates continuations of the same logical line.
6. The unified-diff workbench adds in-sheet search, whitespace glyphs, context 0/3/8, capture-cap and undo-metadata copy, arrow-key file list movement, and Shiki `codeToTokens` rendered as React text/`span` (no `dangerouslySetInnerHTML` in the diff).
7. Restore `chmod`s POSIX mode bits after creating the sibling temp (`umask` cannot drop them), `fsync`s the temp, and `fsync`s the parent directory after `rename`. Ownership, xattrs, and inode identity are not preserved. Directory `fsync` failures are swallowed as best-effort after a successful rename. Residual path-based rename/Trash TOCTOU remains documented.

## Verification

Environment: macOS 26.5.2, Darwin 25.5.0 arm64. Checks below ran in this session.

| Command | Result | Class |
| --- | --- | --- |
| `bun run typecheck` | pass | unit |
| `bun run lint` | pass; 4 pre-existing `react-hooks/exhaustive-deps` warnings in `App.tsx` and `context-prompt-dialog.tsx` | unit |
| `bun test packages/protocol/test/change-review.test.ts packages/application/test/bootstrap.test.ts packages/ui/test/change-review-sheet.test.ts packages/ui/test/change-review-diff.test.ts packages/runtime/test/change-ledger.test.ts` | 56 pass | unit |
| `bun test packages/runtime/test/change-capture-runtime.test.ts` | 3 pass, including outside-workspace + 201-write cap (~29s) without leaking `/tmp/pho-code-outside-note.txt` | integration (Pi `0.84.1`) |
| `bun test` | 555 pass, 0 fail (full filesystem; a sandboxed first run failed 8 Pi/skill tests with `EPERM` mkdir) | unit + integration |
| `bun run test:desktop` | 19 passed (2.0m), including search/whitespace/context controls and owner-overwrite conflict | desktop |
| `bun run build` | pass | desktop build |
| `bun run package:mac` | pass (unsigned `Pho Code.app`) | packaged |
| `bun run test:packaged` | 4 passed after the test-harness fixes below, including created-file Undo through real macOS Trash without a Pi CLI | packaged |

External-editor conflict proof: the Electron journey `restores an unchanged edit, refuses a conflicting owner overwrite` writes `owner edit\n` over the agent result in an owned disposable workspace, then Undo refuses and Approve records conflict. That is disposable-workspace evidence, not a human TextEdit session.

Independent defect-first review of this slice found no remaining P0/P1 from [`2026-08-16-m3-review-handoff.md`](./2026-08-16-m3-review-handoff.md). Residual risks kept explicit:

- path-based `rename`/Trash TOCTOU after the last identity check;
- parent-directory `fsync` is best-effort;
- over-long in-workspace paths that fail `isPersistableRelativePath` are stored with the `outside-workspace` untracked identity rather than a distinct over-long limitation;
- untracked identities use a 16-hex digest;
- syntax highlighting is per-line and skipped above 512 characters.

## Mistakes and corrections

- First `bun test` in the sandbox could not mkdir under `/tmp/.../.cursor` or the default `~/.pi/agent/sessions` fallback; rerun outside the sandbox.
- Typecheck failed on an unused `ShikiThemeName` import and on `classifyBytes(beforeBytes)` when `beforeBytes` was `Uint8Array | undefined`. Lint failed `no-control-regex` on `[\u0000-\u001f\u007f]`; replaced with `hasDisallowedControlChars`.
- Packaged permission/Trash journey left the About dialog open, so Send was intercepted by `about-backdrop`. Added `about-close`, matching `developer.spec.ts` / `permission.spec.ts`.
- Packaged OAuth used a non-unique `model-picker-option` locator (206 options when a real catalog is visible) and asserted `no-configured-providers` after logout, which failed when a Cursor fallback account remained. Aligned with `oauth.spec.ts`: unique option name and “test provider is no longer Connected.” Electron launches now drop inherited `PHO_CODE_AGENT_DIR` unless a test sets it.

## Owner feedback

None in this implementation session. Milestones 0–3 remain unaccepted until the owner reviews this evidence and, if required, runs a human external-editor conflict in a disposable workspace.

## UI impact

Search, whitespace, context, highlighting, capture-cap banner, and undo-metadata copy landed inside the existing Changes surface. The shared right-sidebar host (pill, resize, surface union) did not change. Terminal add-on logs were scanned; no reciprocal host-contract update was required.

## Blockers and handoff

- Do not mark Milestones 0–3 or v3 accepted from this log alone.
- Architecture pages still describe V3 recovery as implemented-but-unaccepted; do not promote them until the owner acceptance gate.
- Undo all, shell/MCP mutation tracking, and a second editor remain out of scope.
- Optional owner proof: conflict a tracked file from TextEdit/VS Code in a disposable workspace and confirm Undo refuses.
