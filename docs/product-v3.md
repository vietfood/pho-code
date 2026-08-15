# Product definition: v3 change control and recovery

## Status

Proposed v3 product boundary, approved in direction by the owner on 2026-08-15. Milestones 0 through 2 are implemented in source with protocol, runtime, and Electron evidence; they are not owner-accepted. Personal v1 and v2 remain accepted and archived under [`archive/v1`](./archive/v1/README.md) and [`archive/v2`](./archive/v2/README.md).

## Outcome

Pho Code v3 makes ordinary agent file changes visible, reviewable, and recoverable without slowing every edit behind a confirmation dialog.

The agent continues to apply Pi `write` and `edit` operations immediately inside the selected workspace. Pho Code then presents the exact attributed changes in a bounded, read-only workbench where the owner can:

- inspect changed files and their before/after diff;
- approve one file or the whole pending review set;
- preview and safely undo one file, with batch Undo added only after its partial-failure behavior is trustworthy;
- understand when a change cannot be safely undone because the file changed again;
- recover pending review state after renderer reload or application restart.

This is **live apply with review**, not a patch-proposal system. The workspace on disk remains the source used by subsequent tools, tests, builds, editors, and Git commands as soon as a tool succeeds.

## Meaning of Approve and Undo

The labels are owner-facing workflow states, not filesystem durability controls.

- **Approve** means “I accept the currently reviewed change.” It does not write the file again, create a Git commit, stage the file, or make an otherwise temporary edit persistent. The file was already changed on disk.
- **Undo** means “preview and restore the recorded pre-change content if that restoration is still safe.” It is never a force overwrite.
- **Pending review** means Pho Code has a complete attributed before/after record that the owner has neither approved nor undone.
- **Conflict** means the current file no longer matches the recorded agent result. Pho Code keeps the record visible but disables automatic undo until the owner resolves the overlap.

Approving closes the pending-review item. A bounded recovery record may remain until normal retention cleanup so an interrupted approval write cannot corrupt the ledger, but v3 does not promise a long-lived local-history browser after approval.

## Audience and trust model

V3 continues the personal, trusted-workspace assumptions of accepted v2:

- the owner selects and trusts the workspace for ordinary coding work;
- source-reviewed baked features execute with the app process's authority;
- Pi and its built-in tools remain the agent engine;
- macOS is the first verified platform and Linux remains compatibility-oriented until exercised;
- the owner may edit files concurrently in another editor;
- other local processes, shell commands, formatters, generators, and Git operations may also change workspace files.

The change ledger is a recovery mechanism, not a sandbox or security boundary. It cannot contain malicious extension code, arbitrary shell processes, another application, or an external user.

## Product invariants

1. **Live workspace truth.** A successful Pi `write` or `edit` changes the real selected workspace immediately. Pho Code does not maintain a shadow checkout or virtual filesystem in v3.
2. **Exact attribution before recovery.** Pho Code offers automatic undo only for a path whose before-image and after-image were captured around a positively identified Pi `write` or `edit` call.
3. **No overwrite of newer work.** Automatic undo is available only when the current content hash equals the recorded after-image hash. A mismatch is a conflict, even if the text looks similar.
4. **Approval is not Git.** Approve neither stages nor commits changes and does not alter Git history.
5. **Pi remains transcript authority.** Filesystem review state is application-owned data keyed to a Pi session and run; it is not stored as transcript text or inferred from Pi JSONL.
6. **Selection is not ownership.** Review state belongs to `{workspaceId, sessionId, runId}` and survives switching to another chat. Background runs append only to their own review sets.
7. **Removal stays recoverable.** Undoing a newly created, still-unmodified file moves it through the operating-system Trash service. Pho Code never uses `rm`, `unlink`, recursive deletion, hard reset, or force checkout as recovery.
8. **Git is supplementary evidence.** Git diff/status may help presentation later, but Git is never the sole recovery authority because a workspace may be non-Git, dirty before the run, or contain untracked files.
9. **Bounded data.** Snapshots, rendered text, diff computation, retained history, and IPC results have explicit size and count limits. Exceeding a limit degrades honestly to review-only or metadata-only state.
10. **The renderer never receives authority.** It receives bounded relative paths, hashes/status identifiers, and diff/file content pages. It never receives arbitrary filesystem handles, app-data snapshot paths, or a generic read/write IPC channel.

## Change ownership model

The first v3 release recognizes three classes:

| Class | Meaning | Review | Automatic undo |
| --- | --- | --- | --- |
| Agent-attributed | Captured directly around a Pi `write` or `edit` call | Exact before/after diff | Available while current content matches the recorded after-image |
| Observed but unattributed | A later bounded mechanism detects a workspace change without a trustworthy tool-call boundary | May be shown with a warning | Unavailable |
| External overlap | A tracked path changed after the agent result, including owner/editor changes | Three-state/current comparison | Unavailable until explicitly reconciled |

V3 begins with agent-attributed `write` and `edit`. It does not claim complete observation or recovery for `bash`, package scripts, formatters, code generators, database migrations, MCP tools, another editor, or external filesystem activity.

## Review-set model

One admitted run owns one review set. Each exact path has one visible pending item per run, even when the agent writes it multiple times.

- The visible diff compares the file's first captured pre-image in that run with its latest captured post-image.
- The ledger retains the ordered tool-call chain needed to diagnose failures and safely reverse the run.
- A later run creates a new review set rather than silently merging history across prompts.
- A background run can finish with pending review without selecting its chat.
- The sidebar and transcript may show a bounded changed-file count, but the workbench opens only for an explicit workspace/chat/run identity.

