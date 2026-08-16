# Pho Code v3 implementation plan

## Status and use

Closed implementation plan for **V3 — Change Control and Recovery**. The owner selected live apply with later Approve/Undo, precise Pi `write`/`edit` tracking first, and a read-only file/diff workbench on 2026-08-15, then accepted Milestones 0–3 on 2026-08-16. Closure evidence lives in [`logs/2026-08-16-v3-acceptance-review.md`](./logs/2026-08-16-v3-acceptance-review.md).

Read the product contract in [`product.md`](./product.md), the accepted architecture in [`../../architecture/overview.md`](../../architecture/overview.md), and the archived v2 implementation record in [`../../archive/v2/implementation-plan-v2.md`](../../archive/v2/implementation-plan-v2.md) before implementation.

## Global acceptance rules

Every v3 milestone must:

- preserve `renderer -> protocol <- shell adapter -> application -> runtime -> Pi SDK`;
- keep Pi `0.84.1` as the agent/session authority unless a separate reviewed upgrade changes the pin;
- keep the renderer read-only with respect to filesystem authority;
- route exact-path reads, snapshots, hashing, atomic restoration, and OS Trash through injected privileged interfaces;
- key change state by `{workspaceId, sessionId, runId}` and never infer ownership from the currently selected chat;
- capture before-state before mutation and after-state after settlement, or mark the record indeterminate;
- refuse automatic undo when current content differs from the recorded agent result;
- preserve unrelated owner changes, pre-existing Git dirt, reference submodules, credentials, sessions, and packaged resources;
- never use permanent deletion, `git reset`, force checkout, or broad repository restoration;
- keep protocol values bounded and JSON-safe, with no absolute snapshot paths or blob handles;
- distinguish unit, integration, desktop, packaged, owner-verified, and unverified evidence;
- update product, architecture, development, current-state, and roadmap documents only when the corresponding implementation boundary is accepted.

## Representative decision: trustworthy capture around Pi tools

### Why this is first

The workbench is useful only if its before/after record is trustworthy. The first vertical slice therefore proves the ordering and identity of Pi's public hooks before adding significant UI.

The current runtime already receives `tool_execution_start`, `tool_execution_update`, and `tool_execution_end` events with tool-call identity. The baked extension seam also supports `tool_call` before execution. The implementation must characterize installed Pi `0.84.1` and prove:

1. the chosen pre-execution hook runs before the built-in `write` or `edit` mutates the filesystem;
2. its event exposes or can be correlated to the same stable tool-call identity observed at execution end;
3. arguments can be decoded using the installed built-in tool schemas rather than guessed strings;
4. the hook is rebound for every independently owned `SessionController`;
5. failures, cancellation, session disposal, and process interruption cannot produce a false “safely undoable” record.

If the public hook cannot prove those properties, stop the milestone and promote a narrow architecture decision for application-owned `write`/`edit` wrappers. Do not monkey-patch Pi internals, parse transcript text, race a filesystem read from the renderer, or claim that a `tool_execution_start` event is pre-mutation without evidence.

### Selected model

The intended runtime flow is:

1. permission policy admits the Pi `write` or `edit` call;
2. a runtime-owned observer resolves the exact canonical workspace target and captures absence or the bounded regular-file pre-image;
3. Pi executes its existing built-in tool;
4. execution settlement triggers post-image capture even when the tool reports failure;
5. the ledger atomically commits the correlated operation record;
6. the application publishes a bounded review summary for the owning session/run;
7. Approve changes only ledger review state;
8. Undo performs a fresh path/hash validation and a preview before any restoration.

The observer never changes the permission decision and never silently retries a failed tool.

## State and storage design

### Identities

Use explicit versioned identifiers:

```ts
interface ChangeScope {
  workspaceId: string;
  sessionId: string;
  runId: string;
}

interface ToolChangeIdentity extends ChangeScope {
  toolCallId: string;
  toolName: "write" | "edit";
}
```

One visible `FileChangeRecord` is keyed by scope plus normalized workspace-relative path. An ordered operation list retains every tool call that contributed to that file during the run.

### Manifest state

The durable manifest needs enough information to recover without becoming a second transcript:

