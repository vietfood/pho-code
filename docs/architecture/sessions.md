# Session, artifact, and recovery architecture

- Status: Normative V1 design
- Last updated: 2026-07-14
- Governing decision: [ADR 0003](../decisions/0003-deepseek-api-first-backend.md)
- System context: [Native harness system](native-harness-system.md)
- Implementation phase: [Phase 5](../implementation/v1/phase-5-sessions.md)

## Purpose

This document is the single source of truth for Pho Code V1 session persistence, output artifacts, reconstruction, context replay, crash recovery, and context exhaustion. The system architecture owns component relationships; the Phase 5 plan owns implementation order.

## Ownership and invariants

Pho Code owns a versioned append-only local journal. The in-memory transcript is a derived projection, not another database. The provider is not relied on for thread storage because V1 reconstructs and sends complete required DeepSeek chat history for every request.

The persistence contract has these invariants:

1. Valid logical records are never rewritten to update turn state. Recovering a torn byte tail may copy the byte-exact valid prefix into a replacement only after the entire damaged original is preserved.
2. Record sequence, not timestamp, defines order.
3. Completed provider items and completed tool results are durable; high-frequency deltas are transient.
4. A side effect is never repeated merely because its terminal record is missing.
5. Approval validity never survives restart.
6. API keys, raw headers, environment values, authorization material, and process handles never enter sessions or artifacts.
7. Required provider call IDs and bounded provider-returned reasoning may be persisted; reasoning is rendered only as sensitive provider content and never logged diagnostically.
8. Truncation and missing artifacts are explicit.
9. V1 never compacts, branches, or silently drops model-visible history.

## Journal format

Each session is one UTF-8 JSONL file. Every line is a complete versioned envelope:

```json
{
  "schema_version": 1,
  "sequence": 42,
  "recorded_at": "2026-07-14T12:34:56.000Z",
  "session_id": "local-session-id",
  "kind": "tool_execution_completed",
  "payload": {}
}
```

`sequence` increases monotonically within a session. Duplicate or decreasing values are corruption. Timestamps support display and diagnosis but never repair ordering.

### Required V1 records

```text
session_created
session_metadata_updated
turn_started
user_message_completed
backend_request_started
assistant_phase_completed
tool_call_completed
approval_requested
approval_resolved
tool_execution_started
tool_effect_progress
tool_execution_completed
tool_result_completed
usage_observed
turn_completed
turn_failed
turn_cancelled
turn_interrupted
turn_uncertain
diagnostic_recorded
```

Each effect-bearing record includes stable local identities and only the provider identities required for exact replay. `assistant_phase_completed` groups assistant text, provider-returned reasoning, its replay requirement, and ordered completed tool calls exactly as the backend completed them. `tool_execution_started` and `tool_execution_completed` describe an actual executor run. `tool_effect_progress` records a started or completed patch/rollback step with its ordered step index, validated effect digest, relative path, operation, and recovery reference. `tool_result_completed` stores every terminal model-visible result, including denial or validation failure when no executor ran. Tool records preserve exact call/result pairing. Approval records preserve identity and effect digest but do not grant permission after reconstruction.

`usage_observed` stores the provider-returned prompt, cache-hit, cache-miss, output, reasoning, and total token fields exactly as bounded optional integers, plus request identity, observation time, and the pinned backend/model/thinking profile revision. If Pho Code computed a cost estimate, the record also names the dated price-profile revision, currency, and explicitly estimated amount. A later price update never rewrites historical usage or estimates, and no session record claims provider balance or authoritative billed cost.

Streaming text, reasoning, and argument deltas are not required records. If the process dies before the authoritative completed item, recovery reports an interrupted turn rather than presenting a partial delta as durable content.

### Schema evolution

Readers accept unknown optional fields in a known schema version. An unknown required version or missing required field opens the session read-only with an actionable error. V1 does not rewrite or auto-migrate a session it cannot interpret.

Future migration writes a new version or explicit migration record and must preserve the original through recoverable backup. It does not edit historical lines in place.

## Storage location and privacy

Sessions and artifacts live under Pho Code's macOS Application Support directory, not inside the source workspace. On supported macOS, journals, temporary files, artifacts, damaged-tail recovery files, and replacements are created with user-only permissions independent of the process umask; failure to establish them prevents writable use. A session stores the canonical workspace path needed for resume but ordinary logs do not copy it.

Session content is sensitive even without credentials: it can include prompts, full provider-returned reasoning, file excerpts, commands, diffs, tool results, and exact provider continuation data. V1 relies on the user's macOS account and filesystem protection unless a later decision adds application-level encryption.

## Durability boundaries

One serialized writer owns sequence allocation, append, flush, error state, and close. Presentation adapters and the loop submit typed intents/events; they never write JSONL directly.

Records whose absence could cause an effect to be repeated or its input to disappear are flushed at these boundaries:

- `turn_started` and `user_message_completed` before `backend_request_started`; all three are durable before sending the model request;
- `approval_resolved` and `tool_execution_started` before patch or shell mutation;
- required recovery artifacts and `tool_effect_progress(stage = started)` before each patch or rollback step;
- `tool_effect_progress(stage = completed)` after an observed step and before the next step begins;
- `tool_execution_completed` and the paired `tool_result_completed` before that result enters the next model request;
- terminal turn status before any presentation reports durable completion.

If any required append or flush fails, the owner starts no later effect. A failure after an effect but before its completion record stops the remaining plan and reports the started step as uncertain.

A successful Rust write without the configured flush boundary is not crash-durable completion. Writer failure moves the session into an explicit persistence-failed state and prevents new effects whose safe reconstruction depends on later records.

