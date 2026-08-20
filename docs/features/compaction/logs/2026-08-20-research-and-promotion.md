# Context compaction research and promotion

Date: 2026-08-20

Owner: features/compaction

Status: Complete — research and documentation only; implementation not started

Plan: [`../implementation-plan.md`](../implementation-plan.md)

Related: [`../product.md`](../product.md), [composer usage control](../../../ui/logs/2026-08-18-feedback-composer-usage-meter-button.md), [accepted bounded Stop](../../../archive/urgent/agent-stop/README.md), [future-release roadmap](../../../version/roadmap-vnext.md)

## Objective

Promote the earlier single-file compaction proposal into an implementable standalone add-on, using the integrated terminal workstream's product/plan/log structure. Resolve the actual pinned-Pi behavior, the current Pho Code projection gap, and whether provider-native OpenAI compaction belongs in the first release.

## Evidence examined

- Pho Code's current runtime, transcript projection, protocol, session controller lifecycle, usage UI, tests, and accepted Stop/archive/Trash/shutdown contracts.
- Installed `@earendil-works/pi-coding-agent` `0.84.1` source, declarations, tests, and compaction documentation. Installed declarations and implementation were treated as authoritative where bundled prose described a newer session-entry shape.
- OpenAI's current [compaction guide](https://developers.openai.com/api/docs/guides/compaction), including server-side `context_management`, the standalone compact endpoint, opaque items, and `store: false` flows.
- `algal/pi-openai-server-compaction` at exact revision [`8a3de2f3b0c178fdd6f73f2f94172dfc3943e466`](https://github.com/algal/pi-openai-server-compaction/tree/8a3de2f3b0c178fdd6f73f2f94172dfc3943e466).
- Oh My Pi at exact revision [`7e54061cbb1181dbc8dd7f0b37a1f12435a39e05`](https://github.com/can1357/oh-my-pi/blob/7e54061cbb1181dbc8dd7f0b37a1f12435a39e05/docs/compaction.md).

## Findings that changed the design

1. Pho Code currently projects `session.messages`, which is Pi's reduced active model context after compaction, while `transcript.ts` omits `compactionSummary`. The UI would lose summarized pre-cut turns. The first implementation therefore needs a separate full-current-branch display projection from `sessionManager.getBranch()`, using persisted entry ids.
2. Pinned Pi's public `compact()` aborts the current agent operation before validating the compaction request. The owner-facing action must refuse a busy session before calling Pi; it must not silently turn Compact into Stop.
3. Pinned `compact()` has no safe reentrancy guard. Concurrent calls can replace the shared compaction abort controller. Pho Code must serialize manual compaction per session controller and track upstream [issue #7738](https://github.com/earendil-works/pi/issues/7738).
4. Pi lifecycle events are intentionally asymmetric. Manual start is emitted before all validation; some automatic failures happen before start; repeated overflow recovery can emit an end without a matching start. State reduction must tolerate unpaired, repeated, late, and stale events.
5. A persisted `CompactionEntry` records the readable summary, first-kept entry id, tokens before, usage, details, and hook provenance. It does not durably record trigger reason, estimated tokens after, failures, abort, or retry intent. Reloaded markers must not invent that data.
6. Existing transcript ids are derived from role/timestamp/index and can shift when the source projection changes. New display identity should use Pi entry ids while retaining a fallback for existing assistant-rewrite overlays.
7. OpenAI's current documented compaction paths can operate with `store: false`; provider-native compaction is not inherently synonymous with stored Responses. The old proposal's broader retention assumption was incorrect.
8. The evaluated OpenAI extension still does not fit this release: it peers Pi `>=0.80.9 <0.81.0`, while Pho Code pins `0.84.1`; it is experimental/private; and its direct OpenAI route sets `store: true` while changing request mutation, continuation, and transport.
9. OMP demonstrates the useful principle that display history and active model context are different surfaces. Its shake, snapcompact, handoff, branch summaries, speculative scheduler, and provider-native system belong to a different agent loop and are not copied into this plan.

## Product decisions

- Promote a Pi-native-only first release. Pi continues to own summary generation, cut points, persistence, context rebuilding, and overflow recovery.
- Keep Pi's effective automatic-compaction policy; add no Settings toggle or threshold editor.
- Add one no-instructions manual action in the existing composer usage popover, available only while the exact chat is idle.
- Add a dedicated cancel command for Pho Code-initiated manual compaction. Existing Stop remains responsible for automatic compaction inside a live run.
- Preserve the complete active-branch display transcript and insert an inline boundary backed by a real Pi compaction entry.
- Fetch the readable summary on demand through a bounded, identity-validated command. Treat it as untrusted Markdown.
- Defer provider-native artifacts, OpenAI request overrides, custom transports, custom compaction instructions, branch/tree work, and OMP-derived maintenance features.

## Documents produced

- [`../README.md`](../README.md) — active add-on landing page and status.
- [`../product.md`](../product.md) — owner outcome, selected decisions, invariants, lifecycle, data/trust contract, UX, and provider-native disposition.
- [`../implementation-plan.md`](../implementation-plan.md) — pinned constraints, protocol/runtime design, transcript migration, failure semantics, file ownership, milestones, verification, and acceptance gate.

The earlier `docs/features/compaction.md` proposal was moved into this dated record and superseded by the promoted product and plan. No historical file was permanently deleted.

## Verification

- Read-only source research used exact upstream revisions and the repository's installed Pi pin.
- Documentation routing, relative links, active-workstream shape, whitespace integrity, and final diff were checked after writing.
- No production code, dependency, feature manifest, provider request, or persisted data changed.
- Runtime, Electron, packaged, and real-provider behavior remain **not verified** because this slice is documentation and research only. The required lanes are specified per milestone in the implementation plan.

## Mistakes and corrections

- Corrected the original assumption that provider-native OpenAI compaction necessarily requires stored Responses. Official current documentation includes `store: false` paths. The evaluated third-party extension's direct OpenAI implementation still sets `store: true`, which is a separate concrete retention concern.
- Corrected the original UI-gap description. Omitting the summary marker is not the whole problem: projecting the compacted `session.messages` also removes earlier display turns.
- Closed the original open question about manual custom instructions: the first release uses one idle-only action without custom instructions.

## Owner feedback

The owner requested that compaction research be extended into a comprehensive implementation document comparable to the integrated terminal feature. That request is treated as promotion of the add-on documentation, not authorization to implement runtime behavior or provider-native support.

## UI impact

The accepted host is the existing composer context/usage control. Future implementation adds compact/cancel states there and a slim inline transcript boundary; it does not add a new sidebar rail or replace the established usage trigger. The shared UI feedback record is cross-linked.

## Blockers and handoff

There is no blocker to Milestone 0. Implementation should begin with pinned-Pi characterization and the full-branch display projector before exposing the action through Electron. Provider-native compaction remains a separately promotable evaluation and does not block the Pi-native acceptance gate.