```ts
type ReviewStatus =
  | "capturing"
  | "pending"
  | "approved"
  | "undoing"
  | "undone"
  | "conflict"
  | "unavailable"
  | "indeterminate";

interface FileChangeRecord {
  workspaceId: string;
  sessionId: string;
  runId: string;
  relativePath: string;
  kind: "created" | "modified";
  status: ReviewStatus;
  beforeHash?: string;
  afterHash?: string;
  beforeBlobId?: string;
  afterBlobId?: string;
  byteLengthBefore?: number;
  byteLengthAfter?: number;
  firstToolCallId: string;
  latestToolCallId: string;
  startedAt: string;
  updatedAt: string;
  limitation?: "too-large" | "binary" | "unsupported-kind" | "outside-workspace" | "capture-failed";
}
```

Exact field names may evolve during protocol design. The invariants may not: hashes describe bytes, missing pre-image distinguishes file creation from capture failure, and an unavailable snapshot never becomes undoable.

### Storage layout

Use an injected `ChangeLedgerStore` rooted beneath application data. A suggested logical layout is:

```text
userData/change-ledger/v1/
├── manifests/
│   └── <opaque-scope-id>.json
└── blobs/
    └── <sha256>
```

The on-disk implementation must use atomic manifest replacement, validate every decoded record, reject path traversal and unknown schema versions, and tolerate an orphan blob or interrupted temporary manifest without blocking ordinary chat. Do not store ledger files in the repository, Pi session directory, packaged resources, or permission logs.

Content-addressed blobs may deduplicate repeated file states. Compression is optional and must be bounded against decompression bombs. Encryption at rest is not promised in personal v3; Settings/current-state documentation must disclose that captured source content is stored in the app data directory.

### Initial bounds

Validate these provisional source-owned bounds in Milestone 0 rather than exposing settings:

- 2 MiB maximum captured bytes per file state;
- 200 attributed paths per run;
- 50 MiB maximum newly referenced blob bytes per run;
- 250 MiB total ledger budget;
- pending review retained across restart until approved, undone, or explicitly superseded;
- approved/undone records eligible for bounded retention after seven days.

If safe recoverable cleanup is not yet available, reaching the total budget makes new captures `unavailable` with a clear diagnostic. It does not permanently delete old data behind the owner's back. A later accepted retention adapter may move obsolete app-owned records to OS Trash in coarse recoverable batches.

## Runtime boundaries

Introduce narrow interfaces behind `HarnessRuntime`:

```ts
interface ChangeCaptureService {
  begin(input: ToolChangeIdentity & { workspacePath: string; args: unknown }): Promise<void>;
  settle(input: ToolChangeIdentity & { isError: boolean }): Promise<FileChangeRecord>;
  reconcileInterrupted(scope: ChangeScope): Promise<void>;
}

interface ChangeReviewRuntime {
  getReviewSet(scope: ChangeScope): Promise<ChangeReviewSetSnapshot>;
  getFileView(input: GetChangeFileViewInput): Promise<ChangeFileViewPage>;
  getDiff(input: GetChangeDiffInput): Promise<ChangeDiffPage>;
  approve(input: ApproveChangesInput): Promise<ChangeReviewSetSnapshot>;
  prepareUndo(input: PrepareUndoInput): Promise<UndoPreview>;
  undo(input: ApplyUndoInput): Promise<ChangeReviewSetSnapshot>;
}
```

Filesystem concerns belong behind injected adapters:

- canonical workspace path resolver;
- bounded regular-file reader and byte hasher;
- atomic file replacement service;
- existing recoverable OS Trash service for unchanged created files;
- versioned change-ledger store.

The runtime imports Pi and correlates tool lifecycle. The application validates commands, resolves composite session ownership, coordinates locks, and projects normalized errors. Electron wires app-data paths and platform adapters. The renderer requests only named review operations.

## Protocol contract

Add explicit JSON-safe commands; do not expose generic `readFile`, `writeFile`, `restorePath`, or `invokeChangeAction` methods.

Expected commands:

