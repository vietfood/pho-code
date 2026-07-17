# V2 roadmap

- Status: Phase 6B ready; later expansion phases reserved
- Earliest start: After V1 `0.1.0`
- Governing boundary: [ADR 0003](../../decisions/0003-deepseek-api-first-backend.md#v1-and-v2-boundary)

## Why this is brief

V2 must be shaped by evidence from a working V1. Phase 6B is the bounded completion work deliberately deferred by [ADR 0005](../../decisions/0005-release-v1-and-defer-phase-6b.md); it adds no product surface. Expanding compaction, subagent, provider-portability, sandbox, and platform plans now would create precise-looking requirements for untested boundaries. Each expansion phase begins with a new ADR and one representative design decision developed to full depth.

## Phase 6B: Complete native qualification

[Phase 6B](phase-6b-native-completion.md) closes the final clean-suite, multi-terminal interaction, command/native parity, supervised-task, accessibility, display, theme, and supported-macOS evidence deferred from V1. It must pass before Phase 7 begins.

## Phase 7: Native compaction

Design context measurement, safe tool-aware cut points, summary provenance, append-only replacement records, failure/cancellation, and a golden quality corpus. The [historical compaction study](../../architecture/compaction.md) and Pi/Codex source studies are inputs, not the native contract.

The phase cannot rewrite visible history, orphan tool call/result pairs, hide approvals/effects, or claim lossless summarization.

## Phase 8: Native subagents

Design parent/child sessions, delegation context, budgets, scheduling, approval ownership, cancellation, attribution, crash recovery, and a Claude Code-like interaction surface after runtime semantics are stable. The [historical subagent study](../../architecture/subagents.md) is requirements evidence, not the implementation design.

Every child action must be attributable, bounded, separately inspectable, recoverable, and unable to bypass root approval policy.

## Phase 9: Second backend and hardening

Implement and live-qualify one materially different second backend before generalizing the backend seam. Frozen, never-qualified ChatGPT code does not satisfy this requirement. Use the second operational backend to decide which request, event, reasoning, usage, credential, and tool-call types are genuinely shared.

Only then decide additional platforms, credential adapters, configurable endpoints, process and Trash/Recycle Bin behavior, strong sandboxing, richer patch semantics such as file moves, distribution, migration, telemetry/privacy, persistent search metadata, public tools/plugins, parallel execution, and branching. Command mode remains an adapter over the same runtime for every future backend.

## Expansion rule

When V1 is complete, replace each phase summary with a linked ADR, normative architecture, and phase plan. Preserve this file as the roadmap index rather than copying those details back into it.
