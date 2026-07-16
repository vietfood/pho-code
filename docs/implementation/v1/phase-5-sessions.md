# Phase 5: Sessions and recovery

- Status: **PASS — 2026-07-17** ([evidence](../evidence/phase-5-2026-07-17.md))
- Depends on: [Phase 4](phase-4-tools.md)
- Produces: Versioned JSONL, persistent artifacts, reconstruction, honest crash recovery, safe tool enablement, and stable pre-GPUI `pho` release
- Next: [Phase 6](phase-6-gpui.md)

## Required reading

1. [Session, artifact, and recovery architecture](../../architecture/sessions.md)
2. [System state and event flow](../../architecture/native-harness-system.md)
3. [DeepSeek message and reasoning replay](../../architecture/deepseek-api-backend.md#message-projection)
4. [Command-mode lifecycle](../../architecture/native-harness-system.md#presentation-adapters-and-application-lifecycle)

## Outcome

The canonical trace survives restart without replaying approvals, repeating tools, promoting incomplete streams to success, or losing assistant-phase reasoning/call identities required for continuation. `pho` becomes a coherent durable command application with session create/list/resume behavior. Phase 4 patch and shell can be enabled for personal workspaces only after this phase proves the persistent pre-effect boundary.

## Work order

1. Implement the versioned record envelope and record kinds defined by [the session journal](../../architecture/sessions.md#journal-format).
2. Implement one serialized writer with user-message/request ordering, pre-effect flushes, patch step-progress records, paired terminal tool results, and terminal-turn boundaries from [durability](../../architecture/sessions.md#durability-boundaries).
3. Implement the persistent artifact writer, atomic commit, classifications, per-artifact/per-session/global limits, and recovery-file handling from [artifact storage](../../architecture/sessions.md#artifact-storage), then connect it to the Phase 4 boundary.
4. Implement startup scan, torn-tail handling, schema validation, and deterministic projection reconstruction from [recovery](../../architecture/sessions.md#startup-recovery).
5. Invalidate unresolved approvals, mark open backend work interrupted, and mark started tools without terminal results uncertain; never rerun them.
6. Rebuild the next backend context only from canonical completed records and preserve assistant text/reasoning/call grouping, exact call/results, and the pinned DeepSeek model/thinking profile.
7. Implement explicit near-limit/cannot-fit behavior; offer a new session without truncation or native compaction.
8. Connect reconstructed state to the same reducer used by live execution.
9. Add `pho session list`, explicit new-session selection, and `pho session resume <session-id>` through typed application intents. Session IDs are bounded opaque local IDs; commands never accept arbitrary journal paths.
10. Make ordinary `pho chat` durable by default after session selection/creation, while retaining any explicitly named ephemeral developer path outside the release command surface.
11. Render reconstructed, interrupted, uncertain, read-only, missing-workspace, and cannot-replay state through the same canonical terminal projection used during live execution.
12. Remove the Phase 4 developer/test-only mutation gate only after the production writer and artifact store pass the crash matrix.

## Verification

The following checks are the canonical Phase 5 fault matrix:

- envelope round-trip, known/unknown fields, sequence allocation, and stable replay;
- recoverable torn tail, malformed newline-terminated final record, malformed middle line, interrupted tail replacement, duplicate/decreasing sequence, and unknown required schema;
- disk full, permission denial, append/flush failure, artifact write/file-flush/rename/directory-flush failure, and missing artifact;
- user-message/backend-request ordering and crash after each boundary;
- crash after approval, before and after tool-start flush, before and after each patch effect-progress record, during rollback, during shell, between execution completion and paired tool-result completion, after tool result, and during provider stream;
- restart invalidation of approvals and no rerun of uncertain tools;
- denied and validation-error `tool_result_completed` records without false execution records;
- `turn_interrupted` and `turn_uncertain` round-trip from each nonterminal recovery stage without automatic prompt/request/tool replay;
- exact assistant-phase text/reasoning/call grouping and tool-result round-trip;
- deterministic projection from the same valid record prefix;
- missing workspace and offline inspection;
- near-limit/cannot-fit behavior without silent context loss;
- append-queue saturation; oversized record, payload, and line refusal; per-artifact, per-session, and global artifact limits; ordinary-output truncation/refusal metadata; mutation-recovery cap exhaustion with all-or-nothing refusal and zero effects; and preservation of terminal/effect-boundary records under overload;
- under a deliberately permissive umask, journal, temporary, artifact, damaged-tail recovery, and replacement files retain user-only permissions through creation and rename;
- seeded credential/account/header values absent from journal, artifact metadata, errors, and logs;
- `pho session list/resume`, new-session creation, invalid/unknown ID, missing workspace, offline inspection, and no arbitrary journal-path access;
- command restart after every major durability boundary, SIGINT, broken pipe, terminal loss, and process death without automatic prompt/request/tool replay.

Use a child test binary terminated at controlled barriers for the most important crash-durability claims. In-memory injection alone cannot prove OS-visible flush and process-death behavior.

## Gate

Phase 5 passes when a completed session reconstructs the same canonical trace and assistant phases, a torn tail preserves the intact original and yields a valid active journal, corruption is visible, unresolved approvals are invalid and never replayed, started patch steps identify exact uncertain paths, interrupted and uncertain turns reconstruct distinctly, an execution missing its paired model result is neither synthesized nor rerun, paired denial/execution results and required DeepSeek reasoning/call state survive JSONL round-trip, all queues/records/artifacts remain within named limits and user-only permissions, and API keys remain absent from sessions and artifacts. `pho` must list/resume sessions, complete a supervised coding task, and recover an interrupted run through the same runtime. Only then may patch and shell be enabled for ordinary personal workspaces and the stable pre-GPUI command release be declared.