- `getChangeReviewSet(ChangeScope)`;
- `getChangeDiff({ ...ChangeScope, relativePath, cursor?, contextLines? })`;
- `getChangeFileView({ ...ChangeScope, relativePath, version: "before" | "agent" | "current", cursor? })`;
- `approveChanges({ ...ChangeScope, relativePaths?, expectedRevision })`;
- `prepareUndoChanges({ ...ChangeScope, relativePaths?, expectedRevision })`;
- `applyUndoChanges({ ...ChangeScope, previewToken })`.

The short-lived, single-use undo preview token binds:

- composite scope and selected relative paths;
- current review-set revision;
- canonical workspace identity;
- expected current hashes and file kinds;
- exact restore/Trash action for every selected path;
- expiry time.

The renderer never submits an absolute target, blob id, replacement text, or desired filesystem content. `applyUndoChanges` rechecks all token-bound facts after acquiring the scope/path locks.

Expected events:

- bounded `changeReviewUpdated` summary for the owning composite session/run;
- no streaming full diff or file content through the general event channel;
- authoritative review snapshots after missed event sequences or renderer reload.

Diff and file pages are requested on demand, size-limited, and safe for JSON serialization. Text is rendered as untrusted content, never injected as HTML.

## Diff and file-view semantics

Use a runtime-owned text diff engine with an exact pinned dependency or a small application-owned algorithm suitable for bounded files. Record dependency license/attribution when applicable.

Milestone 0/1 uses the already-pinned Pi SDK public `generateUnifiedPatch` (`@earendil-works/pi-coding-agent` `0.84.1`, MIT). Do not add a second jsdiff package unless that API becomes insufficient.

- Normalize nothing before hashing; hashes describe exact bytes.
- Detect UTF-8 text conservatively. Unsupported encodings and binary/NUL-containing content receive metadata-only presentation.
- Preserve original line endings in stored bytes and restoration.
- Diff presentation may normalize line boundaries for display only and must disclose `LF`/`CRLF` changes.
- Bound computation time, lines, hunks, and returned characters.
- Default to unified diff. Split view is optional within Milestone 1 after unified view is stable.
- Current view is read fresh through the privileged adapter. If it differs from the recorded after-image, mark the item conflict before showing actions.
- File viewer navigation is restricted to paths already present in the selected review set. It is not an arbitrary workspace browser.

## Approve behavior

Approve is a ledger transition protected by review-set revision:

1. resolve the exact scope and selected pending or conflict paths;
2. refresh current hashes;
3. if a pending item's current hash equals the recorded after-image, mark it approved;
4. if a pending item's current hash differs, mark conflict;
5. if the item is already conflict, Approve records that the owner accepts the current disk state (including later edits) and marks it approved without writing the file;
6. persist the manifest atomically;
7. publish the updated bounded summary.

Conflict must not permanently block Move chat to Trash. Approve on a conflict is the acknowledge-current-disk path. It does not restore or overwrite the file.

Approve never calls Git, writes workspace files, affects permissions, or changes the Pi transcript.

## Undo behavior

### Preview

`prepareUndoChanges` acquires a consistent read of the selected records and current files. It returns one action per path:

- restore recorded bytes;
- move unchanged created file to OS Trash;
- blocked by content conflict;
- blocked by path/type conflict;
- unavailable because no complete pre-image exists.

Whole-set preview succeeds only when every selected item has a defined result. The UI may let the owner deselect blocked items and request a new preview.

### Apply

`applyUndoChanges`:

1. consumes the preview token under a per-scope operation lock;
2. revalidates workspace device/inode identity, file device/inode identity, review revision, canonical paths, kinds, and current hashes;
3. refuses the entire token if any selected fact changed;
4. restores modified files through atomic replacement;
5. moves unchanged created files through the injected OS Trash service;
6. records the resulting current hashes and `undone` state;
7. emits one authoritative review update.

Cross-file filesystem operations cannot be perfectly atomic. To avoid a misleading guarantee, the first slice may apply only one file per token. Whole-set Undo may be promoted only after the implementation defines a journaled operation order, rollback for partial restore, and honest crash reconciliation. The UI may still offer **Undo all** as a sequence only after that design is accepted.

This is a deliberate tightening of the product aspiration: “Undo all” must not imply an atomic transaction that ordinary filesystems and OS Trash cannot provide.

## Concurrency and lifecycle

