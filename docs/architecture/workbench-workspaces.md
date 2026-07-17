# Workbench workspaces and inspection

- Status: Normative V1 architecture; released in 0.1.0
- Governing decision: [ADR 0004](../decisions/0004-native-workbench-phase-6.md)
- Parent presentation: [GPUI workbench](gpui-workbench.md)
- Existing file/tool authority: [V1 tools](tools.md)
- Session authority: [Sessions](sessions.md)
- Delivery: [Phase 6](../implementation/v1/phase-6/README.md)

## Document role

This document owns registered-workspace navigation, the recent/open session catalog, selected-context switching, file-tree snapshots, the read-only text/diff viewer, and Git branch/change projections. It does not own tool containment, journal durability, agent execution, terminal processes, pane layout, or GPUI component internals.

## Identity boundary

A sidebar project and a running session are related but not the same authority. Phase 6 introduces these local identities:

```text
WorkspaceRegistrationId  stable preference identity for one sidebar entry
WorkspaceGeneration      one validated opening of that registered path
SelectionGeneration      one requested workspace/session selection transaction
WorkspaceId              existing durable session/turn/tool authority identity
SessionId                existing durable journal identity
TreeRequestId
FileRequestId
FileSnapshotId
GitRequestId
```

`WorkspaceRegistrationId` is new and never appears in an existing journal. `WorkspaceId` retains its current canonical meaning in `SessionCreated`, `TurnStarted`, reducer state, and tool operations. The current session manager creates a distinct `WorkspaceId` per durable session; Phase 6 does not retroactively reinterpret old IDs as stable sidebar registrations or group sessions by UUID.

The selected context therefore carries both identities:

```text
SelectedWorkbenchContext
  registration_id
  workspace_generation
  retained_workspace
  session_id?
  session_workspace_id?
  selection_generation
```

Registering a path grants no model or tool authority. Tool authority exists only after the selected session and retained workspace have passed the existing canonicalization, descriptor, containment, and generation checks. Titles, paths, row indexes, tab positions, and Git roots are never substituted for an opaque identity.

## Workspace registry

The registry stores at most 64 entries in the versioned non-secret workbench preferences:

```text
WorkspaceRegistration
  registration_id
  canonical_path
  display_name
  last_selected_at
  state: Closed | Opening | Ready | Missing | Stale | Failed
```

Adding a workspace uses a native directory chooser and a coordinator-owned opening operation. The service canonicalizes the chosen directory, opens and retains it with the same no-follow root descriptor and device/inode identity used by `Workspace`, and rejects a duplicate canonical path. The display name defaults to the final path component but is presentation-only and may be disambiguated locally.

Removing a registration removes only preference/navigation state after confirmation. It never deletes the directory, journal, artifact, file, Git data, or terminal process. Because deletion is not required for the Phase 6 outcome, session deletion and journal relocation remain absent.

A root rename, replacement, disappearance, permission loss, or identity mismatch changes the open registration to `Stale`, `Missing`, or `Failed`. The old retained descriptor is not silently rebound to a different pathname. Reopening the current canonical path creates a new `WorkspaceGeneration`; any association with existing session paths is revalidated before writable use.

## Session catalog and chat tabs

The catalog is a rebuildable projection over at most the existing 1,024 session journals. It adds no second history database. Each row derives:

```text
SessionCatalogEntry
  session_id
  workspace_path_classification
  title
  last_recorded_at
  profile/model summary
  writable | read_only | damaged | missing_workspace | incompatible
  active/open presentation state
```

The title is the first non-empty user message reduced to one line and at most 80 grapheme clusters; an empty session uses `New chat`. `last_recorded_at` comes from the latest valid journal envelope, not UUID ordering or filesystem enumeration order. The backend is not a per-tab choice: every supported V1 chat uses the one qualified DeepSeek profile, and the header owns its model/thinking details. A small compatibility/read-only label may appear when it explains why a session cannot send.

The workspace sidebar shows only entries whose canonical recorded workspace matches the selected registered root. A missing or damaged workspace association remains available in a separate recoverable/unavailable group and is never silently attached by matching a display name. Phase 6 does not add session relinking; the user may inspect such history read-only and create a new session in a registered workspace.

At most 16 chat tabs are open across the workbench. Tabs are presentation state over durable sessions, scoped to their registered workspace in the visible tab bar. Opening a tab reconstructs canonical state through `SessionManager`; closing or reordering a tab changes preferences only. It never deletes, rewrites, cancels, or compacts a journal. Only the selected tab may dispatch `SendPrompt`, and only after the existing reducer accepts the same `SessionId` and `WorkspaceId`.

## Atomic selection and switching

Workspace and session selection is one generation-bearing application transaction:

