# Product definition: git change tracking

## Status

**In implementation.** The owner promoted this standalone add-on on 2026-09-01
after the research recorded in
[`logs/2026-09-01-research-and-promotion.md`](./logs/2026-09-01-research-and-promotion.md).
This document defines planned behavior. No git-backed behavior exists in
source yet; accepted [V3](../../archive/v3/product.md) change review remains
the shipped truth.

This feature may proceed independently of blocked V5 and pending V4. It must
not absorb V4's signing/update/process-extraction contracts or V5's
intelligence milestones, and it must not weaken the accepted V3 recovery
contract while replacing its storage engine.

## Owner outcome

Today the Changes surface is exact but narrow: it sees only Pi `write`/`edit`
tool calls. Changes made by agent `bash`, MCP tools, formatters, Codex or
Claude ACP sessions, and the owner's own editor are invisible to it, and the
diff it renders is a before/agent snapshot pair rather than the working tree
the owner actually has.

After this feature, the owner can answer, for any run of any backend:

1. What exactly changed on disk during that run — attributed tool edits and
   everything else, honestly separated?
2. What does the working tree look like right now relative to the run's
   starting point and, when the workspace is a git repository, relative to
   `HEAD`?
3. What can still be safely undone, with the same conflict-safe guarantees as
   today?

The conversation stays primary. Changes remains a bounded read-only review
surface with Approve/Undo; this feature widens its observation and hardens its
storage, it does not turn it into a git client.

## Product thesis

Peer tools split into two camps (evidence in the research log):

- **Snapshot ledgers** (Claude Code checkpoints; Pho Code V3): per-tool-call
  before/after copies in app data. Exact attribution, but blind to anything
  outside the intercepted tools.
- **Shadow git repositories** (Cline, Roo Code): an app-owned git dir whose
  work tree is the user workspace; every checkpoint is a commit; diffs and
  restores use git plumbing. Sees the whole tree, dedupes content, and is
  backend-agnostic — at the price of a git dependency and exclude discipline.

Pho Code adopts the shadow git model **as the capture and storage substrate**
while keeping V3's product semantics: live apply, exact tool-call attribution
where it exists, conflict-safe per-file Undo, and no writes to the owner's
repository. V3 invariant 8 ("Git is never the sole recovery authority") was
motivated by workspaces that may be non-git, dirty, or full of untracked
files; a shadow repo dissolves all three, because it initializes anywhere,
baseline-captures pre-existing dirt, and tracks untracked files. The owner's
git repository, however, is never the authority and never touched.

## Selected product decisions

1. **The owner's repository is read-only to us.** No commit, stage, branch,
   checkout, reset, stash, worktree, config write, or hook installation in the
   user's repository. When the workspace is a git repo, Pho may read
   status/diff evidence from it; it never mutates it. V3's "Approve is not
   Git" stands.
2. **One app-owned shadow repo per workspace.** A bare git dir under Pho
   Code's application-data root (`change-git/v1/<workspace-key>/`) with
   `core.worktree` pointing at the canonical workspace. No remotes, no push,
   no user-visible refs. It is app data exactly like today's change ledger.
3. **Backend-neutral run checkpoints.** Every admitted run — Pi, Codex, or
   Claude ACP — gets a baseline commit at admission and a checkpoint commit at
   settlement in the workspace's shadow repo. Anything on disk between those
   commits is observed, including bash, MCP, formatter, external-backend, and
   owner/editor writes.
4. **Attribution stays exact where it exists.** The accepted tool-call capture
   for Pi `write`/`edit` continues to own per-file before/after attribution
   and the safe-Undo evidence. Shadow checkpoints add the *observed but
   unattributed* class around it (the class V3 already names but never
   populated). The UI never blurs the two.
5. **Undo semantics do not change.** Undo restores the recorded pre-image of
   one file after re-checking content hash and filesystem identity, through
   the existing atomic-restore and OS-Trash adapters. Pho never runs
   `git reset --hard` or `git checkout --` against the workspace — the shadow
   repo is a blob store and diff engine, not a restore mechanism. (Roo/Cline's
   hard-reset restore is explicitly rejected: it can overwrite newer work.)
6. **Overlapping runs are honest, not magical.** Two live runs in one
   workspace share one shadow timeline. A run's observed diff is
   baseline-at-admission…checkpoint-at-settlement and may include a concurrent
   run's or the owner's edits; those entries are labeled observed, not
   agent-attributed. Per-file tool-call attribution remains exact.
7. **System git, honestly degraded.** The feature uses the machine's `git`
   from a source-owned candidate list and PATH. If git is absent or unusable,
   git evidence and shadow checkpoints degrade to an explicit unavailable
   state and V3 tool-call capture keeps working alone. No bundled git binary
   in the first milestones; packaging revisits this at the acceptance gate.
   On macOS the `/usr/bin/git` CLT shim must be probed without triggering an
   install prompt.
8. **Bounds stay source-owned.** Exclude policy, checkpoint frequency,
   retention, and size budgets are constants, not Settings. The 250 MiB ledger
   budget maps onto the shadow repo; exceeding it marks new checkpoints
   unavailable instead of deleting history.