- Serialize capture settlement, Approve, and Undo per `{workspaceId, sessionId, runId, relativePath}`; unrelated paths may proceed concurrently.
- A second agent edit to the same path in the same run extends the operation chain and updates the visible after-image.
- A later run gets a separate review set. If it edits a path still pending from an earlier run, both records remain, but only the newest after-image matching current bytes can be automatically undone.
- Switching chats never closes or reassigns a review set.
- Archive preserves pending review state because archive changes only visibility metadata.
- Moving a chat to Trash refuses while the session owns pending, capturing, undoing, conflict, or indeterminate review. Archive keeps review records. A later confirmed abandon action is not this slice.
- Application shutdown settles in-flight capture writes under the existing bounded aggregate deadline. Unsettled records remain `capturing`/`indeterminate` for startup reconciliation.
- Startup loads only bounded summaries for remembered sessions. Diff blobs remain lazy.

Chosen chat-removal behavior: refuse Move chat to Trash while it owns pending, capturing, undoing, conflict, or indeterminate review state. The owner first Approves pending matches, Approves conflicts to accept current disk, or Undoes still-matching pending files. Undo all remains unavailable.

## Milestone 0: attributed change ledger

### Outcome

Prove one complete runtime slice around Pi `write` and `edit`: pre-image, tool execution, post-image, durable per-run record, restart reconciliation, and bounded summary. UI may be limited to a compact transcript/tool-card changed-files count plus diagnostics.

### Implementation sequence

1. Characterize Pi `0.84.1` hook/event ordering, schemas, identity, failures, cancellation, and rebind across two session controllers.
2. Decide whether observing built-in tools is sufficient; stop for an architecture decision if application-owned wrappers are required.
3. Add pure hashing, snapshot classification, record validation, scope identity, and state-transition logic.
4. Implement the injected atomic `ChangeLedgerStore` and bounded content-addressed blob store.
5. Add the runtime capture observer and session/run correlation.
6. Reconcile capturing/indeterminate records on startup without claiming unsupported recovery.
7. Add protocol/application summary projections and scoped events.
8. Integrate archive, session switching, bounded shutdown, and session Trash eligibility.
9. Inspect app-data disclosure, filesystem boundaries, diagnostics, and actual diff.

### Acceptance criteria

- a deterministic Pi `write` and `edit` each produce an exact attributed record;
- two writes to one file in one run display one baseline-to-latest pending item while retaining the operation chain;
- failed and interrupted calls cannot become falsely undoable;
- concurrent sessions and background runs never cross-attribute changes;
- oversized, binary, symlink, sensitive, outside-workspace, and unsupported targets degrade safely;
- restart reconstructs pending/indeterminate summaries without reading arbitrary paths from corrupt manifests;
- ledger data remains outside Pi JSONL and the workspace;
- ordinary chat still works if ledger capture is unavailable, but the tool result and review summary disclose that recovery was not captured.

### Proportional verification

- pure state/record/path tests;
- real Pi integration for one `write`, one `edit`, one failure, and two independent sessions;
- one Electron journey proving the changed-file summary follows the owning chat across a session switch;
- packaged proof is optional until Milestone 1 unless the implementation introduces a packaged native dependency.

### Implementation record (2026-08-15)

Implemented in source; **not owner-accepted**. Evidence, corrections, and handoff are recorded in [`logs/2026-08-15-m0-m2-implementation.md`](./logs/2026-08-15-m0-m2-implementation.md).

## Milestone 1: read-only review workbench

### Outcome

Open a bounded workbench from a run's changed-files summary and inspect exact attributed changes without creating a second editor architecture.

### Implementation sequence

1. Add bounded diff and file-view protocol types and commands.
2. Implement exact-byte hashing, conservative text classification, paged file views, and bounded unified diff.
3. Build the workbench shell, file/status list, unified diff, loading/error/conflict states, and keyboard/focus behavior. Keep the bounded before/agent/current file-view bridge available for privileged diagnostics; the product workbench remains unified-diff only.
4. Add per-file Approve with expected-revision and current-hash validation.
5. Add conflict refresh when another editor changes the file.
6. Add review-set Approve all only after per-file transitions are reliable.
7. Verify renderer reload and switching among chats/runs without mixing content.

### Acceptance criteria

