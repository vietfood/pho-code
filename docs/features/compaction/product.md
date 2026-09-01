# Product definition: context compaction

## Status

Owner-promoted standalone add-on, 2026-08-20. This is **not** a numbered version and does not promote session tree/fork, a new transcript format, or an OpenAI-specific transport.

Pi-native automatic compaction already exists in production through the pinned Pi SDK `0.84.4`. The implementation contract is [`implementation-plan.md`](./implementation-plan.md). Status is **In implementation** until that plan's acceptance gate passes.

On 2026-09-01 the owner promoted the **Pho cutover** strategy as Milestones 3–4, gated on Milestone 2 acceptance: pho-agent's Pi wrapper uses Pho's own notes-first cutover for every trigger, OpenAI models target a separately gated provider-native OpenAI path, and ACP/Codex backends keep their own compaction. Evidence and design: [`logs/2026-09-01-model-driven-cutover-research.md`](./logs/2026-09-01-model-driven-cutover-research.md) and [`logs/2026-09-01-pho-cutover-strategy.md`](./logs/2026-09-01-pho-cutover-strategy.md).

## Outcome

Long-running chats continue after their active model context becomes crowded without making the owner guess whether older work was summarized. The owner can:

- see compaction start, settle, abort, or fail on the chat that owns it;
- keep reading the complete active-branch display transcript across a compaction boundary;
- expand a boundary marker to inspect the readable Pi summary;
- request compaction deliberately while the chat is idle and cancel that request;
- understand the difference between the full Pi transcript, the smaller context sent to the next model call, and cumulative token/cost totals.

Pi remains the compaction and JSONL authority. Pho Code projects and explains the lifecycle; it does not implement another summarizer or agent loop.

## Audience and trust model

This add-on retains the accepted personal, trusted-workspace assumptions:

- Pi and the active provider receive the context needed to generate a compaction summary;
- summaries are model-generated and can omit, distort, or overemphasize earlier details;
- the full active branch remains in the Pi JSONL session even when older entries stop entering model context;
- automatic behavior follows the effective Pi settings under Pho Code's active Pi data root;
- macOS is the first verified surface and Linux remains compatibility-oriented until exercised;
- renderer sandboxing does not isolate Pi, provider requests, or baked extension code.

Compaction is context management, not backup, encryption, deletion, cost reset, or a sandbox.

## Selected product decisions

| Decision | Selection |
| --- | --- |
| First release | **Pi-native only.** Use pinned `AgentSession.compact()` and Pi lifecycle events for every supported provider. |
| Automatic policy | **Keep Pi's effective setting and defaults.** Do not add a Pho Code auto-compaction toggle or threshold editor. |
| Manual action | **One idle-only `Compact context` action.** No custom instructions in the first release. A busy chat asks the owner to Stop or wait; the action never aborts a run implicitly. |
| Cancellation | **Dedicated cancel intent.** Manual compaction has no run id, so cancellation calls pinned `abortCompaction()` through a named command. Existing Stop continues to cancel automatic compaction inside a live run. |
| Placement | **Existing usage control.** Put Compact context and its explanation in the composer usage popover; do not add another sidebar surface. |
| Transcript | **Display history is not model context.** Rebuild the full active-branch display transcript from Pi entries and insert an inline compaction boundary. Do not render only `session.messages`, which is the reduced model context after compaction. |
| Summary disclosure | **On demand and bounded.** The marker fetches the readable Pi summary by validated compaction-entry id. Summary Markdown is untrusted and uses the existing sanitizer. |
| Persisted reason | **Do not invent it.** Pinned Pi persists the compaction entry but not its trigger reason. Live UI may show manual/threshold/overflow; a marker reconstructed after restart says only Context compacted unless Pi data establishes more. |
| Provider-native path | **Deferred.** No `pi-openai-server-compaction`, direct Responses override, opaque artifact, WebSocket path, `store` change, or provider-specific setting enters this add-on's acceptance gate. |
| Pho cutover (M3–M4) | **Pho-owned strategy for the Pi wrapper.** A `session_before_compact` hook replaces Pi's one-shot LLM summary with the model's own notes digest for every trigger (threshold, overflow, manual, model-requested), keeping Pi's cut point, recent tail, entry mechanics, and overflow retry. Empty notes fall back to Pi's default summarizer. |
| Backend matrix | **Pi + non-OpenAI: Pho cutover. Pi + OpenAI: provider-native OpenAI API path, separately gated (interim: Pho cutover). Codex app-server and ACP: backend-owned; Pho Code hides its compaction controls.** |
| Budget signal | **Banded and model-visible.** An ephemeral remaining-context line injected through Pi's `context` event only at coarse bands (50/25/10 percent remaining) to protect prompt caches; the composer usage meter remains the owner-facing display. |
| Notes | **Per-session, model-managed working state.** One bounded session-owned file behind `notes_append`/`notes_write`/`notes_read`; not cross-session memory and not V5 Task Brief evidence. |
| History lookup | **Read-only tools over authoritative Pi JSONL.** `history_search`/`history_read` on the active branch via `ReadonlySessionManager`, bounded and truncation-aware; no second transcript and no provider backend. |
| Model-requested cutover | **Two-phase at the turn boundary.** A `new_context` tool sets a generation-checked flag and tells the model to save notes; the runtime compacts when the turn settles and the session is idle. Never mid-turn. |
| OMP-derived ideas | **Display-divider insight plus promoted recall.** Handoff/recall is promoted in the scoped Milestone 3–4 form above. Shake, snapcompact, branch summaries, and OMP's maintenance scheduler remain research, not hidden scope. |

