# Git change tracking implementation plan

## Status and use

Status: **In implementation; planning complete; implementation not started.**

This is the read-mostly implementation contract for the promoted
[git change tracking product](./product.md). Dated work, measurements,
failures, corrections, owner feedback, and verification belong in
[`logs/`](./logs/README.md).

The implementation order is:

1. read-only git working-tree evidence in the Changes surface;
2. shadow-repository lifecycle and backend-neutral run checkpoints, dark;
3. observed-change entries and shadow-served diffs in the review model;
4. recovery/retention cutover, v1-ledger disposition, hardening, acceptance.

Milestones are delivery order, not permission to weaken the product contract.
Partial builds must state exactly which backends, mutation classes, and
workspace kinds they verified.

## Global acceptance rules

Every slice follows these rules:

- Keep `renderer -> protocol <- shell adapter -> application -> runtime -> Pi
  SDK` dependency direction. Git execution lives in the runtime behind an
  explicit process interface; the renderer and application layers never spawn
  or reference git.
- Never write to the owner's repository. All git invocations address the
  shadow repo via explicit `GIT_DIR`/`GIT_WORK_TREE` (or
  `git --git-dir … --work-tree …`) and a source-owned environment
  (`GIT_CONFIG_NOSYSTEM`, no hooks, no pager, no credential helpers).
- Preserve the accepted V3 gates: live workspace truth, exact attribution
  before recovery, no overwrite of newer work, Approve is not Git, Pi remains
  transcript authority, selection is not ownership, removal stays recoverable,
  bounded data, and no renderer filesystem authority.
- Keep tool-call capture for Pi `write`/`edit` authoritative for attribution;
  shadow data augments, never re-attributes.
- Fail honest, never silent: git missing, shadow init failure, checkpoint
  timeout, budget exhaustion, and corrupt refs each produce an explicit
  product state while V3 tool-call review continues.
- All git output crossing into product state is parsed from stable
  machine-readable formats (`--porcelain=v2`, `-z`, `--format` with unique
  delimiters), never from human output.
- Bound everything: status/diff output size, file count, checkpoint
  frequency, repo budget, queue wait, and process timeouts are source-owned
  constants.
- Record exact verification per milestone. Unit coverage is insufficient for
  runtime, IPC, renderer, or packaged claims; the desktop lane is required for
  UI changes.

## Current baseline and compatibility constraints

### Accepted behavior this feature must not regress

- V3 change capture: `change-capture.ts` hooks Pi `tool_call`/`tool_result`
  for `write`/`edit`, snapshots before/after blobs into a content-addressed
  ledger under app data (`change-ledger/v1`), keyed by
  `{workspaceId, sessionId, runId}`, with per-scope async locking and
  fail-closed corrupt-manifest behavior.
- V3 review runtime: `change-review.ts` serves paged unified diffs from
  before/after blobs, re-probes current-file hashes on read, and runs Undo
  through hash/identity re-checks, atomic restore, and OS Trash.
- The Changes tile follows the active chat
  ([`../../ui/logs/2026-09-01-bug-changes-tile-session-switch.md`](../../ui/logs/2026-09-01-bug-changes-tile-session-switch.md)).
- Codex and Claude ACP sessions own their tools; their file mutations never
  enter the V3 ledger today.
- macOS GUI `PATH` portability is a known open concern (recorded for V5); git
  discovery must not assume a login-shell PATH.

### Git facts to characterize in M0/M1, not assume

- `git --version` availability and latency from the packaged app's minimal
  PATH; `/usr/bin/git` on macOS without Command Line Tools can trigger a CLT
  install prompt — probe via `xcode-select -p` / the CLT directory before
  executing the shim.
- `git add -A && git commit` cost and index behavior on representative
  workspaces (small repo, large repo with `.gitignore`, large tree without
  one); nested-repository handling under `GIT_WORK_TREE`; behavior with
  symlinks, submodules, and LFS pointer files.
- Whether checkpoint commits can run with an empty author identity via
  per-command `-c user.name/-c user.email` without touching global config
  (expected: yes).

## Architecture, protocol, and file ownership

- `packages/runtime/src/git-exec.ts` (new): bounded async git process
  interface — candidate resolution, availability probe, per-invocation env,
  timeouts, output caps. The only module that spawns git.
- `packages/runtime/src/git-evidence.ts` (new, M0): read-only working-tree
  evidence against the *user's* repo (`status --porcelain=v2`,
  `diff --stat HEAD`), returning bounded protocol types.
- `packages/runtime/src/shadow-git.ts` (new, M1): shadow repo lifecycle —
  init, exclude policy, per-workspace serialized queue, base/tip checkpoint
  commits, ref pruning, gc, budget accounting under app data.
- `packages/runtime/src/change-feature.ts` / run lifecycle: emit run
  admission/settlement hooks for every backend (Pi, Codex, ACP) into the
  shadow queue; Pi tool-call capture stays as-is.