Approve may target one file or the entire pending review set. Undo initially targets one file because restoring several ordinary files plus OS Trash cannot be made transactionally atomic. A later **Undo all** must first compute a complete preview, define a journaled order and crash reconciliation, and refuse the entire request when any selected file conflicts. Pho Code never partially restores a supposedly atomic operation while presenting it as fully successful.

## Read-only review workbench

The conversation remains the primary product surface. A compact changed-files summary on the relevant tool/run, or the persistent right-sidebar FileDiff icon, opens the Changes surface containing:

- a file list grouped by added and modified state;
- per-file pending, approved, undone, conflict, unavailable, and failed status;
- unified diff as the only workbench view;
- `getChangeFileView` remains on the typed bridge for later recovery diagnostics, but the sheet does not expose before/agent/current tabs;
- syntax highlighting, line numbers, search, whitespace visibility, and bounded context expansion;
- per-file **Approve** and **Undo** actions;
- review-set **Approve all**, with **Undo all** added only after journaled partial-failure semantics are accepted;
- an exact undo preview stating which files will be restored, moved to Trash, skipped, or blocked;
- a clear warning when shell or external changes are outside the attributed set.

The workbench is not a manual source editor. V3 does not introduce dirty buffers, Save/Save As, language services, tabs as durable editor state, arbitrary path browsing, or renderer-side filesystem access.

## Safe undo contract

For each selected item, Pho Code re-resolves the canonical path beneath the original canonical workspace and rechecks protected/sensitive path policy immediately before recovery.

### Modified file

Automatic undo requires all of the following:

- a complete pre-image and after-image exist;
- the path still resolves to the same permitted workspace location;
- the current file is a regular file of the expected kind;
- its content hash equals the recorded after-image hash;
- no recovery operation for the item is already running.

Pho Code writes the pre-image through a runtime-owned atomic replacement adapter, preserving the documented mode and line-ending behavior where supported. If any check fails, no write occurs.

### Newly created file

If the pre-image records absence and the unchanged agent-created file still exists, Undo moves the exact validated file to operating-system Trash. If it changed, became a directory/symlink, or no longer resolves safely, Undo stops with a conflict. There is no permanent-deletion fallback.

### Failed or interrupted tool

A failed `write` or `edit` may still have changed the file. Pho Code captures the post-state and records one of:

- unchanged after failure;
- changed and recoverable;
- changed but snapshot unavailable;
- indeterminate because the process ended before the post-state was captured.

On restart, an indeterminate item is reconciled against the stored pre-image and current workspace state. Pho Code never labels it safely undoable without enough evidence.

## Persistence and retention

Change-ledger data belongs under Pho Code's mutable application data root, separate from Pi JSONL, Git, the selected repository, packaged resources, credentials, and the permission log.

The storage design uses versioned manifests plus content-addressed immutable blobs. Manifests contain composite session/run/tool identities, workspace identity, normalized relative paths, hashes, timestamps, status, and bounded file metadata. Blob paths and absolute workspace paths never cross to the renderer.

Initial implementation limits are source-owned constants rather than generic Settings controls. The implementation plan may tighten them after the representative slice, but it must define:

- maximum snapshot bytes per file;
- maximum tracked files and bytes per run;
- maximum total retained bytes;
- pending-review retention across restart;
- cleanup behavior for approved, undone, orphaned, and corrupt records.

Retention cleanup may remove only app-owned ledger artifacts through a separately reviewed lifecycle. Repository files, Pi sessions, credentials, and workspaces are never cleanup targets. Until recoverable cleanup is implemented, pending review is kept until Approve or Undo, approved and undone records are retained rather than silently deleted, and exceeding the 250 MiB ledger budget marks new snapshots unavailable instead of deleting old records.

## Permission relationship

V3 does not replace the accepted permission system.

- Permission policy decides whether the tool may attempt the operation.
- The change ledger captures attributable effects around an allowed attempt.
- The review workbench explains and recovers those effects.

Balanced may continue asking before `write` and `edit`; Developer may continue allowing them. Approve in the review workbench is not a permission approval and does not affect later tool calls or session permission rules.

## Non-goals

V3 does not include:

- proposed patches that wait for approval before reaching disk;
- a full code editor or IDE workbench;
- automatic Git staging, commit, branch, checkout, reset, stash, or worktree management;
- guaranteed attribution or undo for arbitrary shell commands and scripts;
- broad filesystem watching or complete external-process provenance;
- binary editing, directory snapshots, database rollback, or dependency rollback;
- restoring files after the owner empties operating-system Trash;
- permanent deletion or force restoration in any permission mode;
- public-distribution isolation, signing, notarization, updater, or adversarial-workspace hardening.

## V3 completion boundary

V3 is complete when the accepted macOS application can apply Pi `write` and `edit` immediately, persist exact per-run pending review state, render a bounded read-only file/diff workbench, approve without implying Git persistence, safely undo unchanged attributed results without overwriting newer work, use OS Trash for an unchanged newly created file, survive chat switches and application restart, and state unsupported shell/external recovery honestly.

Shell-wide mutation recovery, a manual editor, browser automation, terminal, multi-agent worktrees, runtime isolation, and public distribution remain independently promotable future work rather than blockers for v3 completion.