- only exact paths in the selected review set can be viewed;
- unified diff and file views are bounded, read-only, syntax-highlighted where supported, and rendered as untrusted text;
- the UI states clearly that changes are already applied;
- Approve closes pending review only when the current bytes still match the agent result;
- conflict, unsupported encoding, binary, oversized, missing, and corrupted snapshot states are understandable;
- approving never changes the workspace, Git, Pi transcript, or permission policy;
- the conversation remains usable while the workbench is open and background change events route correctly.

### Proportional verification

- protocol and pure diff-bound tests;
- component/reducer checks for pending, approved, conflict, unavailable, and paged content;
- one Electron journey: agent edits a file, workbench shows the diff, Approve closes it, and relaunch preserves the accepted state;
- no visual-regression framework or exhaustive diff-library suite.

### Implementation record (2026-08-15)

Implemented in source; **not owner-accepted**. Evidence and corrections are recorded in [`logs/2026-08-15-m0-m2-implementation.md`](./logs/2026-08-15-m0-m2-implementation.md); shared right-sidebar ownership is recorded in the [UI log](../../ui/logs/2026-08-15-change-v3-right-sidebar.md).

## Milestone 2: safe undo and recovery

### Outcome

Undo an unchanged attributed modification without overwriting later owner work, and move an unchanged agent-created file to OS Trash. Pending state survives restart and conflicted files remain reviewable.

### Implementation sequence

1. Implement undo preview tokens, revisions, per-path locks, and expiry.
2. Implement atomic byte restoration for one modified regular file.
3. Reuse the accepted recoverable Trash adapter for one unchanged created file.
4. Add per-file Undo UI and exact effect preview.
5. Add conflict/current-state comparison and refresh.
6. Add crash reconciliation for `undoing` and interrupted manifest transitions.
7. Decide and implement whole-set Undo only if journaled partial-failure semantics are accepted; otherwise keep it explicitly unavailable and document the limit.
8. Add bounded storage diagnostics and accepted retention behavior.

### Acceptance criteria

- Undo refuses when current bytes, canonical path, kind, workspace identity, or review revision changed;
- a safe modified file restores exact pre-image bytes;
- a safe created file reaches OS Trash with no permanent fallback;
- a user edit after the agent result disables automatic undo and remains untouched;
- preview and apply cannot be retargeted with renderer-controlled paths or stale tokens;
- interruption never reports a partially applied operation as fully undone;
- Approve/Undo state survives renderer reload, chat switching, archive, and application restart;
- pending recovery storage is bounded and disclosed.

### Proportional verification

- pure token/state/hash/conflict tests;
- runtime integration for modified-file restore, created-file Trash, stale preview, and interrupted state;
- one Electron journey covering Approve, safe Undo, and conflict refusal;
- one packaged macOS journey proving the real Trash path and app-data ledger work without a Pi CLI;
- owner-approved disposable-workspace proof that a post-agent overwrite creates a conflict and remains untouched.

### Implementation record (2026-08-15)

Implemented in source. Review corrections, the residual TOCTOU, and verification boundaries are recorded in [`logs/2026-08-15-m0-m2-implementation.md`](./logs/2026-08-15-m0-m2-implementation.md); final acceptance is recorded in [`logs/2026-08-16-v3-acceptance-review.md`](./logs/2026-08-16-v3-acceptance-review.md).

## Milestone 3: hardening, product completeness, and acceptance

### Outcome

Close the concrete safety, correctness, boundedness, and product-contract gaps found in the independent Milestones 0–2 review. Milestone 3 does not add broader shell mutation tracking or Undo all. It makes the existing Pi `write`/`edit` slice trustworthy enough for owner acceptance, then runs the complete V3 gate.

The review findings and file-level handoff are recorded in [`logs/2026-08-16-m3-review-handoff.md`](./logs/2026-08-16-m3-review-handoff.md). Treat that record and this milestone as the implementation contract; do not replace the listed cases with generic cleanup.

### Required implementation order