- `packages/runtime/src/change-review.ts` (M2): merge observed entries into
  review sets; serve diffs from shadow blobs through the existing paged
  contract; conflict gates unchanged.
- `packages/protocol/src/change-review.ts`: bounded additions —
  `GitWorkingTreeEvidence` (M0), an `observed` entry marker on
  `FileChangeSummary` plus the honest copy constants (M2). No git refs,
  absolute paths, or object ids cross the bridge.
- `packages/ui/src/change-review-window.tsx`: the M0 evidence row and M2
  observed-entry presentation; chrome ownership stays with the UI track.
- `apps/desktop/electron/ipc.ts` + preload: one narrow method per new
  command, following the existing change-review channel pattern.

## Milestones

### Milestone 0 — read-only git evidence in Changes

Sequence: git-exec availability probe → evidence service → protocol types →
IPC → Changes evidence row.

Acceptance criteria:

- a git workspace shows branch + changed-file count vs `HEAD`, read-only;
- a non-git workspace and a git failure each show their honest one-line state;
- no git process outlives its timeout; no user-repo mutation occurs (verified
  by pre/post `git status` and ref listing in a temp repo);
- macOS git discovery never triggers a CLT install prompt (probe order:
  PATH candidates, `/usr/bin/git` only after CLT presence is established).

Verification: unit (parsers, degradation), integration (real git in temp
dirs, git and non-git), desktop (Changes surface in both workspace kinds).

### Milestone 1 — shadow repo lifecycle and run checkpoints (dark)

Sequence: shadow init + exclude policy → per-workspace queue → base commit at
run admission (bounded wait, honest degradation on timeout) → tip commit at
settlement → restart reconciliation of interrupted runs → size/age pruning
with gc → diagnostics surfacing.

Acceptance criteria:

- Pi, Codex, and ACP runs each produce base/tip refs; bash and MCP mutations
  during a Pi run appear in the base…tip diff;
- nested repos are excluded and never modified; `.gitignore` is respected;
- overlapping runs in one workspace serialize correctly and label shared
  timeline contents honestly;
- the run-admission wait is bounded and measured; cost measurements on the
  representative workspace matrix are logged;
- exceeding the repo budget marks new checkpoints unavailable and keeps
  existing history;
- **decision gate:** measurements support shadow storage as the diff/undo
  substrate, or the plan falls back to "shadow = observation only."

Verification: unit (queue, exclude policy, pruning), integration (real git,
  all three backends where automatable, interruption/restart), desktop
  (diagnostics only; no UI change).

### Milestone 2 — observed entries and shadow-served diffs

Sequence: merge observed paths into review sets → serve per-file diffs from
shadow blobs through the existing paged IPC → current-file conflict probing
unchanged → UI observed-entry presentation and copy.

Acceptance criteria:

- a bash-created file and a Codex/ACP edit appear as observed entries with
  correct text-safe diffs and no Undo control;
- attributed `write`/`edit` entries render identical diffs to V3 for the
  characterization corpus;
- review-set paging, search, and follow-selection behavior are unchanged.

Verification: unit (merge/label logic, protocol validators), integration
(diff parity corpus), desktop (Changes surface with mixed entries).

### Milestone 3 — recovery cutover, retention, v1-ledger disposition

Sequence: Undo restores baseline/first-pre-image blobs from the shadow store
through the existing atomic adapters → dual-write removed → v1 ledger becomes
read-compat import or documented cold residue → retention/gc finalized →
disclosure copy updated.

Acceptance criteria:

- every V3 acceptance scenario (per the archived v3 plan) passes against the
  shadow store, including conflict refusal and Trash recovery of created
  files;
- corrupt or missing shadow refs fail closed exactly like a corrupt v1
  manifest;
- the 250 MiB budget and retention behavior are demonstrated.

Verification: unit, integration, desktop (full `change-review.spec.ts`),
packaged (git discovery and shadow init in the built app, isolated data).

## Pins, packaging, CSP, attribution

- No new runtime dependency is planned; git is an external executable. If a
  bundled git or a library (e.g. isomorphic-git) is ever proposed, it requires
  an explicit scope change with pin, license, and packaging review.
- Packaged verification must cover git discovery under the packaged app's
  environment and the honest unavailable state.
- CSP/navigation/permission guards are untouched; the feature adds no network
  surface.
- Research used upstream documentation and design descriptions only. No
  upstream code is copied; any future material adaptation records source,
  revision, license, destination, and extent in
  [`references-and-attribution.md`](../../references-and-attribution.md).

## Exit checks and acceptance gate

Per milestone, the smallest relevant checks plus the milestone lane; at
acceptance: `bun run typecheck`, `bun run lint`, `bun run test`,
`bun run test:desktop`, `bun run build`, and `bun run package:mac &&
bun run test:packaged`, with results classified per the verification policy
and recorded in `logs/`. Acceptance requires the product doc's final outcomes
and an immutable review; one integrator then updates current state and
architecture.
