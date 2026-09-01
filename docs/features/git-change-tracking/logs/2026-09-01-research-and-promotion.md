# 2026-09-01 — research and promotion

## Scope

Research how peer coding agents track file changes with git, evaluate the
options against Pho Code's accepted V3 change-review contract, and promote
the selected direction as a standalone add-on. Companion defect work (the
Changes tile going blank on session switch) is logged separately in
[`../../../ui/logs/2026-09-01-bug-changes-tile-session-switch.md`](../../../ui/logs/2026-09-01-bug-changes-tile-session-switch.md).

## Trigger

Owner report: the edit/write review feels weak — diffs stop rendering after
switching sessions until the tile is closed and reopened — and a request to
research hardening plus possible git integration for better diff tracking.

## Current state findings

- V3 capture (`packages/runtime/src/change-capture.ts`) hooks Pi
  `tool_call`/`tool_result` for `write`/`edit` only, storing before/after
  blobs in a content-addressed ledger under app data (`change-ledger/v1`).
  It is exact but blind to agent `bash`, MCP tools, formatters, Codex/ACP
  sessions, and owner/editor writes.
- V3 review (`packages/runtime/src/change-review.ts`) renders diffs from
  ledger blobs, not from the live tree, and re-probes current-file hashes on
  every read — correct but redundant with what git already computes.
- The session-switch symptom was a UI defect (an effect force-closed review
  state on snapshot change), not a capture defect; fixed and logged under
  `docs/ui/logs`.
- Codex and Claude ACP sessions own their tools; their mutations never enter
  the ledger. Any git work that only wraps Pi tools would not close this gap.

## Peer research

| Tool | Approach | Notes for Pho Code |
| --- | --- | --- |
| Claude Code | Snapshot ledger: per-tool-call before/after copies in app data; rewind restores file state | Same model as our V3; same blind spots |
| Cline | Shadow git repo per workspace in extension storage; `core.worktree` points at the user workspace; checkpoint commit per task step; `.gitignore`-aware excludes; temporarily renames nested `.git` dirs | Whole-tree observation; nested-repo rename rejected as too invasive |
| Roo Code | Cline-derived shadow git; excludes via `info/exclude`; checkpoint per task; restore via `git reset --hard` / clean | Hard-reset restore can overwrite newer work — rejected for Undo |
| Aider | Auto-commits AI edits directly into the user's real repository | Violates V3 "Approve is not Git" and the read-only-repo decision |

Sources: upstream READMEs/docs and public design write-ups, read 2026-09-01;
no code copied. Key properties of the shadow model: initializes in non-git
workspaces, baseline-captures dirty trees, tracks untracked files, dedupes
content, and is backend-agnostic because it observes the filesystem rather
than intercepting tools.

## Owner decisions (2026-09-01)

1. Scope: fix the session-switch bug, add read-only git evidence to Changes,
   and promote the shadow-git checkpoint ledger as a feature (A + B + C).
2. Ledger scope: backend-neutral — capture whole-workspace state per run so
   Codex/ACP/bash mutations are tracked too.
3. Process: log the bug under `docs/ui/logs`; draft this feature promotion
   under `docs/features`.

## Consequences recorded at promotion

- **V3 invariant 8 evolves.** "Git is never the sole recovery authority" was
  motivated by non-git/dirty/untracked workspaces. The shadow repo dissolves
  those cases, so the invariant becomes: the *owner's* repository is never
  the recovery authority and is never mutated; the app-owned shadow store may
  serve as the blob/diff substrate behind the unchanged Undo gates. This is
  an explicit, owner-approved scope change to an accepted contract.
- **Restore stays non-git.** Undo keeps the V3 hash/identity gates and
  atomic-restore adapters; shadow blobs supply bytes. `git reset --hard`
  against the workspace (Roo/Cline) is rejected.
- **Nested repos:** bounded scan + `info/exclude`; never rename another
  repo's `.git`.
- **Git dependency:** system git from a source-owned candidate list; honest
  degradation to V3-only capture when absent; macOS CLT shim must be probed
  without triggering an install prompt; no bundled git in early milestones.
- **Budget:** the 250 MiB ledger budget maps onto the shadow repo; exceeding
  it marks new checkpoints unavailable rather than deleting history.

## Open questions for implementation (owned by the plan's milestones)

- Checkpoint commit cost on representative workspace matrices (M1
  measurements gate the storage-cutover decision).
- Whether run-admission base commits need a wait budget under heavy load.
- Exact `info/exclude` seed list beyond `.git` (node_modules, build output,
  lockfiles-by-policy) — source-owned constants decided in M1.

## Verification this slice

- Documentation-only slice. No code changed under this feature directory.
- Companion defect fix verified separately: typecheck passed; lint failure
  isolated to pre-existing `consistent-type-imports` in
  `packages/pho-agent/packages/runtime/src/runtime.ts`; focused desktop spec
  `apps/desktop/tests/change-review.spec.ts` passed outside the sandbox
  (Electron GUI launch is sandbox-blocked); desktop build fixed via alias
  additions logged in
  [`../../../ui/logs/2026-09-01-fix-desktop-build-approval-aliases.md`](../../../ui/logs/2026-09-01-fix-desktop-build-approval-aliases.md).

## Handoff

- Milestone 0 (read-only git evidence row) is the first implementation slice.
- Cross-link from `docs/features/README.md` and `docs/current-state.md` is
  part of this promotion commit.
