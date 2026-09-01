# Pho cutover: the Pho-owned compaction strategy and backend matrix

Date: 2026-09-01
Owner: features/compaction
Status: Complete — strategy design and owner directive recorded; implementation not started
Plan: [`../implementation-plan.md`](../implementation-plan.md) (Milestones 3–4)
Related: [model-driven cutover research](./2026-09-01-model-driven-cutover-research.md), [`../product.md`](../product.md), [V5 task-state boundary](./2026-08-20-related-v5-pho-agent.md), [V5 product](../../../version/v5/product.md)

## Objective

Owner directive, 2026-09-01: pho-agent's Pi wrapper uses **our own compaction strategy**; OpenAI models are the single exception, targeting the OpenAI API; ACP backends (Codex app-server, Claude) leave compaction to the underlying software. Design the simplest good strategy satisfying that directive on pinned Pi `0.84.4`.

## Backend strategy matrix

| Backend / model | Compaction owner | Pho Code behavior |
| --- | --- | --- |
| Pi adapter, non-OpenAI model | **Pho cutover** (this strategy) | Full UI: usage meter, Compact context, boundary markers, digest detail |
| Pi adapter, OpenAI model | Target: OpenAI provider-native compaction via the OpenAI API, promoted separately under the plan's provider-native checklist. Interim: Pho cutover (it is provider-agnostic) | Same UI; no provider claim until the gated path lands |
| Codex app-server backend | Codex-owned (its token-budget/compaction machinery) | Adapter publishes `backend-owned` capability; Pho Code hides Compact/cutover controls |
| ACP backend (Claude, others) | Agent-owned | Same `backend-owned` capability; nothing built in this add-on |

The matrix is a compaction-add-on contract today. When V5 unblocks, adapters publish the capability explicitly; V5 does not re-accept this add-on.

## The strategy: notes-first cutover

One sentence: **the model maintains a small per-session notes file while it works; when compaction triggers, a `session_before_compact` hook replaces Pi's one-shot LLM summary with the notes digest while keeping Pi's cut point, recent tail, entry mechanics, and overflow retry; recall is read-only over the authoritative JSONL.**

Components, all on public pinned-Pi APIs:

1. **Banded budget signal.** A `context`-event handler injects one ephemeral remaining-context line only when usage crosses coarse bands (50 / 25 / 10 percent remaining), so prompt caches stay stable while context is plentiful and the model is warned when it matters. Tool `promptGuidelines` teach the discipline: keep notes current; when warned, save state.
2. **Notes — three tools, one file.** `notes_append` (bounded per call), `notes_write` (bounded whole-file rewrite), `notes_read` (bounded). One session-owned sidecar file; no search tool because the file is small enough to read whole. Notes are untrusted model data and per-session working state — not cross-session memory, not V5 Task Brief evidence.
3. **History — two read-only tools.** `history_search(query)` returns bounded matching snippets with entry ids from the active branch via `ReadonlySessionManager`; `history_read(entryId)` returns one bounded serialized entry. No list-windows/list-items in the first release; the active branch only, matching the display projection.
4. **The cutover hook.** On `session_before_compact` (any reason — threshold, overflow, manual, model-requested): read the bounded notes file. **Empty notes → return nothing and Pi's default summarizer runs** (graceful fallback; the coexist safety net). Non-empty → return a custom compaction whose summary is the notes digest plus a recall pointer ("use `history_search` to recover earlier work"), whose `firstKeptEntryId` is Pi's own `preparation.firstKeptEntryId`, with `details.kind = "pho-cutover"`. Pi keeps cut-point selection, split-turn handling, entry append, context rebuild, and overflow retry.
5. **Model-requested cutover — two-phase.** A `new_context` tool sets a generation-checked flag on the session controller and tells the model to save notes; when the turn settles and the session is idle, the runtime calls `session.compact()` and the same hook decides digest vs Pi summary. Never mid-turn: pinned `compact()` aborts the current operation and has the reentrancy hazard tracked in [pi#7738](https://github.com/earendil-works/pi/issues/7738). This avoids both Codex #27488 review bugs (dropped sibling tool outputs; stale pending flag).

What the strategy deliberately is **not**: no summary LLM request on the digest path (cost/latency/privacy win — the conversation is not re-sent for summarization), no automatic no-summary cutover (the [openai/codex#31822](https://github.com/openai/codex/issues/31822) failure mode is rejected: a cutover always carries either the notes digest or a Pi summary, and always keeps Pi's recent tail), no second transcript, no provider backend, no new settings beyond one typed feature toggle.

## Why this is simple

- One hook, three note tools, two history tools, one flag, one injector — all inside one source-controlled manifest feature following the existing trash/web/retrieval pattern.
- Everything reuses the accepted M0–M2 machinery unchanged: a cutover is a real `CompactionEntry` (`fromHook`), so display projection, boundary markers, bounded detail fetch, cancel, and lifecycle semantics already apply; the marker copy distinguishes digest vs Pi summary.
- Pi remains the JSONL, cut-point, persistence, and overflow-retry authority. The hook only supplies summary *content* through Pi's documented extension point; Pho does not implement a summarizer, a cut-point algorithm, or an agent loop.

## Characterization musts before implementation relies on them

- A `session_before_compact` handler returning nothing lets Pi's default summarization proceed (per bundled docs; prove against installed `0.84.4`).
- `context`-event message mutations affect only the outgoing request, not persisted JSONL.
- Custom-compaction entries with digest-length summaries and Pi-computed `firstKeptEntryId` rebuild context identically to default compactions, including repeated and split-turn cases.
- Banded injection's actual prompt-cache impact on the supported providers.

## Verification

Design and documentation only. No production code, manifest, protocol, or persisted data changed; no unit, integration, desktop, or packaged lane ran. Milestones 3–4 carry their own proportional lanes in the implementation plan.

## Mistakes and corrections

- The same-day research log scoped hard cutover as requested-only with Pi summarization always owning threshold/overflow. The owner's backend-matrix directive supersedes that scoping: the Pho cutover hook intercepts **all** triggers, with the empty-notes fallback preserving a summarizing safety net. Product and plan wording were updated in this slice so the two logs read consistently.

## Owner feedback

Owner directive: "pho-agent (pi wrapper) will use our own compaction strategy, except for OpenAI model only (call to OpenAI API); ACP (codex, claude): just let the below software do that." The owner asked for a good and simple design; this record is that design.

## UI impact

No new chrome beyond the already-planned M1/M4 items. Marker copy gains a digest variant ("Context compacted from notes"); the usage popover keeps one owner action. Codex/ACP sessions hide compaction controls once those adapters exist.

## Blockers and handoff

- Milestones 3–4 remain gated on Milestone 2 acceptance.
- The OpenAI provider-native exception is **not** promoted by this record; it remains behind the plan's provider-native checklist (exact Pi-compatible implementation, `store: false`/retention decision, artifact schema, usage accounting, rollback, packaged resources, live evidence). Until it lands, OpenAI models use Pho cutover.
- When M3 changes shared transcript projection or Pi custom-entry handling, add a reciprocal link from the V5 task-state log and run the union of focused checks.