1. **Make every capture outcome persistable and honest.**
   - Never place an absolute path, traversal path, or other unsafe raw tool argument in a field defined as workspace-relative.
   - Represent outside-workspace, malformed, over-limit, and otherwise untrackable calls with a bounded redacted diagnostic or unavailable record that can be saved safely.
   - When the 200-path or per-run byte cap is reached, disclose that subsequent write/edit recovery was not captured; do not silently return without a record or run-level diagnostic.
   - Add real Pi characterization for an outside-workspace argument and a path-cap overflow.
2. **Harden the ledger and blob trust boundary.**
   - Bound manifest file bytes before JSON parsing; bound file and operation counts, every persisted string, numeric fields, timestamps, hashes, blob identifiers, and aggregate projected output.
   - Reject duplicate file identities, duplicate/conflicting tool-call identities, non-finite or negative sizes, invalid state/field combinations, unknown schema versions, and unsafe operation paths.
   - Verify a blob's bytes hash to its content-addressed blob id before using it for diff, file view, preview, or restoration. Corruption must become a bounded review diagnostic and must never display or restore bytes under a false identity.
   - Keep ordinary chat available when one ledger record is corrupt. Do not silently reinterpret corruption as a missing clean record.
3. **Validate every change-review command before privileged work.**
   - Add source-owned bounds and runtime validation for scope ids, relative paths, cursor/token strings, `contextLines`, and `relativePaths`.
   - Require `relativePaths` to contain bounded unique strings and cap the list to the review-set path limit. Reject malformed arrays with `invalid_command` instead of allowing a JavaScript `TypeError`.
   - Parse paging cursors strictly; malformed, overflowing, or out-of-range cursors fail with a bounded normalized error rather than restarting at page zero.
   - Preserve the named bridge and renderer non-authority; do not add generic file or recovery IPC.
4. **Make bounded diff presentation exact.**
   - Preserve every character of an oversized changed line across pages, or explicitly return a typed line-truncation limitation. Never advance to the next line while dropping the remainder.
   - Bound diff input complexity before calling Pi's synchronous `generateUnifiedPatch`: file bytes alone are not a sufficient CPU bound. Define and test line-count and generated-patch limits, and degrade honestly instead of blocking Electron main on pathological input.
   - Verify stored before/after blobs before generating a diff.
5. **Finish the workbench contract or narrow it explicitly with owner approval.**
   - Implement safe syntax highlighting where supported, in-sheet search, whitespace visibility, and bounded context expansion promised by [`product.md`](./product.md), while retaining unified diff as the only workbench view.
   - Keep all diff text as React text nodes or another sanitizing renderer; no raw HTML or renderer filesystem access.
   - Verify keyboard operation, visible focus, reduced motion, light/dark palettes, narrow sidebar widths, long paths/lines, loading/error/conflict states, and conversation usability while the sheet is open.
   - If the owner rejects one of these product requirements, amend `product.md` and this plan in the same change before claiming completion; a silent deferral is not acceptance.
6. **Reassess recovery durability and the residual race.**
   - Preserve exact bytes and the existing no-overwrite identity/hash checks. Test file replacement, symlink/type changes, workspace replacement, preview expiry, concurrent review refresh, and owner edits during preparation.
   - Decide and document metadata behavior for mode bits and other metadata affected by atomic replacement. Preserve required mode bits or state the accepted limitation in product/UI copy.
   - Reassess directory durability around temporary-file creation and rename. Add the narrow fsync behavior required by the accepted crash contract, if any.
   - Keep the residual path-based `rename`/Trash TOCTOU explicit. Do not claim kernel compare-and-swap safety and do not introduce permanent deletion or Git restoration.
7. **Run review and acceptance as fresh evidence.**
   - Add focused regression tests for every item above before running broad gates.
   - Perform the external-editor conflict proof in an owned disposable workspace.
   - Run an independent defect-first review of capture ordering, path handling, ledger decoding, blob integrity, IPC bounds, diff complexity/paging, preview-token binding, atomic restore, Trash, restart reconciliation, and concurrent session ownership.
   - Run the complete V3 exit checks and record exact commands/results in a new dated acceptance log. Do not copy prior PASS counts.

### Acceptance criteria