## Non-goals

The first accepted release will not:

- replace Pi JSONL, rewrite session files, or copy transcripts into application metadata;
- implement summary generation, cut-point selection, overflow retry, or token estimation outside Pi;
- expose reserve tokens, retained tokens, raw settings JSON, arbitrary compaction prompts, or a generic settings editor;
- enable global/project extensions or install an upstream compaction package;
- persist a second transcript, duplicate summaries in metadata, or claim that archive/Trash deletes provider data;
- add session fork/tree, branch summarization, cross-session memory, or transcript export;
- perform no-summary cutover that keeps nothing and carries no digest (the destructive path behind [openai/codex#31822](https://github.com/openai/codex/issues/31822)); every Pho cutover carries the notes digest or falls back to a Pi summary, and always keeps Pi's recent tail;
- prune tool output, create bitmap archives, or add image-only continuity;
- promise identical recall, cost, threshold timing, or summary quality across providers;
- change models automatically before or after compaction;
- describe an opaque provider artifact as readable, portable, or a backup.

## Product invariants

1. **Pi is authoritative.** `AgentSession`, `SessionManager`, and Pi JSONL own compaction, active model context, persistence, and overflow retry.
2. **Display and context are separate.** The full active-branch transcript remains visible; only Pi's rebuilt context becomes smaller.
3. **Composite identity owns state.** Compaction status and commands are keyed by `{workspaceId, sessionId}`. Background events never update the selected chat by accident.
4. **Manual means idle-only.** Pho Code refuses manual compaction while Pi is running, retrying, compacting, or consuming queued work. It does not rely only on the renderer's run flag.
5. **Success requires a Pi entry.** A success marker corresponds to an actual compaction entry. Failure or abort never fabricates one.
6. **Reason can be unknown.** Live event data is transient. Restarted history does not guess manual versus automatic.
7. **Summary is untrusted and lossy.** It is sanitized for display and never treated as application instructions or filesystem truth.
8. **Usage stays honest.** Context use may become unknown immediately after compaction; cumulative session tokens and cost do not reset.
9. **Ordinary chat survives failure.** A failed manual request or automatic summary does not corrupt the transcript or disable unrelated chats.
10. **No hidden provider policy.** Provider-native compaction requires a separate product decision and live verification before it can change request storage, transport, or replay.
11. **Cutover is honest.** Every boundary carries either the notes digest or a Pi summary, and the marker copy says which. The UI never presents a digest cutover as a richer summary than it is, and never hides that earlier turns left model context.
12. **Notes are per-session working state.** They are bounded, treated as untrusted model data, follow the owning session's Archive/Trash lifecycle, and are neither cross-session memory nor V5 Task Brief/verification evidence.
13. **History lookup is read-only.** Recall tools read authoritative Pi JSONL through `ReadonlySessionManager`; they never mutate entries, never write a second transcript, and never feed the display projection.

## Current behavior and gap

Production sessions do not override Pi's compaction setting. With pinned Pi `0.84.4`, automatic compaction is enabled by default and normally triggers when:

```text
contextTokens > contextWindow - reserveTokens
```

The pinned defaults reserve `16,384` tokens and retain approximately `20,000` recent tokens. Pi can also compact after a context overflow and retry the interrupted operation. A successful compaction appends a readable `compaction` entry containing the summary, retained boundary, pre-compaction estimate, optional usage, and JSON-safe details. A post-compaction estimate may be available on the live result, but pinned Pi does not persist it in that entry.

Pho Code currently misses the owner-facing contract:

- deterministic runtime sessions explicitly disable compaction;
- the session subscription ignores `compaction_start` and `compaction_end`;
- `compactionSummary` messages are omitted from transcript projection;
- the snapshot renders Pi's current model-context messages, so old display history can disappear after compaction;
- there is no manual command, cancel command, boundary marker, summary detail request, or compaction state.

## User-visible contract

- The existing context meter remains the usage button. Its popover explains **current context** separately from **cumulative session usage** and offers **Compact context** when the selected session is idle and has a model.
- During manual compaction, that area shows **Compacting context…** with Cancel. During automatic threshold/overflow compaction, it shows the same state without creating a second run control; composer Stop remains responsible for cancelling the owning live run.
- The sidebar activity for a background manual compaction is working, with an accessible non-animated label under reduced motion.
- Success inserts a slim transcript divider at the Pi compaction entry's chronological position. Live text may say `Compacted · manual`, `Compacted · threshold`, or `Compacted · overflow`; after reload the persisted marker may say only `Context compacted`.
- Expanding the marker requests the readable summary and shows before/after token estimates when Pi supplied them. The summary is collapsed by default and sanitized like settled assistant Markdown.
- Abort removes the in-progress state and adds no success divider. Failure shows a bounded recoverable error and leaves the pre-compaction display transcript intact.
- Immediately after success, the context meter may show `—` until Pi can estimate the next active context. The session token/cost detail remains cumulative and includes compaction usage when Pi reports it.
- Copy, assistant rewrite, tool work logs, Plan/Agent, Changes, and Context prompt continue to operate on their existing ownership paths.

The UI must not say that compaction deletes old messages, reduces already-incurred cost, guarantees recall, or clears provider-retained data.

## Lifecycle

| Event or owner action | Behavior |
| --- | --- |
| Pi threshold compaction | Project start/end to that session; preserve the run; refresh snapshot and display boundary on success |
| Pi overflow compaction | Project overflow reason; existing run remains authoritative and Pi may retry after success |
| Compact context while idle | Validate composite identity and `session.isIdle`; call `session.compact()` with no custom instructions |
| Compact context while busy | Refuse with `session_busy`; do not call Pi's abort-before-compact path |
| Cancel manual compaction | Call `abortCompaction()` for the exact session; await normal end/abort projection without inventing a run |
| Stop a live run during auto-compaction | Existing bounded Stop calls `abortCompaction()` as part of run cancellation |
| Switch chat/workspace | Keep compaction attached to its owning controller; selected UI shows only its own state |
| Archive during compaction | Preserve existing archive semantics; the background controller and activity remain visible in Archived |
| Move chat to Trash | Refuse while `session.isCompacting` or otherwise non-idle; never Trash an in-flight session |
| Reload/restart | Reconstruct display markers from Pi entries; no stale `compacting` state survives process exit; a pending model-requested cutover flag never survives process exit |
| Quit | Existing bounded controller disposal aborts compaction, unsubscribes, flushes, and rereads JSONL next launch |
| Model calls `new_context` mid-run (M4) | Set the controller's generation-checked cutover flag; the tool result tells the model to save notes; the runtime compacts when the turn settles and the session is idle; the run is never aborted silently |
| Any compaction trigger with empty notes (M4) | The hook declines and Pi's default summarizer runs; the marker says so |
| Any compaction trigger with notes present (M4) | The hook supplies the bounded notes digest at Pi's own cut point; the marker says it was compacted from notes |
| Archive/Trash with notes present (M3) | The notes file follows the owning session's existing Archive/Trash semantics; Trash refusal for non-idle sessions is unchanged |
| Codex/ACP backend session | The adapter reports compaction as backend-owned; Pho Code hides Compact/cutover controls instead of pretending Pi semantics apply |

## Data and privacy

| Data | Owner | Location/lifetime | User consequence |
| --- | --- | --- | --- |
| Full transcript and compaction entry | Pi | App-owned session JSONL until the chat is moved to OS Trash | Locally inspectable; remains transcript authority |
| Active compacted model context | Pi | Rebuilt in memory from summary plus retained entries | Smaller and lossy; not a second persisted transcript |
| Live reason/progress/error | Session controller | Memory for one `{workspaceId, sessionId}` | May be absent after restart; never copied to metadata |
| Expanded summary response | Runtime/protocol/renderer | Bounded on-demand value; renderer lifetime only | Sanitized for display; no absolute paths or opaque provider data added |
| Provider request for Pi summary | Pi/provider | Governed by the selected provider/auth path | Earlier conversation content is sent for summarization; the notes-digest path makes no extra provider request |
| Session notes file (M3) | Pho feature | One bounded sidecar file in the owning session's directory; follows the session's Archive/Trash lifetime | Model-written working state; untrusted; never a second transcript, never Task Brief evidence |

Diagnostics may contain session identity, reason, timing, before/after estimates, aborted/succeeded/failed, and a redacted error class. They must not contain the full summary, transcript, tool payloads, prompts, provider headers, tokens, credentials, opaque compaction artifacts, or response ids.

## Provider-native research disposition

OpenAI's current Responses documentation supports both server-side compaction through `context_management` and a standalone `/responses/compact` endpoint. It documents opaque encrypted items and `store: false` flows, so provider-native compaction is not inherently tied to stored Responses. That corrects the earlier draft's broader retention assumption.

The evaluated [`pi-openai-server-compaction`](https://github.com/algal/pi-openai-server-compaction) revision `8a3de2f3b0c178fdd6f73f2f94172dfc3943e466` is still unsuitable for this release: it is experimental/private, peers Pi `>=0.80.9 <0.81.0`, targets older trigger/request behavior, and its direct `openai/*` path explicitly sets `store: true`, adds request mutation, previous-response continuity, and a custom WebSocket transport. Pho Code pins Pi `0.84.4`. Removing the peer check is not compatibility work.

Provider-native support may be promoted later only with an exact Pi-compatible implementation, `store: false`/retention decision, artifact schema and cross-model rejection rules, usage accounting, rollback, packaged resources, and separate real-provider evidence for `openai-codex/*` and direct `openai/*`. The portable Pi summary remains mandatory.

## Relationship to other tracks

| Track | Relationship |
| --- | --- |
| Conversation UI | Owns the existing transcript and usage-popover host chrome; this add-on owns compaction meaning, boundary, commands, and state |
| Accepted agent-stop | Stop already calls `abortCompaction()` for live runs; this add-on adds cancellation for idle-origin manual compaction |
| V2 session lifecycle | Supplies composite controller ownership, background activity, archive, exact-artifact Trash refusal, and bounded shutdown |
| Session tree/fork | Still unpromoted; compaction must not smuggle in branch navigation or branch summaries |
| Integrated terminal | Unrelated |
| Provider accounts | Supplies the selected model/auth path; compaction does not create another credential store |

## References

- Implementation contract: [`implementation-plan.md`](./implementation-plan.md)
- Research and promotion record: [`logs/2026-08-20-research-and-promotion.md`](./logs/2026-08-20-research-and-promotion.md)
- Accepted runtime/data ownership: [`../../architecture/runtime-and-data.md`](../../architecture/runtime-and-data.md)
- Conversation UI: [`../../ui/implementation/conversation-ui.md`](../../ui/implementation/conversation-ui.md)
- Pinned Pi `0.84.4`: `packages/runtime/node_modules/@earendil-works/pi-coding-agent/docs/compaction.md`
- [OpenAI compaction guide](https://developers.openai.com/api/docs/guides/compaction)
- [OpenAI compact response API reference](https://developers.openai.com/api/reference/resources/responses/methods/compact)
- [Oh My Pi compaction design](https://github.com/can1357/oh-my-pi/blob/7e54061cbb1181dbc8dd7f0b37a1f12435a39e05/docs/compaction.md) — product research only
- [`pi-openai-server-compaction` evaluated revision](https://github.com/algal/pi-openai-server-compaction/tree/8a3de2f3b0c178fdd6f73f2f94172dfc3943e466) — deferred candidate
- [openai/codex#27488](https://github.com/openai/codex/pull/27488) — Codex `new_context` no-summary window tool
- [openai/codex#39827](https://github.com/openai/codex/pull/39827) — Codex history and notes tools
- [openai/codex#31822](https://github.com/openai/codex/issues/31822) — destructive no-summary automatic cutover; the rejected path
- [Announcement thread](https://x.com/nicoritschel/status/2093775003888361576) — industry direction toward cutover + notes + history recall