9. **Nested repositories are excluded, never manipulated.** A bounded scan
   finds nested git repos and excludes them via the shadow repo's
   `info/exclude`. Pho never renames or disables another repository's `.git`
   (Cline's temporary-rename approach is rejected as too invasive).
10. **Renderer authority does not grow.** The renderer still receives bounded
    relative paths, hashes, statuses, and paged diff/file views. No git refs,
    absolute paths, object ids as capabilities, or generic query channels
    cross the bridge.

## Change ownership model after cutover

V3's three classes remain, now fully populated:

| Class | Source of truth | Review | Automatic undo |
| --- | --- | --- | --- |
| Agent-attributed | Tool-call capture around Pi `write`/`edit` | Exact before/after diff | Available under the accepted hash/identity gates |
| Observed but unattributed | Shadow base…tip diff minus attributed paths | Shown with an "observed during run" label | Unavailable in the first release |
| External overlap | Current-file hash vs recorded after-image | Three-state/current comparison | Unavailable until reconciled |

## Trust, data, and lifecycle

- Shadow repositories live under the application-data root, separate from Pi
  JSONL, the user's repository, packaged resources, credentials, and the
  permission log. They are not encrypted at rest; the review toolbar's
  disclosure copy is updated to say so.
- Shadow refs are namespaced (`refs/pho/runs/<runId>/{base,tip}`) and pruned
  by source-owned count/age policy with `git gc` under the app-data budget.
  Retention cleanup removes only app-owned shadow refs/objects — never
  workspace files, Pi sessions, or the user's repository.
- A workspace's shadow repo is keyed by canonical-path identity, not by
  workspace title; moving a workspace creates a fresh shadow repo honestly
  rather than attaching stale history.
- Chat Archive/Trash behavior is unchanged: blocking pending review still
  gates removal; shadow refs for removed chats are pruned by the same
  recoverable lifecycle as today's ledger artifacts.
- The feature adds no network surface: no fetch, push, clone, or remote
  configuration. CSP and navigation guards are untouched.

## User-visible contract

- **M0 evidence row:** when the workspace is a git repository, the Changes
  surface shows a compact read-only working-tree summary (branch, ahead/
  behind if cheap, changed-file count vs `HEAD`) above the tracked list.
  Non-git workspaces and git failures show an honest one-line state, never a
  fabricated one.
- **M2 observed entries:** files changed during a run without tool-call
  attribution appear in the run's review set marked "Observed during this
  run — changed outside tracked write/edit tools," with a current-vs-baseline
  diff when text-safe. They have no Undo and no Approve-required semantics;
  they are evidence.
- Everything else about the Changes surface — docking, follow-selection,
  paging, search, Approve, Undo preview — is the accepted V3/UI behavior,
  including the session-switch fix recorded in
  [`../../ui/logs/2026-09-01-bug-changes-tile-session-switch.md`](../../ui/logs/2026-09-01-bug-changes-tile-session-switch.md).

## Relationship to existing work

- [V3](../../archive/v3/product.md) owns the accepted review/Undo semantics
  this feature preserves, and its invariant 8 evolves as recorded in decision
  2 — an explicit, owner-approved scope change logged at promotion.
- [Approval modes](../approval-modes/product.md) gates whether tools may
  execute; this feature observes effects after admission. Orthogonal by
  design.
- [Subagents](../subagents/product.md) attributes child `write`/`edit` through
  the same ledger; child runs in a shared workspace serialize through the same
  per-workspace shadow queue.
- [Agent-tool sandbox](../../archive/features/sandbox/product.md) wraps agent
  bash; shadow capture observes bash effects after the fact and changes no
  containment claim.
- [V5](../../version/v5/README.md) owns the backend-neutral host seam this
  feature consumes for Codex/ACP run boundaries; V5 stays blocked, and this
  add-on does not advance its milestones.
- [Roadmap Phase E](../../version/roadmap-vnext.md) keeps worktrees, branch
  integration, and conflict reconciliation. This feature adds none of them.
- [Conversation UI](../../ui/implementation/conversation-ui.md) owns the
  Changes tile host; this feature changes content, not chrome.

## Non-goals and deferred work

- any write to the owner's git repository, including auto-commit, staging,
  branch, checkout, reset, stash, worktree, or push;
- git worktrees or per-run branches (roadmap Phase E);
- merge-conflict UI, GitHub/remote integration, or a general git client;
- automatic Undo for observed-but-unattributed changes (restore evidence
  exists, but the safety contract for non-attributed paths is a later
  decision);
- bundled or static-linked git, Windows-specific git discovery;
- replacing Pi JSONL transcript authority or storing review state as
  transcript text;
- broad filesystem watching between runs (observation is run-scoped);
- public-distribution hardening for the shadow store beyond the honesty and
  budget rules above.

## Final acceptance outcomes

The add-on is accepted only when:

1. the Changes surface shows truthful git working-tree evidence on a git
   workspace and an honest unavailable state on a non-git workspace;
2. a Pi run, a Codex run, and a Claude ACP run each produce shadow base/tip
   commits, and a bash-driven file mutation inside a Pi run appears as an
   observed, unattributed entry with a correct diff;
3. attributed `write`/`edit` review, Approve, conflict, and Undo behave
   exactly as accepted in V3, with the shadow store as the blob/diff engine;
4. two overlapping runs in one workspace keep exact tool-call attribution and
   label shared-timeline observations honestly;
5. git-absent and budget-exceeded states degrade visibly while V3 tool-call
   review keeps working;
6. retention prunes shadow data under the app-data budget without touching
   workspaces, Pi sessions, or the user's repository;
7. unit, real-git integration, Electron, and packaged evidence is recorded at
   the level actually run, including macOS git discovery without a CLT install
   prompt.

Until then, partial delivery is described by the milestone matrix actually
verified, never as "git integration."