- outside-workspace, malformed, capped, failed, and interrupted write/edit calls always produce a persistable bounded diagnostic without leaking an absolute tool path through protocol data;
- corrupt, oversized, contradictory, or unsupported manifests and blobs fail closed for review/recovery while ordinary chat remains usable;
- no renderer-supplied change-review payload can trigger an unbounded array/string operation, generic exception, arbitrary path read/write, or stale-token reuse;
- diff/file pages are deterministic and lossless within their typed bounds, and pathological diff input cannot monopolize Electron main without a bounded fallback;
- the workbench meets the product's syntax, search, whitespace, context, keyboard, focus, theme, and conversation-priority requirements, or the owner has explicitly narrowed the product contract;
- modified-file Undo preserves the accepted byte and metadata contract, and every identity/hash/type/workspace/revision mismatch refuses without changing the target;
- created-file Undo still uses only operating-system Trash, with no permanent fallback;
- restart reconciliation and journaled temporary-file handling never label an ambiguous or partial result as safely undone;
- the owner-approved disposable-workspace conflict proof passes;
- no P0/P1 review finding remains open, every P2 is fixed or explicitly owner-accepted with rationale, and all V3 exit checks pass with fresh recorded evidence.

### Proportional verification

- protocol/application tests for malformed scopes, arrays, cursors, revisions, and tokens;
- store/runtime tests for oversized and corrupt manifests, contradictory records, blob tampering, outside-workspace capture, cap overflow, long-line paging, pathological diff input, metadata behavior, and recovery races;
- real Pi `0.84.1` integration for `write`, `edit`, failure, outside-workspace refusal/degradation, two sessions, and restart reconciliation;
- Electron journeys for diff search/whitespace/context controls, Approve, Undo, conflict, keyboard/focus, reload, and chat switching;
- packaged macOS journeys for app-data ledger integrity and real OS Trash without a Pi CLI;
- owner-approved conflict verification in an owned disposable workspace;
- the root and packaged commands listed under **V3 exit checks**.

### Stop conditions and non-goals

Stop and write a narrow decision record if fixing a finding would require replacing Pi's built-in tools, moving recovery authority into the renderer, claiming filesystem transactionality, or changing the live-apply product model.

Milestone 3 does not implement Undo all, arbitrary shell/MCP mutation recovery, filesystem watching, Git operations, a manual editor, terminal behavior, public-distribution hardening, or a generic retention/settings engine.

## Deferred extension: broader workspace mutation observation

Shell commands, formatters, generators, package scripts, MCP tools, and external editors can change files outside Pi `write`/`edit`. Broader observation is not required for v3 completion.

A later promoted phase must choose among:

- bounded before/after workspace fingerprinting;
- filesystem watching with overflow and rename semantics;
- Git worktree/patch isolation;
- application-owned wrappers for selected mutating tools;
- operating-system or container isolation.

Any approach must distinguish detection from attribution, respect ignored/generated directories and non-Git workspaces, handle large repositories, avoid reading sensitive files merely to compute a diff, and admit that filesystem watchers can miss events. Until then, UI copy says **Tracked write/edit changes**, not **All changes**.

## V3 exit checks

Use focused checks during milestones. Before v3 acceptance, run the root contract relevant to the final code:

```bash
bun run typecheck
bun run lint
bun test
bun run test:desktop
bun run build
bun run package:mac
bun run test:packaged
```

Do not add broad test matrices merely to increase counts. The irreplaceable evidence is real Pi hook ordering, composite-session attribution, conflict-safe recovery, renderer/IPC boundaries, restart reconciliation, and real macOS Trash behavior.

## V3 acceptance gate

V3 may be accepted only when:

- Pi `write` and `edit` are precisely attributed to the correct workspace/chat/run;
- changes remain live immediately and the UI does not describe Approve as filesystem or Git persistence;
- the bounded read-only workbench displays exact tracked diffs and file states;
- Approve changes only review state;
- Undo restores only when the current file still equals the recorded agent result;
- newly created files use OS Trash and permanent-deletion fallbacks remain impossible;
- conflicts preserve newer owner/external edits;
- pending review and interrupted states recover after restart;
- accepted desktop and packaged evidence exists on macOS;
- limitations for shell and external changes are visible and accurate;
- an independent review inspects hook ordering, path resolution, hashes, snapshot persistence, preview-token binding, atomic restoration, Trash, IPC bounds, and concurrent session ownership.
