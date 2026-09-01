# Owner correction: Pho backend owns orchestration

Date: 2026-09-01

Owner: features/subagents

Status: Complete (product/plan correction only; implementation not started)

Plan: [`../implementation-plan.md`](../implementation-plan.md)

Related: [`2026-09-01-research-and-promotion.md`](./2026-09-01-research-and-promotion.md),
[`../../../ui/logs/2026-09-01-feedback-native-subagent-ownership.md`](../../../ui/logs/2026-09-01-feedback-native-subagent-ownership.md),
[`../../../version/v5/logs/2026-08-27-external-backend-ownership.md`](../../../version/v5/logs/2026-08-27-external-backend-ownership.md)

## Objective

Correct the initial promoted plan's backend ownership and close the parent
control/context decisions without hiding the earlier research record.

## Owner feedback

The owner clarified:

- the main **Pho backend** is the app-owned Pi wrapper; “Pho backend” and “Pi
  backend” are used interchangeably for this product even though current source
  protocol still uses backend id `pi`;
- Pho should implement subagent orchestration only for that backend;
- Codex and Claude ACP should use their own native subagent implementations;
  Pho may render or inform the owner only when their adapter data supports it;
- the parent needs a reliable way to stop a stuck child and add context later,
  including an exploration → coding transition;
- child-to-child communication is interesting but hard;
- scheduling, agent profiles, and CLI adapters are out;
- explain the earlier “nesting” and “workflows” terms.

## Correction to the initial record

The initial [research/promotion record](./2026-09-01-research-and-promotion.md)
selected Pi and Codex as Pho parents/targets. That decision is superseded.
Pho-owned orchestration is now strictly Pho/Pi → Pho/Pi across configured Pho
models. Codex/Claude native activity is a presentation concern, not a child
target matrix.

This log preserves the correction instead of rewriting the earlier evidence.
The living [`product.md`](../product.md) and
[`implementation-plan.md`](../implementation-plan.md) carry the corrected
contract.

## Selected decisions

### Backend ownership

- `pho_subagent` is a baked tool only in eligible Pho/Pi parent sessions.
- Pho-created children are fresh Pi-backed sessions with Pho-owned relationship
  metadata and Pi JSONL transcript authority.
- Codex and Claude never receive `pho_subagent`, never enter the Pho target
  catalog, and never get a synthetic Pho relationship record.
- External adapters use a capability ladder: information disclosure, bounded
  activity, stable read-only metadata, then an exact official backend-owned
  control. Pho stops at the highest level actually proven.
- A generic receiver id or `subagent` activity kind is not enough to invent a
  child identity, transcript, Stop, or lifecycle.

### Parent controls

- Start/Continue returns after admission with child id, revision/state,
  linked/background ownership, and currently valid actions; it never traps the
  parent behind an unbounded child run. Linked children abort if the parent turn
  settles or stops while they are still running; explicit background children
  survive that boundary.
- Bounded Wait returns on settlement/attention or after at most 60 seconds with
  current state and controls, so the parent can wait again, guide, inspect, or
  Stop. The owner can click Stop while the parent is inside Wait.
- Every list/inspect/wait result repeats child id and currently valid actions.
- `list` lets the parent rediscover a child after losing the original result.
- `stop` is idempotent and appears in the model tool plus the Agents surface.
- Steering affects an active run; follow-up queues after it; Continue starts the
  next explicit phase only while the child is idle.
- `continue` is a distinct idle-child phase transition. It preserves that
  child's own exploration context and accepts a new exact prompt, run ownership,
  and requested access.
- Read-only → workspace-write Continue rechecks current parent authority, Agent
  mode, permission policy, target capability, active workspace work, and the
  exclusive writer lease before rebinding tools. Text alone cannot elevate.

### Child collaboration

Direct sibling messaging is deferred. Giving children a peer tool would add
addressing, ordering, loops, budgets, authority, audit, and Stop propagation.

The first product supports parent-mediated relay: inspect child A, select a
bounded result/excerpt, and explicitly send it to child B with message or
Continue. The relay remains visible in parent activity and B's transcript.

### Terminology

- **Nesting:** a Pho child can spawn its own children, creating grandchildren.
  First release depth is exactly one.
- **Workflows:** stored recipes/graphs such as scout → plan → build → review,
  with parallel steps, conditions, retries, or handoffs. Pho adds no workflow
  DSL, template, file, or UI; the parent orchestrates dynamically.

## Documents changed

- Corrected [`../README.md`](../README.md),
  [`../product.md`](../product.md), and
  [`../implementation-plan.md`](../implementation-plan.md).
- Added this log to [`README.md`](./README.md).
- Updated the add-on entry in [`../../README.md`](../../README.md), workstream
  truth in [`../../../current-state.md`](../../../current-state.md), and the
  remaining Phase E wording in
  [`../../../version/roadmap-vnext.md`](../../../version/roadmap-vnext.md).
- Added reciprocal UI feedback in
  [`../../../ui/logs/2026-09-01-feedback-native-subagent-ownership.md`](../../../ui/logs/2026-09-01-feedback-native-subagent-ownership.md).

## Verification

- Documentation/source inspection: current backend id and Codex native activity
  mapping rechecked.
- Runtime, unit, integration, desktop, provider, and packaged checks: not run;
  this correction changes documentation only.
- Documentation verification: `git diff --check` passed for tracked changes;
  all new files passed no-index whitespace checks, contain no trailing
  whitespace, end with newlines, and have balanced fences; all 13 scoped
  Markdown files resolved local paths and heading anchors; the scoped diff and
  full repository status were inspected.

## UI impact

Planned only:

- full roster/inspector/Continue/Stop controls apply to Pho children;
- external native work uses a backend-owned badge and only adapter-proven data;
- an activity without stable identity stays in the parent transcript;
- an adapter with no useful event shows an honest information disclosure.

## Blockers and handoff

- No implementation has started.
- Milestone 0 still characterizes Pi child construction and the exact native
  Codex/Claude event/control projection levels.
- Direct peer messaging remains outside the acceptance gate; parent-mediated
  relay is the first product contract.