```text
Selected
  -> Selecting(target, generation)
  -> OpeningWorkspace
  -> LoadingSession? / StartingInspectionServices
  -> CommitSelected
  -> Selected

Selected + active turn/approval/tool
  -> SwitchBlocked
  -> CancelAndSwitchRequested
  -> AwaitingAuthoritativeTerminal
  -> Selecting
```

The previous selected context remains fully active until commit. The operation validates the registration, opens/revalidates the retained root, reconstructs the requested session, verifies its recorded canonical path and compatibility, and starts generation-scoped inspection services. Only then does one reducer transition publish the new context and retire the old inspection generation. A failure leaves the old context selected and shows a safe error; the shell never displays panes from two partially selected workspaces as one state.

A click while an agent turn, approval, or tool is active does not retarget it. The shell offers an explicit cancel-and-switch action bound to the current `TurnId` and target selection. It dispatches cancellation and waits for completed, failed, cancelled, interrupted, or uncertain terminal truth before starting the switch. Timeout or loss of acknowledgement leaves the current context selected. User-terminal tabs follow their separate contract and may continue under their original workspace while navigation changes.

Every asynchronous event carries registration ID, workspace generation, request ID, and, where relevant, selection/session identity. The projection accepts it only if all current fields match. Late workspace, session, tree, file, Git, render, or watcher results are discarded as stale data; a view highlight cannot override this check.

## File-tree snapshot service

The file tree is a lazy coordinator-owned snapshot service over the retained workspace descriptor. GPUI's tree control receives typed rows; it never calls `read_dir` or opens a path.

```text
DirectorySnapshot
  registration_id
  workspace_generation
  request_id
  relative_directory
  state: Loading | Ready | Stale | Failed | Truncated
  entries: [TreeEntry]

TreeEntry
  relative_path
  display_name
  kind: Directory | File | Symlink | Special | Inaccessible
  child_state: Unloaded | Loading | Loaded | Failed | Truncated
```

Enumeration opens every directory component relative to the retained descriptor without following links. Symlinks render as inert entries and cannot expand or open. Devices, sockets, FIFOs, and other special files render as non-openable. Permission errors remain visible as inaccessible entries. `.git` is an opaque repository marker rather than an expandable directory; Git inspection uses its own actor.

Rows sort directories before other entries and then by deterministic Unicode/path ordering. Expansion state is keyed by registration, workspace generation, and relative path. Watcher events are dirty hints only; they never authorize opening an event path. A dirty expanded directory retains its prior snapshot with a stale label until a validated refresh replaces it.

The initial profile permits 100,000 retained tree entries per selected workspace, 2,048 entries per directory snapshot, nesting depth 64, 16 outstanding directory requests, a 4 KiB encoded relative path, and a 16 MiB aggregate serialized tree cache. Limit exhaustion returns a partial snapshot with an explicit truncation row; it never claims the directory is complete. Switching or collapsing may cancel work, and stale request results are harmless.

The toolbar exposes file-tree and Git-changes modes plus refresh/collapse actions. It does not add a second raw filesystem list with different containment behavior.

## Read-only file viewer

The viewer consumes immutable source snapshots and never wraps an editable application buffer:

```text
FileSnapshot
  snapshot_id
  registration_id
  workspace_generation
  request_id
  relative_path
  source_utf8
  line_index
  file_identity
  content_digest
  language: QualifiedLanguage | PlainText
  state: Ready | Stale | ChangedDuringRead | Unsupported | TooLarge | Failed
```

Opening and reloading validate the relative path, open every component through the retained descriptor with no-follow behavior, reject directories/special files/NUL/binary-like/invalid UTF-8 data, read bounded bytes off the GPUI thread, build line/syntax metadata, and recheck file/path identity before accepting the snapshot. Byte-order marks and line endings remain in canonical source; display indexes may account for them without lossy rewriting.

The viewer accepts at most 16 MiB and 250,000 lines per file, 16 simultaneous read/highlight jobs, and 64 MiB of aggregate immutable source/syntax cache. Syntax highlighting is attempted only for a small explicitly qualified language set and at most 2 MiB or 50,000 lines; larger accepted text uses the virtualized plain-text renderer. Unsupported, binary, invalid, or oversized files show metadata and a precise unavailable reason rather than a misleading partial source view.

Watcher change marks the current snapshot stale. Explicit reload increments its request generation; the old snapshot remains selectable with a stale banner until the new result passes identity checks. There is no in-place merge, save, autosave, formatting, completion, rename, refactor, LSP mutation, writable diff hunk, or agent edit route. Search and copy operate on the immutable snapshot within bounded results and retain original text.

At most 32 file/diff tabs are open. Closing a tab only releases presentation/cache references. A deleted or replaced file tab remains with an unavailable/stale state until explicit close or reload; it does not jump to a different inode at the same path.

The audited `gpui-component` code editor is based on editable `InputState`, and disabled-input semantics are not equivalent to a selectable accessible read-only viewer. Phase 6 must qualify a read-only wrapper/custom virtualized text view before adoption. The broad tree-sitter feature set is not enabled merely to match the component story.

