# Model-driven context cutover research and direction extension

Date: 2026-09-01
Owner: features/compaction
Status: Complete — research and owner direction decision; Milestones 3–4 promoted but not started
Plan: [`../implementation-plan.md`](../implementation-plan.md)
Related: [`../product.md`](../product.md), [2026-08-20 research and promotion](./2026-08-20-research-and-promotion.md), [V5 task-state boundary](./2026-08-20-related-v5-pho-agent.md)

## Objective

Evaluate the Codex CLI direction described in [openai/codex#27488](https://github.com/openai/codex/pull/27488), [openai/codex#39827](https://github.com/openai/codex/pull/39827), and [this announcement thread](https://x.com/nicoritschel/status/2093775003888361576) — replacing summarizing compaction with hard context cutovers plus notes and transcript-history lookup — and decide how it merges into this add-on.

## Evidence examined

- Codex `new_context` tool ([PR #27488](https://github.com/openai/codex/pull/27488), merged 2026-06-11): direct-model-only, behind `Feature::TokenBudget`; stored on `AutoCompactWindow`, consumed after sampling; the next same-turn follow-up starts as a **no-summary compaction checkpoint** with fresh initial context only.
- Codex history/notes tools ([PR #39827](https://github.com/openai/codex/pull/39827), merged 2026-08-21): direct-model `history` (list windows/items, read items, search conversation) and `notes` (list/read/search/append/write persistent notes), routed through the OpenAI Codex backend, gated on `features.token_budget.use_history_notes_history` plus OpenAI provider and Codex backend auth; bounded arguments and truncation-aware output.
- Token-budget startup context injects a `Current context window Z` message so the model sees its remaining budget; the workflow is injected into the harness-level prompt when the features are enabled.
- [openai/codex#31822](https://github.com/openai/codex/issues/31822): with `token_budget` enabled, automatic mid-turn compaction in 0.143/0.144 resets context **without any summary**; the replacement history kept only fresh developer/AGENTS instructions, dropping the task, assistant progress, and active tool output. Without a notes server the new window "received only window IDs." Hard cutover without notes is silent data loss surfaced as ordinary compaction.
- The same thread reports Amp has shipped handoffs for months and Nous Research's Hermes added a recall reference over compacted content. The shared thesis: a one-shot summary cannot capture everything, so give the model tools to recall what was removed.
- Installed Pi `0.84.4` declarations: `pi.registerTool()`, `session_before_compact` (custom compaction result, `fromHook`), `context` event with mutable messages, `ReadonlySessionManager` (`getBranch`/`getEntries`/`getEntry`/`getTree`), `AgentSession.getContextUsage()`, JSON-safe `CompactionEntry.details`.

## Findings

1. Every Codex primitive maps onto public pinned-Pi APIs. No fork, SDK upgrade, provider backend, or OpenAI-specific transport is required. Notes/history would be **local and provider-agnostic**, where Codex's are server-side and OpenAI-gated.
2. One real semantic difference: Codex's `new_context` is model-issued mid-turn and consumed after sampling. Pinned `compact()` aborts the current agent operation and has the known reentrancy hazard ([pi#7738](https://github.com/earendil-works/pi/issues/7738)). The Pi-native mapping is therefore **two-phase at the turn boundary**: the tool sets a generation-checked cutover flag and tells the model to save notes; the runtime performs a no-summary custom compaction when the turn settles. This structurally avoids both #27488 review bugs (dropped sibling tool outputs; stale pending flag after failed streams).
3. Codex review lessons adopted as design constraints: bound tool outputs (10K-token-style cap) and note write arguments before they enter context; never map a pathless identity to another agent's notes/history; stage the rollout (signal/history/notes before cutover).
4. The current add-on foundation is unchanged and becomes more important: under hard cutovers the full active-branch display projection is the only place complete history remains visible, and a cutover is still a real Pi `CompactionEntry` (`fromHook`, `details.kind: "hard-cutover"`) backed by the existing marker/detail contract.
5. The 2026-08-20 plan deferred "handoff documents, context promotion" as OMP-only research. The Codex/Amp/Hermes convergence is evidence the pattern graduated to multi-vendor production practice; the owner has now promoted a scoped form.

## Product decisions (owner, 2026-09-01)

- **Coexist, not replace.** Pi threshold/overflow summarization remains the automatic safety net. Budget signal, per-session notes, transcript-history lookup, and requested hard cutover are added as Milestones 3–4, gated on Milestone 2 acceptance. Automatic no-summary cutover (the #31822 path) is rejected for this add-on.
- **Same feature folder.** Milestones 3–4 live in this add-on, not a sibling, because transcript boundary, summary disclosure, and trust language are shared ownership.
- Notes are **per-session working state**, bounded and model-managed; not cross-session memory (V5 defers memory) and not V5 Task Brief evidence. The V5 boundary log's rule stands: summaries — and now notes — are not verification evidence.
- Hard cutover is **requested-only, two-phase, and honest**: the UI names it a fresh context, never ordinary compaction.

## Verification

- Read-only research against exact upstream PRs/issues and the installed Pi `0.84.4` declarations cited above.
- No production code, dependency, manifest, protocol, or persisted data changed.
- Runtime, Electron, packaged, and real-provider behavior remain **not verified**; Milestones 3–4 define their own lanes in the implementation plan.

## Mistakes and corrections

- The 2026-08-20 promotion record treated handoff/context-promotion as OMP-derived research to keep deferred. That disposition is corrected by owner promotion of the scoped, Codex-validated form; shake, snapcompact, branch summaries, and OMP's maintenance scheduler remain deferred.

## Owner feedback

The owner supplied the Codex references, requested this research, and selected the coexist/same-feature merge shape recorded above.

## UI impact

Future Milestone 4 adds an owner-facing fresh-context action beside Compact context and a distinctly worded boundary marker ("context reset", notes digest expandable through the existing bounded detail command). No chrome changes land before then; the usage popover remains the host.

## Blockers and handoff

- Milestone 3 is gated on Milestone 2 acceptance; do not start it against an unaccepted projection.
- Characterization tests must establish pinned-Pi behavior for minimal/empty custom summaries and keep-almost-nothing `firstKeptEntryId` cut points before Milestone 4 relies on them.
- Measure prompt-cache and token-accounting impact of `context`-event budget injection before enabling it by default.
- When Milestone 3 changes shared transcript projection or Pi custom-entry handling, add a reciprocal link from the V5 task-state log and run the union of focused checks.
