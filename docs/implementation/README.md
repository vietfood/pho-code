# Implementation roadmap

- Status: Ready for execution
- Last updated: 2026-07-15
- Governing decision: [ADR 0003](../decisions/0003-deepseek-api-first-backend.md)
- System boundary: [Native harness system](../architecture/native-harness-system.md)

## Purpose

This directory owns delivery order, phase scope, dependencies, and acceptance gates. It does not redefine architecture. Each phase links to the normative document that owns behavior and records only the work needed to implement and verify that behavior.

## How to use the plan

Before a phase begins, read its phase file and every document in its **Required reading** section. Treat linked architecture as authoritative when a phase summary is shorter. If implementation evidence contradicts architecture, stop and update the decision or architecture before coding around it.

Phases execute in order. Preparatory read-only research may overlap, but a later phase cannot bypass an unmet gate. The original Phase 1 reached its designed stop condition and is frozen; it is not relabeled as a pass. Phase 1B is the replacement product-viability gate, and the full harness must not be built around a DeepSeek credential, stream, reasoning, tool, or usage assumption it fails to qualify.

Every pre-GPUI phase leaves the passing functionality usable through the `pho` command adapter. Command mode and GPUI share one reducer, coordinator, loop, backend, tool runtime, session store, and canonical event stream. A phase must not create a probe-only runtime that later UI work replaces.

## V1 sequence

| Phase | Deliverable | Plan | Status |
| --- | --- | --- | --- |
| 0 | Reproducible module, dependency, runtime, and test foundation | [Foundation](v1/phase-0-foundation.md) | **PASS — 2026-07-14** ([evidence](evidence/phase-0-2026-07-14.md)) |
| 1 | Determine whether honest ChatGPT subscription OAuth is viable | [Frozen ChatGPT Codex qualification](v1/phase-1-chatgpt-codex-qualification.md) | **STOP — FROZEN, 2026-07-14**; no authorized public client identity, no live request |
| 1B | Live-qualified DeepSeek credential, transport, assistant-phase seam, and initial `pho` commands | [DeepSeek API qualification](v1/phase-1b-deepseek-api-qualification.md) | **PASS — 2026-07-15** ([record](../qualification/deepseek-2026-07-15.md)) |
| 2 | Deterministic headless agent loop using a scripted backend through the same command/runtime boundary | [Headless harness](v1/phase-2-headless-harness.md) | **PASS — 2026-07-15** ([evidence](evidence/phase-2-2026-07-15.md)) |
| 3 | Live backend connected to the owned loop | [Live backend integration](v1/phase-3-live-backend.md) | **PASS — 2026-07-15** ([evidence](evidence/phase-3-2026-07-15.md)) |
| 3B | Optional alternate-screen terminal TUI with repeated independent ephemeral turns and preserved raw modes | [Interactive terminal experience](v1/phase-3b-terminal-tui.md) | **In progress — local implementation complete; supervised live/manual qualification pending, 2026-07-15** |
| 4 | Tool runtime and controlling-terminal approvals proven in disposable workspaces through `pho` | [Tools](v1/phase-4-tools.md) | **Deferred — Phase 3B selected before execution** |
| 5 | JSONL, persistent artifacts, crash recovery, safe tool enablement, and stable pre-GPUI command release | [Sessions](v1/phase-5-sessions.md) | Planned |
| 6 | Usable native GPUI personal release over the proven command-mode runtime | [GPUI V1](v1/phase-6-gpui.md) | Planned |

The accepted V1 product boundary is defined once in [ADR 0003](../decisions/0003-deepseek-api-first-backend.md#decision). Component ownership and state flow are defined once in [the system architecture](../architecture/native-harness-system.md). Phase files should link to those sections instead of copying them.

## V2 roadmap

[The V2 roadmap](v2/README.md) reserves compaction, subagents, and a second backend/portability phase. It is intentionally brief. V1 implementation evidence must exist before those designs are expanded.

## Verification levels

| Level | Environment | Evidence supplied |
| --- | --- | --- |
| L0: pure unit | No filesystem, process, network, Keychain, or GPUI | Parsers, reducers, state machines, schema validation, context assembly |
| L1: local component | Temporary directories, loopback services, deterministic processes, fake clock and credentials | I/O, cancellation, limits, recovery, and redaction |
| L2: headless integration | Command adapter plus scripted backend, real loop, tools, and session store | Whole owned harness without GPUI or external service |
| L3: live compatibility | User-owned DeepSeek key and real network with sanitized observations | Key validation, model/profile compatibility, direct Chat Completions, reasoning/tool replay, usage, and command behavior |
| L4: native interaction | Real macOS GPUI application | Layout, approvals, cancellation, restart, and usability |

Fixture evidence proves behavior against a fixture. Live evidence proves only the observed account, model, date, and application revision. Neither may be described as a permanent public service contract.

## Phase completion rule

A phase is complete only when:

1. Its deliverables exist and obey the linked architecture.
2. Every required automated check actually ran and passed. An unavailable check is a recorded verification gap and leaves the phase incomplete.
3. Required live or manual evidence ran and passed at the stated verification level.
4. Security-sensitive types and diagnostics have explicit redaction tests.
5. Failure, cancellation, overload, and interruption paths are observable.
6. Documentation reflects behavior discovered during implementation.
7. The passing behavior is operable through the current `pho` command surface unless the phase is explicitly below command startup, and command/process checks passed where required.
8. The gate result is recorded as `PASS`, or `PASS WITH FOLLOW-UP` only when every gate and required check passed and the named follow-up is explicitly non-gating.

A verification gap or `STOP` leaves the gate unmet and blocks every dependent phase. Record the reason and reassess; do not advance by relabeling it as a follow-up.

## Status update protocol

After a gate result, update this roadmap's phase row with the outcome, date, and evidence link. On `PASS`, mark only the next phase `Ready` and update [the documentation index's current pointer](../README.md#current-status). On `STOP` or a verification gap, record that status and evidence without advancing the dependent phase. A superseding ADR may define a replacement gate, as ADR 0003 did with Phase 1B; it does not convert the stopped phase into a pass. Keep phase metadata consistent with this table.

## Command baseline

[AGENTS.md](../../AGENTS.md#build-and-test-workflow) is the single owner of repository build and test commands. Phase files name only additional phase-specific checks. A fetch failure, unavailable live account, or unavailable advisory database remains a verification gap rather than a pass.

## Stop and reassess

Stop the current phase when implementation would require changing authority, persisted data, security posture, supported identity, or V1 scope. In particular, stop if DeepSeek use requires a shared embedded key or credential leakage, if command mode needs a second runtime, if a side effect cannot be bound to an approval, if recovery would need to guess whether an effect occurred, or if a V2 feature becomes necessary to complete the stated V1 outcome.
