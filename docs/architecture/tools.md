# V1 tool runtime and safety architecture

- Status: Normative V1 design
- Last updated: 2026-07-14
- Governing decision: [ADR 0003](../decisions/0003-deepseek-api-first-backend.md)
- System context: [Native harness system architecture](native-harness-system.md)
- Implementation phase: [Phase 4](../implementation/v1/phase-4-tools.md)
- Supporting evidence: [Pi source study](../research/pi-source-study.md), [Codex source study](../research/codex-source-study.md), and [`fff-search` 0.9.6 documentation](https://docs.rs/fff-search/0.9.6/fff_search/)

## Purpose

This document defines the first-party tool surface owned by Pho Code V1: indexed file search, bounded text reads, patch application, noninteractive shell execution, approvals, model-visible output shaping, artifact write requests, cancellation, and failure behavior. The tools are part of the agent runtime rather than command/GPUI helpers or provider-specific callbacks.

The design optimizes for a small personal coding harness. It does not claim a production security sandbox, general terminal compatibility, arbitrary filesystem access, or a public extension API.

## User outcome

The agent can inspect and modify one selected workspace through a few capable tools. The user can see what the model requested, which action requires permission, what ran, what changed, what output was omitted, and whether cancellation or failure left an uncertain result.

The tool trace remains structured from model request through final result. A shell string or patch is never flattened into assistant prose merely because a terminal or GUI can display it.

## V1 tool surface

| Model-facing tool | Implementation | Approval | V1 result |
| --- | --- | --- | --- |
| `search_files` | `fff_search::file_picker` path/fuzzy index | None inside selected workspace | Ranked relative paths with pagination and index status |
| `search_text` | `fff_search` content-search facilities | None inside selected workspace | Relative path, line, bounded snippet, match metadata, and pagination |
| `read_file` | Background buffered text read | None inside selected workspace | Numbered line window and explicit truncation |
| `apply_patch` | In-process parser, preflight planner, diff, and atomic-per-file writer | Required for every call | Per-file create/update/delete result and recovery reference |
| `shell` | Noninteractive `/bin/zsh -f -c` child process | Required for every call | Exit status, stdout/stderr preview, duration, truncation, and artifact reference |

The model receives only tools whose implementation is ready and whose policy can enforce the current workspace. V1 does not advertise tools speculatively and does not expose `find`, `grep`, `write_file`, a PTY, or a generic arbitrary-function registry alongside these operations.

## Common domain contract

Every tool call has stable identity independent from display order:

```text
ToolCall
  call_id
  turn_id
  name
  raw_arguments
  validated_arguments?
  status
  requested_at
  approval_id?
  result?
```

Required lifecycle states are:

```text
ArgumentsStreaming
Validating
AwaitingApproval
Queued
Running
Cancelling
Completed
Denied
Failed
Interrupted
Uncertain
```

`ArgumentsStreaming` is provider state only. No parser, approval, or execution begins until the provider marks the call complete and the complete argument object passes the tool schema.

Each terminal `ToolResult` records:

```text
ToolResult
  call_id
  status
  model_content
  display_summary
  structured_details
  started_at?
  completed_at
  truncation?
  artifact_refs
  error?
```

`model_content` is the bounded representation returned to the model. `structured_details` drives presentation adapters and the durable journal. They may differ: `pho` and GPUI can retain exact exit status, per-file patch outcome, and an artifact reference without placing every byte back into model context.

## Ownership and dependency rules

1. The harness validates and schedules tool calls; the provider adapter only emits requested calls and accepts results.
2. The tool runtime does not depend on command or GPUI code. It emits lifecycle events consumed by the application reducer.
3. Presentation adapters cannot construct an approval result without a live pending approval identity.
4. Search and read cannot mutate the workspace.
5. Patch and shell cannot begin until the exact validated request receives approval.
6. Session persistence records canonical tool calls and results, not process handles, locks, or transient channels.
7. Cancellation is owned by the running operation and reported through its terminal state; a clicked button is not proof of termination.
8. Tool errors include operation, call ID, and safe path or process context while excluding file contents, command output, credentials, and raw environment values from ordinary logs.

## Workspace and path policy

The selected workspace is canonicalized before a session starts and receives a stable workspace identity. Tool paths are expressed relative to that root in model-facing schemas.

For each structured search/read/patch path and for the shell working-directory argument:

1. Reject an empty path, NUL, absolute path, unsupported prefix, or lexical parent escape.
2. Join the relative path to the canonical workspace root.
3. Resolve existing ancestors and symlinks before access.
4. Verify the resolved target or nearest existing parent remains inside the canonical workspace.
5. Preserve the relative display path separately from the resolved operating path.
6. Recheck relevant metadata immediately before mutation.

A lexical `starts_with` check is insufficient because sibling prefixes and symlinks can escape the workspace. A path that cannot be resolved safely fails visibly instead of being passed to a shell for interpretation.

Structured search, read, and patch operations reject outside-workspace access rather than offering a broader approval. The shell working directory must be inside the workspace, but the approved command language is not path-contained: it may name absolute paths or access anything the user's account permits. The approval surface states that limitation explicitly. Additional roots for structured tools require a future permission-profile decision.

## Approval model

### Policy

Search and text reads inside the selected workspace do not require approval. Every `apply_patch` and `shell` call requires a fresh explicit decision. V1 has no session-wide allow rule, remembered command prefix, automatic approval, or model-controlled escalation.

The approval record contains:

```text
Approval
  approval_id
  call_id
  turn_id
  kind
  workspace_id
  exact_request_summary
  structured_effects
  created_at
  state
```

The only V1 decisions are `ApproveOnce` and `Deny`. Closing a terminal prompt or window, pressing Escape, receiving EOF, losing the controlling terminal/window, cancelling the turn, breaking an output pipe, or restarting the application never means approval.

Command mode obtains approval only from a controlling terminal after rendering the exact canonical request. Prompt input from `pho chat --stdin` is never reused as approval input. If no controlling terminal is available, a mutating request is denied or fails safely before execution; V1 has no noninteractive auto-approve flag. GPUI dispatches the same typed decision bound to the same approval and effect identities.

### Binding

Approval binds to the validated arguments and computed effects. If a path, patch plan, command string, working directory, or environment policy changes after the prompt was created, the approval becomes invalid and the operation must be presented again.

An approval permits execution but does not mark the tool successful. Final state comes from the patch commit result or child-process completion.

### Restart and cancellation

Pending approvals are process-local and are never replayed after restart. A restored tool request is historical and non-actionable. The user starts a new turn if the model still needs the action.

## Indexed file and content search

### Why this dependency

The package name is `fff-search` and its Rust crate name is `fff_search`. At the evaluated `0.9.6` release, its `FilePicker` performs a background tree scan, maintains a sorted file list, watches the filesystem, and provides fuzzy search; the crate also provides content search, Git metadata, optional LMDB-backed frecency and query history, memory mapping, and parallel search.

This is a better fit for a resident harness than spawning `find` and `grep` for each model query because one workspace index can serve command mode, model tools, and later human file navigation. The cost is a larger dependency and lifecycle surface. Operational acceptance requires a pinned crate version, inspected feature graph, successful supported-macOS build, and measured initial scan, steady-state memory, and watcher behavior. [Phase 4](../implementation/v1/phase-4-tools.md) owns when and how that evidence is produced.

### V1 integration profile

V1 creates one search service for the selected workspace:

```text
WorkspaceSearch
  workspace_id
  canonical_root
  shared_file_picker
  scan_state
  watcher_state
  generation
```

The service uses the crate's AI-oriented picker/search configuration where it matches the documented API. Persistent frecency and query-history databases are not initialized in V1. They make ranking depend on past local interaction, add LMDB state and migrations, and are not required for deterministic agent search. Git-aware and fuzzy ranking may be used when they are supplied by the in-memory picker and remain observable in result metadata.

The index starts outside terminal and GPUI render paths. Search before initial scan completes either waits within a short bounded deadline or returns `IndexBuilding` with progress/state; it never blocks presentation indefinitely. A workspace change cancels the old service and creates a new generation. Results from an old generation cannot enter the new session.

The search adapter must prevent the crate's initial scan, content reader, and watcher updates from traversing a symlink to an outside-workspace target. Every returned candidate is revalidated against the canonical root, but post-filtering alone is insufficient if content was already read outside the root. If the pinned crate cannot enforce non-traversal at the source, its affected search facility does not pass Phase 4 and is not advertised.

### `search_files`

Proposed input:

```text
query: string
path?: workspace-relative directory constraint
limit?: bounded integer
cursor?: opaque pagination cursor
```

The query uses FFF path/fuzzy matching across repository-relative paths. Results include relative path, file type, score or match kind when safely available, Git status when available, and a stable cursor. The model does not receive absolute host paths.

Empty or wildcard-only queries are rejected unless a deliberate bounded listing mode is added. `limit` is capped in the tool schema and again in the implementation. Pagination is preferred to returning every match.

### `search_text`

Proposed input:

```text
query: string
path?: workspace-relative path constraint
mode?: literal | regex | fuzzy
case_sensitive?: boolean
context_lines?: bounded integer
limit?: bounded integer
cursor?: opaque pagination cursor
```

The implementation uses `fff_search` content-search functionality rather than invoking `grep` or `rg`. Results contain repository-relative path, one-based line number when available, bounded matching text, bounded context, match kind, and pagination state.

Regex compilation errors are tool validation failures. Binary files, ignored files, oversized candidates, permission failures, and files changed during search are counted or reported according to the crate's observable result; they are not silently presented as a complete repository search.

### Watcher and staleness

The search service records scan and watcher health. A watcher failure does not make cached results authoritative indefinitely. The service transitions to `Stale`, reports the condition in tool results, and allows an explicit bounded rescan. The model is told when results may be incomplete.

V1 does not attempt to merge unsaved editor buffers because Pho Code does not yet own an editor.

### Search bounds

The implementation sets explicit limits for initial scan duration, indexed paths, result count, snippet bytes, context lines, regex size, search wall time, concurrent searches, and watcher event backlog. Exact values are selected from the Phase 4 dependency measurements and recorded as constants with tests.

## Bounded text reads

### I/O decision

The read tool uses ordinary macOS filesystem calls through `std::fs::File` and `BufReader` or an equivalently small blocking API scheduled on a bounded background executor. It does not add Tokio solely for file reads and does not use `io_uring`, which is a Linux interface unavailable on the V1 target.

Coding-agent reads are usually bounded source windows. Their important properties are path safety, stable line numbering, binary rejection, cancellation boundaries, and result limits rather than maximum sequential throughput. `fff_search` may use memory mapping internally for its own index; that does not justify exposing memory-mapped mutable workspace files through `read_file`.

### Input and result

Proposed input:

```text
path: workspace-relative file
start_line?: one-based integer, default 1
line_count?: bounded integer
```

The result includes canonical display path, requested and returned line range, numbered text, end-of-file indicator, file metadata used for stability checks, and truncation metadata.

V1 intentionally uses line windows rather than arbitrary byte offsets because model edits and diagnostics are line-oriented. A future binary or image tool should be separate.

### Read algorithm

1. Resolve and validate the path inside the workspace.
2. Open without following an unsafe final symlink according to the selected macOS API strategy.
3. Read metadata and reject directories, special devices, sockets, and files above the configured policy where a bounded window cannot be guaranteed safely.
4. Inspect a bounded prefix for NUL and validate text encoding policy.
5. Stream through the file until the requested line window is collected; do not load the entire file merely to return a suffix.
6. Bound returned lines and bytes independently.
7. Re-read identity, size, and modification metadata. If the file changed during the operation, return `FileChangedDuringRead` rather than presenting mixed content as stable.

V1 supports UTF-8 text. Invalid UTF-8 and binary-like data return a structured unsupported-content result. Silent lossy conversion could corrupt exact patch context and is not used for model-visible source reads.

### Truncation

If the requested range exceeds the result limit, the tool returns the complete bounded prefix of that range plus the next line to request, the applied byte and line limits, and an omitted indicator. It never appends a vague `...` without machine-readable metadata.

## Apply patch

### Grammar choice

Pho Code uses a cleanly implemented subset of the familiar `*** Begin Patch` / `*** End Patch` format with add, update, and delete file operations. Codex documents and implements the broader grammar in [`apply-patch/src/parser.rs`](../../refs/codex/codex-rs/apply-patch/src/parser.rs#L7), but Pho Code will not link the Codex workspace. Any copied implementation rather than independently written behavior requires Apache-2.0 notice review.

The model-facing tool accepts the patch text directly. It is not tunneled through the shell, heredocs, or an external `patch`/`git apply` executable.

### Supported V1 operations

- Add a new UTF-8 text file whose parent already exists.
- Update an existing UTF-8 text file through line-based hunks.
- Delete a file by moving it to recoverable macOS Trash.

Directory creation, file moves, permission changes, symlink creation, binary patches, mode changes, submodule changes, and outside-workspace paths are rejected. File moves are deferred because their two-path crash and metadata semantics are not justified for the small V1 surface.

### Parse and preflight

Patch handling separates planning from mutation:

1. Parse the complete patch under strict size and operation limits.
2. Reject duplicate or contradictory operations on one path unless the grammar defines an unambiguous sequence.
3. Resolve every source, destination, and parent inside the workspace.
4. Read every source file and capture identity, metadata, content hash, line ending, and final-newline state.
5. Match every hunk against one unique source location.
6. Build complete proposed output bytes for every changed file.
7. Compute a structured diff and effect summary.
8. Store the plan with the approval identity.

Hunk matching begins exact. A limited whitespace-tolerant match may be added only with fixtures showing model compatibility and must still produce one unique location. Broad fuzzy matching is rejected because applying a plausible hunk to the wrong code is worse than asking the model to reread and retry.

No write occurs during parsing, streamed arguments, or approval presentation.

### Approval presentation

The user sees affected relative paths, operation types, bounded diff, additions/deletions count, truncation if the diff preview is capped, and any recovery-artifact policy. Approving binds to the source identities and proposed outputs computed during preflight.

Immediately before mutation, the tool verifies source identities and hashes again. A change invalidates approval and returns `PatchStale`; the tool does not recompute a different diff under the old decision.

### Commit strategy

For add and update output, construct bytes with the deliberate line-ending/final-newline behavior, write a sibling temporary file with restrictive permissions, apply the source POSIX permission bits for an update, flush the file, atomically rename it into place on the same volume, and flush the containing directory before recording step completion. A source with ACLs, extended attributes, flags, or other metadata the implementation cannot preserve is rejected before approval rather than silently stripped.

Recovery-purpose artifacts are all-or-nothing. Preflight proves that the complete original bytes and required POSIX metadata for every update/delete fit the per-artifact and total patch recovery caps. Each artifact stores the full bytes, metadata, and digest and is durably committed before the corresponding mutation. Truncation, refusal, or digest mismatch fails before the first effect with zero mutation. Rollback restores an update/delete from that artifact through the same atomic write path; rollback of a newly added file moves it to Trash. A restored delete may leave the original Trash entry in place and reports that recoverable duplicate explicitly.

macOS does not provide one atomic transaction across multiple files. V1 therefore preflights all operations before any mutation, commits per file, and advances only through [the session effect-progress protocol](sessions.md#durability-boundaries). Each step intent is durable before mutation and each observed completion is durable before the next step. A crash can still leave the started step uncertain, but later paths are known not to have begun. The runtime attempts rollback from recovery material when a later commit fails; rollback steps use the same progress protocol. A failed rollback produces `Uncertain` with exact affected paths, and the result never claims the complete patch succeeded.

Cancellation before the first effect step produces `Cancelled` with zero mutation. After a step starts, cancellation becomes a pending intent: the runtime waits a bounded interval for that atomic/Trash operation to establish an outcome, starts no later forward step, and then attempts rollback of completed steps through the same durable progress protocol. Successful rollback produces `Cancelled`; failed rollback or an effect whose outcome cannot be established produces `Uncertain` with exact completed, rolled-back, and uncertain paths. A clicked cancel control never justifies reporting zero mutation after commit began.

Delete operations invoke `/usr/bin/trash <absolute-path>` without `--`, matching the repository's recoverable-deletion policy. Failure to move a file to Trash leaves it in place and fails that operation. Pho Code never substitutes `rm`.

### Result

The result contains each path, operation, final state, recovery reference when retained, and a bounded diff summary. The model receives enough detail to decide whether to continue or reread. Internal temporary paths are not returned as model context unless recovery requires explicit user action.

## Noninteractive shell

### Invocation

The shell tool accepts a command string and optional workspace-relative working directory. V1 runs it through:

```text
/bin/zsh -f -c <command>
```

`-f` avoids user startup files. The process is noninteractive, receives closed stdin, runs inside the selected workspace, and is placed in its own process group so cancellation and timeout can signal the group rather than only the shell parent.

The tool does not use a login shell, PTY, terminal emulator, or persisted interactive session. Commands that require prompts, full-screen terminal control, password entry, or manual stdin are unsupported and should fail or time out visibly.

### Environment

Start from a documented small environment rather than inheriting the entire Pho Code process. Preserve only variables required for predictable macOS command execution, tool discovery, locale, and an explicitly reviewed allowlist. Remove variables whose names or provenance suggest tokens, secrets, credentials, session cookies, or provider authorization.

Set noninteractive output controls such as `PAGER=cat` and `GIT_PAGER=cat` when doing so does not change command semantics unexpectedly. Record the policy in tests rather than relying on the developer's shell profile.

V1 does not let the model add environment variables containing secret values. A later explicit environment tool requires a separate threat review.

### Approval

The approval shows the exact command, resolved working directory, timeout class, and a warning that V1 approvals are not a sandbox. The command string is never rewritten after approval. A conservative token-aware policy rejects known permanent-deletion utilities such as `rm`, `unlink`, `rmdir`, `srm`, and `shred` when they appear in executable position or by an obvious absolute path, and reports `/usr/bin/trash` as the macOS alternative. If the policy cannot classify a command that invokes one of those utilities, it rejects rather than guesses.

Because shell syntax is compositional and arbitrary programs can delete files through other APIs, this guard does not prove deletion safety or form a sandbox. The model instruction also forbids permanent deletion, every command still requires exact approval, and every presentation adapter warns that an approved general program runs with the user's account permissions.

### Output capture

Read stdout and stderr concurrently as bytes so one pipe cannot deadlock the other and invalid UTF-8 cannot panic the runtime. Each stream produces bounded live deltas for presentation, a bounded preview retained in the journal, and a combined or separate artifact write request subject to a hard byte cap. Text previews use one documented deterministic UTF-8 policy: valid spans remain exact, invalid sequences become the replacement character, and metadata marks the preview as lossy. When retained, the bounded artifact stores the original bytes and records a binary/unknown encoding classification.

The result records exit code or terminating signal, timeout, cancellation state, wall duration, preview truncation, opaque artifact ID/reference, and whether artifact retention itself reached its limit. Output order across stdout and stderr is best effort unless timestamps are recorded; do not fabricate an exact interleaving from independent pipes.

The model-visible result uses a deterministic truncation policy. Commands whose useful information is normally at the end may retain a tail; other results may retain a head and tail. The applied policy and omitted byte count are explicit.

### Cancellation and timeout

Cancellation sends a graceful signal to the process group, waits a short bounded grace interval, then sends a forceful signal if members remain. The tool continues draining output during shutdown within bounds. Completion is not reported until the process is reaped or the runtime enters `Uncertain` because termination could not be established.

Window close, turn cancel, session close, and application shutdown all propagate through the same cancellation path.

## Output, artifact requests, and truncation

### Three output representations

Tool output has three deliberate representations:

1. Live bounded deltas for responsive display.
2. A bounded canonical preview emitted for later session persistence and returned to the model.
3. An optional bounded artifact write request containing more complete output or mutation recovery data.

None is unbounded. “Full output” in presentation wording means the retained artifact, not an unlimited guarantee.

### Truncation record

```text
Truncation
  policy: Head | Tail | HeadAndTail | LineWindow
  original_bytes?: integer
  retained_bytes: integer
  omitted_bytes?: integer
  original_lines?: integer
  retained_lines?: integer
  artifact_ref?
  artifact_truncated: boolean
```

When the original total is unknown because streaming stopped at a hard cap, record that uncertainty instead of inventing an omitted count.

### Artifact boundary

The tool runtime submits bounded content, classification, purpose, owning identities, and truncation metadata through a narrow crate-private artifact writer boundary. The session store owns generated names, restrictive permissions, atomic commit, persistent limits, recovery, and cleanup according to [the artifact storage contract](sessions.md#artifact-storage). A successful write returns an opaque `ArtifactId`; tools and views never construct or expose storage paths. Mutation-recovery requests require all-or-nothing storage and reject truncation.

An injected writer is a valid test seam but does not satisfy the persistent V1 contract. Personal-workspace mutation requires the real session writer and artifact store. Artifacts may contain sensitive file content, commands, diffs, or raw output bytes and are never copied into diagnostics or crash reports.

## Concurrency and backpressure

V1 executes one mutating or shell tool at a time per active turn and uses sequential tool results in provider source order. Search and read may use internal worker parallelism, but the agent loop awaits one tool result before continuing.

Bounded resources include:

- active model-request count;
- queued tool calls;
- pending approvals;
- concurrent search requests;
- search-index watcher backlog;
- read workers;
- patch bytes, files, and hunks;
- shell processes;
- stdout/stderr channel capacity;
- live delta bytes;
- preview and artifact bytes;
- cancellation grace time.

If a presentation event queue saturates, coalesce safe output deltas by tool call while preserving approval requests and terminal states. Never drop `Completed`, `Denied`, `Failed`, `Interrupted`, or `Uncertain` to preserve intermediate text. A broken command output pipe becomes cancellation input; it never licenses dropping ownership of a running effect.

## Error model

Representative categories are:

- `ToolArgumentsIncomplete`
- `ToolArgumentsInvalid`
- `ToolLimitExceeded`
- `WorkspaceUnavailable`
- `PathOutsideWorkspace`
- `UnsafeSymlink`
- `IndexBuilding`
- `IndexStale`
- `SearchFailed`
- `UnsupportedFileType`
- `UnsupportedFileMetadata`
- `FileChangedDuringRead`
- `PatchInvalid`
- `PatchStale`
- `PatchAmbiguous`
- `PatchCommitFailed`
- `PatchRollbackFailed`
- `ApprovalDenied`
- `ApprovalInvalidated`
- `ShellSpawnFailed`
- `ShellTimedOut`
- `ShellCancelled`
- `OutputLimitReached`
- `ToolInterrupted`
- `ToolOutcomeUncertain`

Errors carry tool and turn identity, safe relative paths, retry posture, and a user-facing recovery action. Raw file contents, full commands, output, environment, and credentials remain in structured session content only where the user expects them, not in diagnostic messages.

## Security and privacy

- Treat every model tool request as untrusted input even when the model is authenticated.
- Validate complete arguments against the exact schema before policy evaluation.
- Canonicalize paths and prevent symlink escape.
- Keep read/search output bounded so workspace secrets are not copied into context accidentally without limit.
- Present every patch and shell action for a fresh explicit decision.
- Never interpret denial as a tool error that should be automatically retried unchanged; return a structured denied result to the model.
- Do not inherit provider credentials into shell children.
- Do not log raw tool requests or results by default.
- Send artifact content only through the bounded session-store boundary; the tool runtime never chooses artifact paths or permissions.
- Use recoverable Trash for first-party deletion.
- State clearly that V1 approval and containment are guardrails, not a verified macOS sandbox.

## Verification handoff

[Phase 4](../implementation/v1/phase-4-tools.md#verification) owns the executable test matrix and [its gate](../implementation/v1/phase-4-tools.md#gate) owns V1 acceptance evidence. This architecture remains the source for the behavior those checks must prove.

## V2 inputs, not V1 work

Stronger sandboxing, persistent grants, file moves, interactive or parallel tools, additional workspaces, richer FFF integration, binary tools, public tool extension APIs, and cross-platform process/Trash behavior remain deferred to [the V2 roadmap](../implementation/v2/README.md).

## Open decisions for implementation evidence

- Exact `fff-search` features and pinned version after macOS dependency measurements.
- Exact tool schema field names and result limits.
- Exact bounded-blocking semaphore capacity and whether its jobs use Tokio's blocking pool or GPUI's background executor without introducing a second async runtime.
- macOS API used to prevent unsafe final-component symlink following.
- Strict patch grammar subset and whether limited whitespace tolerance is needed.
- Recovery-artifact format and retention.
- Exact shell environment allowlist, timeout classes, and output head/tail policy.

These choices affect compatibility, safety, or persisted behavior and must be recorded in tests or a follow-up decision rather than guessed inside a view.
