# Phase 4: First-party tools and approvals

- Status: **PASS — 2026-07-15** ([evidence](../evidence/phase-4-2026-07-15.md))
- Depends on: [Phase 3](phase-3-live-backend.md)
- Selected sequencing: Optional [Phase 3B](phase-3b-terminal-tui.md) passed before execution
- Produces: Search, read, patch, shell, approval, bounded-output runtime, and persistent-session integration seams
- Next, not started: [Phase 5](phase-5-sessions.md)

## Required reading

1. [V1 tool runtime and safety architecture](../../architecture/tools.md)
2. [System ownership and event flow](../../architecture/native-harness-system.md)
3. [Session durability and artifact boundaries](../../architecture/sessions.md#durability-boundaries)
4. [Contributor deletion policy](../../../AGENTS.md#deletion-protection)

## Outcome

The `pho` harness can inspect and change a controlled disposable workspace through the V1 tool surface owned by the tool architecture. This phase proves schemas, controlling-terminal approval, containment, execution, output shaping, command projection, and persistent-session integration boundaries. Patch and shell remain developer/test-only until Phase 5 supplies and verifies the durable writer and artifact store.

## Work order

1. Qualify and pin `fff-search`: inspect its feature graph and licenses, build it on the supported macOS architecture, measure initial scan, steady-state memory, watcher behavior, and dependency footprint, then fix named search limits from that evidence.
2. Implement shared tool identities, strict argument validation, lifecycle, limits, cancellation, result shape, and one-active-tool scheduling from [the common contract](../../architecture/tools.md#common-domain-contract).
3. Implement canonical workspace/path policy and exact-effect approval binding from [workspace policy](../../architecture/tools.md#workspace-and-path-policy) and [approval model](../../architecture/tools.md#approval-model).
4. Integrate the qualified safe subset of `fff_search` for `search_files` and candidate indexing, plus the containment-safe no-follow content adapter specified by [indexed search](../../architecture/tools.md#indexed-file-and-content-search). Do not enable the unsafe 0.9.6 watcher or grep reader.
5. Implement bounded buffered `read_file` using [the read contract](../../architecture/tools.md#bounded-text-reads); do not add `io_uring`.
6. Implement the clean-room patch parser, preflight, approval diff, per-file commit, Trash deletion, result, and in-process rollback behavior from [Apply patch](../../architecture/tools.md#apply-patch). Exercise recovery-artifact and effect-progress ordering through injected fakes; do not claim process-crash durability in this phase.
7. Implement noninteractive `/bin/zsh -f -c`, environment policy, byte-oriented output capture, cancellation, process-group cleanup, and permanent-deletion guard from [the shell contract](../../architecture/tools.md#noninteractive-shell).
8. Implement previews, artifact write requests/references, truncation records, and backpressure from [output policy](../../architecture/tools.md#output-artifact-requests-and-truncation) using a bounded fake artifact writer.
9. Connect tool and approval events to the Phase 2 reducer, live Phase 3 loop, and `pho` terminal adapter behind a developer/test-only gate restricted to disposable temporary workspaces. Interactive decisions must come from a controlling terminal; stdin prompt content never doubles as approval input.

Recommended ownership remains one module per tool plus shared validation and output modules, with narrow crate-private effect-recorder and artifact-writer boundaries supplied by Phase 5. Do not introduce a public tool registry, MCP, PTY, write-file tool, fallback `find`/`grep`, persistent approval rule, or ordinary-workspace mutation toggle in this phase.

## Verification

The following checks are the canonical Phase 4 test matrix. Keep fixture, temporary-workspace, live-model, and manual-macOS evidence separate.

### Common lifecycle tests

- fragmented tool arguments do not execute;
- invalid schema and unknown tool fail deterministically;
- duplicate call ID is rejected or reconciled without duplicate execution;
- approve and deny are exactly once;
- a missing controlling terminal denies or fails safely before a mutating effect, while read-only execution remains governed by normal policy;
- cancellation before validation, during approval, while queued, and while running;
- turn failure invalidates pending calls;
- terminal state survives presentation-event saturation;
- terminal state survives command renderer backpressure, broken pipe, and terminal loss;
- model result and display details retain the same call identity.

### Search tests

- initial scan, search during scan, and scan timeout;
- fuzzy path ranking and bounded pagination;
- literal, regex, and fuzzy content queries;
- invalid regex and wildcard-only query;
- ignore rules, binary files, permission failures, and large files;
- initial-scan file/directory symlinks to outside targets are neither traversed nor returned, and outside content is never read;
- watcher add, update, rename, delete, overflow, and failure;
- watcher-created or retargeted outside symlinks remain excluded;
- workspace switch generation prevents stale results;
- deterministic behavior with frecency/query databases disabled;
- supported macOS architecture build and measured dependency footprint.

### Read tests

- first, middle, last, and beyond-end line windows;
- no final newline and mixed supported line endings;
- byte and line truncation metadata;
- invalid UTF-8, NUL/binary, directory, device, and oversized file;
- `..`, absolute, sibling-prefix, and symlink escapes;
- file replacement or mutation during read;
- background execution keeps command and GPUI state dispatchers responsive.

### Patch tests

- add, update, and Trash-backed delete; file moves are rejected;
- malformed markers, oversized input, duplicate operations, and unsupported metadata;
- exact unique hunk, missing hunk, and ambiguous duplicate context;
- CRLF/LF and final-newline preservation;
- POSIX permission preservation and rejection of metadata the implementation cannot preserve;
- source change between approval and commit;
- symlink source, destination escape, and existing destination;
- temporary-file write, file/directory flush, rename, recovery copy, rollback success, and rollback failure;
- per-artifact and total recovery-cap exhaustion, truncating-writer response, and digest mismatch all fail before the first mutation;
- fake effect-progress ordering and artifact-writer failure before mutation;
- multi-file partial commit produces visible uncertain paths;
- denial and cancellation before the first commit cause zero mutation;
- cancellation during each effect boundary starts no later forward step, records the current outcome, and proves both successful rollback and explicit partial/`Uncertain` rollback failure.

### Shell tests

- stdout, stderr, mixed output, and one-pipe flood;
- zero and nonzero exits, signal termination, spawn failure, and invalid cwd;
- timeout and user cancellation kill the process group and reap the child;
- child/grandchild process behavior;
- output preview and artifact-request caps, including writer refusal;
- invalid UTF-8 output preserves bounded raw artifact bytes and marks the text preview lossy;
- closed stdin and unsupported interactive command;
- filtered environment excludes seeded fake secrets;
- direct and absolute-path permanent-deletion utilities are rejected with a Trash alternative, including wrappers the conservative classifier supports;
- no user shell startup files are loaded;
- application shutdown uses the same cancellation path.

Inject partial patch failure, stale approval, search watcher failure, read mutation, shell output flood, and descendant cleanup rather than relying only on happy paths.

### Manual macOS checks

- Trash contains a deleted patch target and restoration is possible;
- DeepSeek API keys and Keychain credential material are absent from child environments;
- watcher behavior across common editors' atomic-save patterns;
- shell cancellation leaves no observed descendant process.

A passing unit test does not prove process-group or Trash behavior on the target system.

## Gate

Phase 4 passes only when:

1. A scripted backend and supervised live `pho` command can search, read, request a patch, request a shell command, obtain controlling-terminal approval or denial, receive each result, and continue to a final response inside a disposable temporary workspace.
2. File search uses the `fff_search` in-memory index and fuzzy ranking; content search uses that index plus the qualified no-follow in-process matcher, and neither implementation spawns `find`, `grep`, or `rg` or enables the unsafe 0.9.6 watcher/grep reader.
3. Search-index startup, staleness, and failure are visible and bounded.
4. `read_file` returns stable numbered UTF-8 windows without blocking command or GPUI presentation and without `io_uring`.
5. Every patch and shell call requires an exact per-call user decision.
6. Denial produces no side effect and returns a structured denied result.
7. Path and symlink escapes fail before access.
8. Patch preflight and stale-source checks prevent applying a different diff than the one approved.
9. Mutation-recovery artifact acknowledgements are complete and digest-bound before effects; cap exhaustion, truncation, refusal, or digest mismatch causes zero mutation. Phase 5 owns persistent durability before ordinary-workspace enablement.
10. Patch cancellation before mutation is side-effect free; cancellation after commit begins stops later forward steps and reports rollback or exact uncertainty honestly.
11. Shell timeout and cancellation terminate and reap the process group under tested conditions.
12. Every preview and artifact write request has an explicit hard limit and truncation metadata, and writer refusal is visible.
13. Diagnostics contain no credential, raw environment, file content, diff, command output, or unrestricted command string by default.
14. TTY, non-TTY, explicit-stdin, broken-pipe, and signal behavior cannot bypass approval or leave an owned effect running.
15. Fixture, temporary-workspace, live-model, and manual-macOS evidence are reported separately.
16. Patch and shell remain unavailable to ordinary personal workspaces until the Phase 5 durability gate passes.
