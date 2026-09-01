# Subagent orchestration research and promotion

Date: 2026-09-01

Owner: features/subagents

Status: Complete (research and documentation only; implementation not started)

Plan: [`../implementation-plan.md`](../implementation-plan.md)

Related: [`../product.md`](../product.md),
[`../../../version/roadmap-vnext.md`](../../../version/roadmap-vnext.md),
[`../../../version/v5/logs/2026-08-27-external-backend-ownership.md`](../../../version/v5/logs/2026-08-27-external-backend-ownership.md),
[`../../../ui/logs/2026-09-01-decision-subagent-surface.md`](../../../ui/logs/2026-09-01-decision-subagent-surface.md)

Correction: the owner superseded the cross-backend parent/target decision later
the same day. See
[`2026-09-01-owner-correction-backend-ownership.md`](./2026-09-01-owner-correction-backend-ownership.md).

## Objective

Research the two owner-provided Pi subagent projects and promote a Pho Code
feature that is simple, performant, transparent, cross-backend, and consistent
with accepted session, permission, data, UI, and packaging boundaries.

The requested outcome emphasizes:

- real separate sessions rather than simulated personas;
- exact visibility into child identity, target, prompt, context, activity, and
  result;
- agent choice among only the models/backends already available in Pho Code,
  with structured ask-back when the choice is material;
- fun parent-selected names;
- a comprehensive plan before implementation.

## Evidence examined

### Pho Code source and accepted contracts

- Current backend-neutral session/host/protocol packages and Pho Code's
  `HostedRuntime`, including Pi, Codex app-server, and ACP registration.
- Current Codex dynamic-tool bridge, product developer instructions, model
  discovery, approvals/user input, native activity projection, and hard-coded
  thread startup policy.
- Current Pi runtime/session controller, app-owned resource loading, active-tool
  selection, interaction host, transcript projection, compaction, and disposal.
- Installed pinned Pi SDK declarations, source, tests, and official subagent
  example under the repository's installed runtime dependencies.
- Accepted [V2 Milestone 3](../../../archive/v2/implementation-plan-v2.md)
  session identity, four-active-run/eight-resident-controller bounds,
  background attention, archive/Trash, restart, and shutdown contracts.
- Accepted [Plan/Agent](../../../archive/features/plan-agent/product.md),
  [agent-tool sandbox](../../../archive/features/sandbox/product.md), and
  [V3 change review](../../../archive/v3/product.md) boundaries.
- Active [approval-modes](../../approval-modes/product.md), blocked
  [V5](../../../version/v5/README.md), pending
  [V4](../../../version/v4/README.md), urgent-priority, and conversation/right-
  sidebar records.
- Current state explicitly records no Pho subagent orchestration and describes
  backend-native collaboration as flattened activity only.

### Owner-provided upstreams