## Read-only Git service

Git state is a dedicated coordinator-owned read-only actor, not a model shell invocation and not an API borrowed from `fff-search`'s transitive libgit2 graph. The first qualification candidate invokes the fixed system `/usr/bin/git` executable directly with a fixed argument vocabulary, canonical retained workspace cwd, closed stdin, bounded stdout/stderr, deadlines, cancellation, and no shell interpolation.

The status operation uses machine-readable porcelain v2 with NUL paths and branch headers. Separate fixed operations collect staged and unstaged numstat/diff data with color, pager, external diff, and text conversion disabled. The child environment sets `GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0`, `GIT_PAGER=cat`, and a deterministic locale; no API key or Pho test secret is injected. Repository hooks, aliases, arbitrary arguments, writes, staging, committing, checkout, fetch, and network operations are absent.

```text
GitSnapshot
  registration_id
  workspace_generation
  request_id
  state: Loading | Ready | NotRepository | Detached | Unborn | Stale |
         TimedOut | Cancelled | Unsupported | Failed
  branch/head/upstream/ahead/behind
  path_statuses
  dirty_counts
  counts_complete

UncommittedDiffSnapshot
  staged_sections
  unstaged_sections
  additions/deletions
  source_bytes
  truncated
  binary/unsupported markers
```

Untracked paths appear in status and counts. V1 does not manufacture full patches for them through `git diff --no-index`; selecting one opens it through the safe file-viewer service. Binary diffs show a bounded marker and status rather than raw binary patch data. Detached and unborn repositories, conflicts, renames, Unicode/quoted paths, submodules, no repository, and unknown optional porcelain records have explicit projections.

The initial profile allows 1 MiB status output, 10,000 path records, a 2-second status deadline, 4 MiB combined staged/unstaged diff capture, 20,000 diff lines, a 5-second diff deadline, a 512 KiB rendered preview, eight queued requests, and one active Git child per selected workspace. Truncated paths/counts/diffs remain visibly partial. `+N -M` is shown only when counts are complete; otherwise the same location says `partial` with known values in details.

Watcher bursts are coalesced into one refresh. Successful agent patch/shell completion and user-terminal child exit mark the owning workspace Git state dirty, but the Git actor performs the authoritative refresh. Sidebar change counts, chat footer branch, changes list, diff tab, and terminal workspace badge all consume the same generation of `GitSnapshot`; none scrape shell prompts or maintain an independent branch string.

Git errors and raw output may expose repository configuration and paths. Ordinary diagnostics retain only operation, registration/request identity, safe status class, byte counts, timeout/truncation, and validated relative paths required for recovery. They do not log absolute roots, environment, raw stdout/stderr, diff bodies, or configuration.

## Failure behavior

- A registry load/open failure leaves other entries usable and never widens authority.
- A missing/read-only/damaged session remains inspectable without becoming writable.
- A failed selection leaves the previous atomic context selected.
- Tree failure retains the prior generation as stale context; symlinks and special files remain inert.
- Viewer failure retains original source when already loaded and cannot replace it with lossy text.
- Git absence or non-repository state disables only Git projections; file/chat/terminal services remain available.
- Actor queue saturation rejects the new operation visibly; it does not drop lifecycle events or accept a partial generation.
- Workspace root replacement makes tree, viewer, Git, search, and new terminal creation stale together. Existing user-terminal processes retain their original OS cwd under the terminal contract but are never presented as belonging to the replacement tree.

## Verification

Pure and local tests cover duplicate registration, preference bounds, canonical path classification, session catalog title/recency derivation, damaged/missing/read-only journals, tab close without deletion, atomic selection, active-turn cancel-and-switch, and stale generation rejection for every event type.

Tree/viewer fixtures cover deterministic sorting, symlink/special/inaccessible entries, `.git` opacity, every depth/count/byte bound, root replacement, dirty watcher coalescing, invalid UTF-8, NUL/binary data, BOM/CRLF, oversized/many-line files, atomic replacement, same-length concurrent change, syntax fallback, cache eviction, and read-only selection/copy.

Git fixtures cover non-repository, branch/detached/unborn/upstream/ahead/behind, staged/unstaged/untracked/conflicted/renamed/submodule paths, NUL/Unicode names, binary data, malformed/unknown porcelain, fixed argument/environment policy, no external diff/textconv/pager/prompt, deadlines, cancellation, output limits, root replacement, and one-snapshot consistency across all visible consumers.

Native L4 scenarios open large real repositories, switch workspaces while idle and during an active turn, keep an old-workspace terminal running, change Git state through that terminal, select/copy but fail to mutate viewer text, restart into reconstructed sessions, and instrument that no GPUI render method opens a file, directory, Git child, journal, or watcher.