V1 may use blocking file APIs on the bounded background executor because writes are small and serialized. It must not block command or GPUI render paths.

## Artifact storage

Large shell output, patch recovery bytes, and other bounded overflow live in per-session artifact files referenced by opaque `ArtifactId`. JSONL stores safe metadata: artifact identity, owning session/turn/tool identities, purpose, type, byte count, digest, encoding/classification, truncation, and commit state.

Artifacts write through a temporary file in the destination directory, flush the file, rename on successful completion, and flush the containing directory before returning a committed `ArtifactId`. The store applies named per-artifact, per-session, and global limits. Ordinary output may return explicit truncation or refusal at a limit. A mutation-recovery artifact is all-or-nothing: it commits complete bytes, required metadata, and digest or refuses before the related effect; it is never truncated.

The tool runtime owns deterministic previews and omission metadata according to [the tool output contract](tools.md#output-artifact-requests-and-truncation). A presentation adapter may open a retained artifact through its opaque identity but must label it missing, incomplete, or truncated when applicable.

Cleanup is not automatic in V1. Any future removal action must follow the recoverable macOS Trash policy and update references visibly rather than leaving silent broken links.

## Startup recovery

Recovery scans complete lines in sequence until EOF or the first invalid record.

- Trailing bytes without a newline after a valid prefix are a recoverable torn tail. The store closes the writer, writes and flushes a sibling replacement containing the byte-exact valid prefix plus the next sequenced recovery diagnostic, atomically renames the intact damaged original to a unique recovery file, renames the replacement into the active path, and flushes the directory. The damaged original is retained with restrictive permissions and is never overwritten or automatically deleted. If any replacement step fails or startup finds an interrupted replacement, the intact candidate files remain and the session opens read-only with an actionable recovery state; the store never appends behind invalid bytes.
- A malformed newline-terminated record, corruption before the trailing fragment, duplicate/decreasing sequence, or unknown required schema makes the session read-only. It is not silently classified as a torn write.
- An unresolved approval is invalidated and recorded as interrupted.
- Any `turn_started` without a terminal turn record is recovered explicitly by its last durable stage: before `user_message_completed`, after the user message but before `backend_request_started`, or after the request began. It becomes `turn_interrupted` unless an uncertain local effect requires `turn_uncertain`. A preserved user message or request is never sent automatically on restart.
- `tool_effect_progress(stage = started)` without its matching completion identifies that step's path as uncertain; later unstarted steps are not treated as attempted. `tool_execution_started` without a terminal execution/result record also produces `turn_uncertain`. Neither the tool nor a rollback is rerun automatically.
- `tool_execution_completed` without the paired `tool_result_completed` shows the execution as terminal but marks the turn interrupted with a missing model-visible result. Recovery does not synthesize a result, continue the provider request, or rerun the tool.
- A completed tool result not yet sent to the provider remains durable and may be used only through a new explicit continuation decision that preserves pairing.
- A missing workspace permits offline inspection but disables new tool/model work until the workspace is explicitly relocated or reopened.

Recovery adds evidence; it does not rewrite the previous record or infer an effect from the absence of a line. The user can inspect the workspace and start new work after acknowledging uncertainty.

## Projection reconstruction

The reducer rebuilds canonical state by applying durable records in sequence. Given the same valid record prefix, it must produce the same completed transcript, assistant-phase grouping, terminal statuses, tool results, usage, and compatibility metadata.

Transient running handles, cancellation tokens, live channels, search indexes, and approval capabilities are never reconstructed. They are new process state.

Every reconstructed presentation can distinguish completed, failed, cancelled, interrupted, and uncertain turns. A later diagnostic may annotate a terminal item but cannot return it to a running state.

## Model-context reconstruction

The context builder uses only canonical completed records:

- completed user messages and assistant phases;
- assistant text, provider-returned reasoning, replay requirement, and completed calls in their original phase grouping;
- exact completed tool calls and their paired results;
- the pinned backend/model/thinking compatibility profile.

It excludes interrupted deltas, unresolved approvals, incomplete tool arguments, presentation-only rows, diagnostics, and process output beyond the bounded model-visible result.

V1 sends full retained history. Before a request it estimates whether the complete required context fits and returns `Fits`, `NearLimit`, `CannotFit`, or `CannotReplay`. It never removes old items, separates a call from its result, or separates required reasoning from its assistant phase. `CannotFit` rejects the request and offers a new session. `CannotReplay` identifies missing or inconsistent provider-required phase data. Provider context rejection remains a visible turn failure because local estimates are not proof.

## Concurrency and limits

- One writer owns one session file.
- Append requests use a bounded queue; completed/effect-boundary records are never silently dropped.
- Record, payload, line, artifact, session, and diagnostic sizes have named limits.
- Flush and artifact work run off the render path.
- Only one active root turn/tool in V1 can create effect-boundary records, but the store still rejects duplicate terminal records by identity.

## Failure behavior

Errors include operation, session/turn/tool/artifact identity, sequence when known, and safe storage state. Ordinary logs exclude record payload, prompt, provider reasoning, file content, output, path, account data, and provider replay values.

Disk full, permission failure, rename failure, flush failure, missing artifact, and corruption are different user-visible categories. None is converted into a successful turn merely because the model or tool already appeared to finish on screen.

## Verification handoff

[Phase 5](../implementation/v1/phase-5-sessions.md#verification) owns the executable crash and recovery matrix; [its gate](../implementation/v1/phase-5-sessions.md#gate) owns acceptance evidence. This architecture remains the source for the journal, durability, reconstruction, and recovery behavior those checks must prove.