- [`tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents), branch
  `master` at observed head
  [`4f572ea`](https://github.com/tintinweb/pi-subagents/tree/4f572ea), including
  its README, `src/agent-runner.ts`, `src/agent-manager.ts`, extension/tool
  definitions, and package metadata. Observed 2026-09-01; MIT license.
- [`nicobailon/pi-subagents`](https://github.com/nicobailon/pi-subagents), branch
  `main` at observed head
  [`a9b17bb`](https://github.com/nicobailon/pi-subagents/tree/a9b17bb), including
  its README, [agent definitions](https://github.com/nicobailon/pi-subagents/blob/main/docs/agents.md),
  [observability](https://github.com/nicobailon/pi-subagents/blob/main/docs/observability.md),
  [tool reference](https://github.com/nicobailon/pi-subagents/blob/main/docs/tool-reference.md),
  source tree, and package metadata. Observed 2026-09-01; MIT license.

The repositories are fast-moving. Their observed revisions support this design
record only; implementation must re-check any API or code considered for
material adaptation.

## Upstream findings

### Tintinweb

The strongest ideas are:

- isolated child sessions with their own model, tools, system prompt, transcript,
  usage, and lifecycle;
- one delegation tool plus explicit result, steering, and stop/inspection paths;
- background work with visible state rather than invisible promises;
- a fleet/conversation viewer that makes concurrent work inspectable;
- bounded concurrency and child result projection.

Its production surface is much broader than Pho's desired first feature:
user/project agent files, nesting, context inheritance, session resume, memory,
workflows, scheduling, worktrees, event/RPC systems, mentions, and extensive TUI
behavior. It is Pi-target-only and assumes its own resource/discovery model.
Taking it as a dependency or copying its architecture would conflict with Pho's
fixed manifest, embedded SDK, desktop UI, and mixed Pi/Codex target requirement.

### Nicobailon

The strongest ideas are:

- natural-language delegation to focused child sessions;
- memorable Scout/Researcher/Worker/Reviewer-style roles as routing and display
  hints;
- a FleetView inspector and full child conversation visibility;
- explicit foreground/background operation and bounded delegation budgets;
- separating the provider target from the human-readable role;
- a practical “clarify, scout, build, review” mental model.

Its repository is intentionally an agent platform: built-in and discovered
profiles, agent files, external CLI adapters, workflows, missions, artifacts,
schedules, policies, watchdogs, inter-agent communication, inspectors, and
multiple integration surfaces. That breadth is useful evidence for later
research but is the opposite of the owner's simple first product boundary.

### Shared lesson

Both projects converge on the same useful core: a child should be a real,
separately inspectable session, and concurrent work needs a roster plus focused
conversation view. Their differentiators mostly live above that core. Pho
should implement the common primitive and deliberately omit the platform.

## Pho-specific findings

1. **The current host seam is enough to coordinate mixed backends in principle.**
   Pho can create another Pi or external-backend session and route send/abort/
   snapshot operations without teaching Pi to shell out to Codex or vice versa.
2. **A backend's model is the target, not an ambient agent definition.** DeepSeek
   remains a selectable Pi model target; Codex remains its own backend/model
   target. Role/name stay display/prompt hints.
3. **Codex parent injection is possible but ACP parent injection is not yet
   symmetric.** Codex already accepts a Pho dynamic tool; stable ACP v1 has no
   equivalent path. First-release parent scope should be Pi and Codex.
4. **Codex read-only cannot be assumed.** Current production thread startup uses
   a workspace-write/on-request posture. Milestone 0 must characterize a real
   read-only startup and native tool behavior before Codex is a child target.
5. **The existing protocol word `subagents` is not Pho orchestration.** It
   currently describes a possible backend capability/native activity kind.
   Advertising it without a Pho relationship/control operation would be false.
6. **Fresh context is the smallest honest boundary.** Copying a parent transcript
   raises token, privacy, permission, and provenance costs. A self-contained
   delegation prompt plus normal workspace instructions is predictable and
   visible.
7. **Foreground wait should be the default.** Both parent backends understand a
   normal tool result. An automatic background completion would require an
   invented out-of-band parent turn, especially awkward for external Codex.
8. **Existing run limits already give the right first concurrency bound.** A
   live parent occupies one of four global run slots, leaving at most three
   children. Reusing that admission rule is simpler than another configurable
   pool or queue.
9. **Read-only first is a product boundary, not a demo limitation.** It makes
   multi-agent research/review useful while tool authority, attribution, and
   conflicts remain provable. A writer can follow under a serialized Pi-only
   lease; worktrees remain separate roadmap work.
10. **One Agents tile fits accepted UI.** A roster plus one selected inspector
    reuses the right-sidebar host. One tile per child would collide with the
    two-visible-tile cap and turn the conversation into a dashboard.
11. **Backend-native collaboration needs a different label.** Pho cannot imply
    exact prompt/session/stop ownership for a native Codex collaborator when the
    backend has not exposed those controls.
12. **The official Pi example's subprocess pattern is not a Pho production
    fit.** Pho has an embedded pinned SDK, app-owned resources, and no global Pi
    CLI dependency. The public session APIs are useful; the process/discovery
    architecture is not.

## Product decisions

- Promote `features/subagents` as a standalone add-on and remove the narrow
  session-delegation slice from unpromoted roadmap Phase E.
- Keep worktrees, branch integration, conflicts, nesting, workflows, scheduling,
  memory, ambient profiles, and generic adapters outside this feature.
- Add one strict model-facing tool, `pho_subagent`, with list, start, inspect,
  message, and stop actions.
- Support Pi and Codex parents/targets only when their capability matrix is
  proven. Treat DeepSeek as a Pi target. Do not silently add ACP/Claude.
- Create a fresh child session and require a self-contained exact prompt.
- Default to read-only and wait; make background explicit and pull-based.
- Let the parent provide a fun bounded name, optional role, and target reason;
  keep immutable product ids authoritative.
- Expose exact Pho-supplied prompt/context/tool/access information and label
  backend-owned unknowns honestly.
- Add one transcript activity card plus one Agents right-sidebar surface.
- Reuse four-active/eight-resident limits with no hidden queue or Settings knob.
- Add a later Pi-only, wait-only, exclusive-workspace writer milestone; keep
  Codex writers and worktrees deferred.
- Add no dependency on either upstream project and copy no code in this slice.

## Documents changed

- Added [`../README.md`](../README.md).
- Added [`../product.md`](../product.md).
- Added [`../implementation-plan.md`](../implementation-plan.md).
- Added this log and [`README.md`](./README.md).
- Added the proposed shared-UI decision in
  [`../../../ui/logs/2026-09-01-decision-subagent-surface.md`](../../../ui/logs/2026-09-01-decision-subagent-surface.md).
- Added the add-on to [`../../README.md`](../../README.md).
- Updated [`../../../version/roadmap-vnext.md`](../../../version/roadmap-vnext.md)
  and [`../../../version/research-backlog.md`](../../../version/research-backlog.md)
  so only the promoted delegation slice moves; worktrees remain research.
- Recorded promoted/not-implemented truth in
  [`../../../current-state.md`](../../../current-state.md).

## Verification

- Pho source/architecture/current-plan inspection: complete for the evidence
  listed above.
- Installed pinned Pi SDK inspection: complete for planning; Milestone 0 still
  requires executable characterization.
- External upstream research: repositories and linked sources opened on
  2026-09-01 at the observed revisions.
- Runtime, unit, integration, desktop, provider, and packaged checks: not run;
  this slice changes documentation only and implements no behavior.
- Documentation verification: `git diff --check` passed for tracked changes;
  the new files contain no trailing whitespace and end with newlines; all 11
  scoped Markdown files resolved their local paths and heading anchors; Markdown
  fence counts were balanced; the scoped diff and full repository status were
  inspected.
- A repository-wide local-target sweep found one older unrelated missing target
  in `docs/ui/logs/2026-08-20-bug-appearance-reverts-on-new-session.md`. This
  slice did not edit or relabel that pre-existing record.

## Mistakes and corrections

- The roadmap originally coupled subagents and worktrees in one Phase E. The
  owner request is useful without Git isolation. This promotion now separates
  session delegation from worktree creation rather than importing the whole
  phase.
- Existing backend-neutral `subagent` activity could be mistaken for an
  implemented Pho feature. The product contract now distinguishes Pho-created
  child relationships from backend-native activity explicitly.
- “Read-only Codex” initially looked like a configuration choice. Source
  inspection found current Codex thread startup uses workspace-write, so Codex
  child availability is now gated on real API characterization rather than
  instructions or optimistic labeling.

## Owner feedback

2026-09-01: The next large feature should be subagents. Keep the design simple
and performant, make child work fully transparent as separate sessions, let the
agent choose among the providers/models actually configured in Pho Code or ask
the owner, and make the experience fun with agent-chosen names.

## UI impact

Planned only:

- a compact child activity card in the parent transcript;
- one Agents launcher/surface in the accepted right-sidebar host;
- a bounded roster and one selected child inspector;
- exact prompt/context, activity/transcript, message, and Stop controls;
- child-aware attention and backend-native collaboration labels.

## Blockers and handoff

- No implementation has started.
- Milestone 0 must characterize pinned Pi and real Codex behavior before
  protocol or UI claims land.
- The active urgent decomposition remains owner-priority work. This add-on may
  proceed independently, but it must not bypass that priority or absorb V4
  process extraction.
- Shared `packages/pho-agent` changes require a reciprocal V5 log and may not
  advance blocked V5 intelligence scope.
- The Pi writer milestone is gated on the exact accepted permission contract;
  it must not assume approval-modes behavior that has not been accepted.
