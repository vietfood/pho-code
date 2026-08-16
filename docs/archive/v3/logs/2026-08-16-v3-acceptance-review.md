# V3 acceptance review

Status: accepted and archived
Owner: version/v3
Plan: [`../implementation-plan.md`](../implementation-plan.md)
Related logs: [`2026-08-15-m0-m2-implementation.md`](./2026-08-15-m0-m2-implementation.md), [`2026-08-16-m3-review-handoff.md`](./2026-08-16-m3-review-handoff.md), [`2026-08-16-m3-hardening.md`](./2026-08-16-m3-hardening.md), [`2026-08-16-m3-ledger-fail-closed.md`](./2026-08-16-m3-ledger-fail-closed.md)

## Decision

The owner accepted Pho Code V3 — Change Control and Recovery on 2026-08-16. Milestones 0–3 are closed. The complete product, plan, execution logs, and this immutable review move together to `docs/archive/v3/`.

The owner accepted the automated Electron disposable-workspace overwrite journey as the conflict proof: it writes newer owner-equivalent bytes after the agent result and proves Undo refuses without changing them. A manual TextEdit/VS Code repetition is optional personal confirmation, not an acceptance blocker.

## Accepted boundary

- Pi `write` and `edit` remain live immediately and are captured by `{workspaceId, sessionId, runId, toolCallId}`.
- The bounded Changes workbench provides unified diff, syntax highlighting, search, whitespace visibility, context control, Approve, per-file Undo preview, conflict, and unavailable diagnostics.
- Approve changes ledger state only. It does not write files, stage Git, or commit.
- Modified-file Undo restores captured bytes and POSIX mode bits only after fresh path, identity, type, revision, and hash checks.
- Created-file Undo uses operating-system Trash only; no permanent-deletion fallback exists.
- Unreadable ledger state leaves chat usable but blocks review mutation and chat removal. The Changes surface can open its synthetic unreadable diagnostic.
- Capture overflow, unsupported files, corrupt records, and bounded diff limitations degrade explicitly rather than implying complete recovery.

Undo all, shell/MCP mutation recovery, filesystem watching, a manual editor, Git automation, and public-distribution hardening remain outside V3.

## Acceptance evidence

The Milestone 3 hardening record reports:

- `bun run typecheck` — pass;
- `bun run lint` — pass with four pre-existing hook-dependency warnings;
- focused protocol/application/UI/runtime tests — pass;
- Pi `0.84.1` capture integration — pass;
- `bun test` — 555 pass;
- `bun run test:desktop` — 19 pass;
- `bun run build` and `bun run package:mac` — pass;
- `bun run test:packaged` — 4 pass, including real macOS Trash.

The ledger fail-closed follow-up reports `bun test` at 559 pass plus focused, typecheck, and lint passes. The acceptance integrator additionally fixed and ran `bun test packages/runtime/test/change-ledger.test.ts`: 34 pass, including opening the synthetic unreadable-ledger review summary.

Independent defect-first reviews found no remaining P0/P1 after the ledger follow-up. The owner accepts the documented residual risks below.

## Accepted residual limits

- A narrow TOCTOU remains between the final identity check and path-based `rename` or Trash.
- Parent-directory `fsync` is best-effort after a successful rename.
- POSIX mode bits are restored; ownership, extended attributes, resource forks, and inode identity are not.
- Unparseable unattributed ledger files conservatively block removal for every chat until repaired.
- Over-long in-workspace paths use a redacted untracked identity; untracked identities use a bounded digest.
- Syntax highlighting is per-line and skipped for lines above the source-owned character limit.
- Ledger content is app-owned recovery data and is not encrypted at rest in personal V3.

## Architecture promotion

V3 protocol commands/events, runtime ledger and recovery ownership, Pi capture extension, app-data layout, removal interlock, and Changes right-sidebar semantics are accepted architecture. Current architecture and current-state documents were updated in the same closure change.

## Handoff

Future work must not reopen this archive in place. New behavior belongs in a promoted numbered version, an independent add-on, or a dated UI record. V3 recovery guarantees must remain explicit when later work adds broader mutation observation, batch Undo, retention cleanup, process isolation, or public distribution.
