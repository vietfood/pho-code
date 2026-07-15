# Pho Code documentation

This directory is the design, delivery, and evidence record for Pho Code. Each concern has one current owner; other documents link to it instead of copying its contract.

## Product direction

Pho Code V1 is an independently owned Rust harness with one DeepSeek API backend, a stable `pho` command surface, and a native GPUI surface over the same runtime. It owns API-key custody, direct streamed transport, context and tool continuation, first-party tools, approvals, sessions, recovery, and presentation projection. [ADR 0003](decisions/0003-deepseek-api-first-backend.md) records the current boundary.

The former ChatGPT OAuth attempt reached its designed stop condition because no authorized public Pho Code client identity was established. It is frozen, never live-qualified, and is not a runtime fallback. [Phase 1B](implementation/v1/phase-1b-deepseek-api-qualification.md) now qualifies a user-owned DeepSeek API key, `deepseek-v4-flash` with thinking enabled/high, streamed reasoning and tool continuation, usage/cost projection, and the initial command-mode vertical slice.

## Authority map

| Concern | Current owner | Status |
| --- | --- | --- |
| Product scope, DeepSeek pivot, command boundary, rationale, alternatives, reversal conditions | [ADR 0003](decisions/0003-deepseek-api-first-backend.md) | Accepted decision snapshot |
| Components, dependency direction, identities, state, event flow, command/GPUI/runtime boundary | [Native harness system](architecture/native-harness-system.md) | Normative V1 architecture |
| API key, Keychain, Chat Completions, SSE, assistant phases, reasoning/tool replay, models, usage/cost | [DeepSeek API backend](architecture/deepseek-api-backend.md) | Normative; live qualification pending |
| Search, reads, patch, shell, approvals, output limits | [V1 tools](architecture/tools.md) | Normative V1 architecture |
| JSONL, artifacts, durability, recovery, context reconstruction | [Sessions](architecture/sessions.md) | Normative V1 architecture |
| Phase order, status, and completion rules | [Implementation roadmap](implementation/README.md) | Ready for execution |
| Direct dependency baseline and licenses | [Dependency baseline](implementation/dependencies.md) | Phase 0 evidence |
| Detailed V1 work | [Phase 0](implementation/v1/phase-0-foundation.md), [frozen Phase 1](implementation/v1/phase-1-chatgpt-codex-qualification.md), [Phase 1B](implementation/v1/phase-1b-deepseek-api-qualification.md), [Phase 2](implementation/v1/phase-2-headless-harness.md), [Phase 3](implementation/v1/phase-3-live-backend.md), [Phase 4](implementation/v1/phase-4-tools.md), [Phase 5](implementation/v1/phase-5-sessions.md), [Phase 6](implementation/v1/phase-6-gpui.md) | Phase-specific |
| Compaction, subagents, second backend/portability | [V2 roadmap](implementation/v2/README.md) | Reserved; intentionally brief |
| Live external results | [Qualification records](qualification/README.md) | ChatGPT stopped; DeepSeek Phase 1B pending |
| Upstream behavior | [Pi study](research/pi-source-study.md) and [Codex study](research/codex-source-study.md) | Complete at recorded revisions |
| Contributor workflow and commands | [AGENTS.md](../AGENTS.md) | Normative repository instructions |

Historical ADR 0001 material remains available as evidence: [decision](decisions/0001-codex-app-server-sidecar.md), [system](architecture/system.md), [protocol](architecture/app-server-protocol.md), [compaction](architecture/compaction.md), [subagents](architecture/subagents.md), and [implementation plan](implementation-plan.md). ADR 0002, the [ChatGPT backend contract](architecture/chatgpt-codex-backend.md), [Phase 1 plan](implementation/v1/phase-1-chatgpt-codex-qualification.md), and [stop record](qualification/chatgpt-codex-2026-07-14.md) are the later frozen ChatGPT attempt. None of those bodies is a current V1 contract.

## Document roles

- A decision record answers why and what was accepted. It may retain historical detail after architecture evolves.
- Architecture answers how the current system must behave.
- A phase file answers what to build next and what evidence closes the phase.
- A qualification record answers what worked against an external service on a specific date.
- A source study answers what an audited upstream revision did.

Do not add a second architecture summary to a phase file or a second implementation checklist to architecture. Link to the owner and record only phase-specific work.

## Terminology

- **Harness:** Pho Code-owned context, loop, tools, approvals, and session runtime.
- **Backend:** Provider-specific credential/wire adapter. `DeepSeekBackend` is the only supported real V1 backend; `ScriptedBackend` is deterministic test infrastructure.
- **Command adapter:** The `pho` parser, controlling-terminal interaction, and canonical terminal renderer over the shared application runtime.
- **Session:** Pho Code's append-only local conversation journal for one workspace and qualified backend/model/thinking profile.
- **Turn:** One user-initiated unit ending completed, failed, cancelled, interrupted, or uncertain.
- **Assistant phase:** One provider-completed assistant message grouping optional text, provider-returned reasoning, and ordered tool calls for exact continuation.
- **Item:** Typed content such as user text, assistant text, provider reasoning, tool call/result, approval, usage, or terminal state projected from canonical phases and events.
- **Projection:** Rebuildable in-memory terminal/GPUI state derived from canonical events and session records.
- **Provider reasoning:** Reasoning content explicitly returned by DeepSeek. It is sensitive observable content, distinct from withheld reasoning and from Pho Code-authored summaries.
- **Compaction:** V2 context replacement work, absent from V1.
- **Subagent:** V2 child session with independent identity, history, lifecycle, and budget, absent from V1.

## Evidence policy

Use these labels consistently:

- **Verified:** Directly observed in checked-out source, generated output, or a command that actually ran.
- **Reasoned:** An architectural consequence inferred from verified evidence.
- **Decision:** A Pho Code choice recorded by an accepted decision or normative architecture.
- **Fixture-tested:** Pho Code behavior proven only against deterministic local input.
- **Live-qualified:** Exercised against the external service for the recorded account class, model, date, and application revision.
- **Unverified:** Requires evidence not yet obtained.

Documentation is not a permanent service guarantee. DeepSeek model names, limits, prices, terms, and behavior require dated qualification. Pi/Codex OAuth identities, headers, endpoints, and model catalogs remain historical source evidence and must not be described as supported Pho Code contracts.

## Evidence baseline

- Codex source: `393f64565ab46f09d99ca4d9bd973537e72a114b`
- Pi source: `0e6909f050eeb15e8f6c05185511f3788357ddb3`
- `fff-search` documentation observed: `0.9.6`
- Locally inspected Codex CLI during the audit: `codex-cli 0.144.1`
- DeepSeek API and pricing reviewed: `2026-07-15`; Open Platform terms and linked privacy material last reviewed: `2026-07-14`

The checked-out repositories under `refs/**` are evidence, not extension points. Codex is Apache-2.0 and Pi is MIT; copied source requires applicable review and notices.

## Documentation lifecycle

ADRs are append-only in intent. Supersede a changed decision instead of erasing its rationale. Mutable architecture should stay current and link back to its governing decision. Phase files may become more detailed immediately before execution but should not copy component contracts. Qualification records are dated and additive.

## Current status

[V1 Phase 0](implementation/v1/phase-0-foundation.md) passed on 2026-07-14 with [recorded evidence](implementation/evidence/phase-0-2026-07-14.md). [ChatGPT Phase 1](implementation/v1/phase-1-chatgpt-codex-qualification.md) ended `STOP — FROZEN` on 2026-07-14 without a live request. [V1 Phase 1B](implementation/v1/phase-1b-deepseek-api-qualification.md) passed on 2026-07-15 with [live model, usage, tool-replay, cancellation, credential-lifecycle, and command evidence](qualification/deepseek-2026-07-15.md). [Phase 2](implementation/v1/phase-2-headless-harness.md) passed on 2026-07-15 with [deterministic headless evidence](implementation/evidence/phase-2-2026-07-15.md). [Phase 3](implementation/v1/phase-3-live-backend.md) passed on 2026-07-15 with [live-loop, cancellation, denial, usage, and command evidence](implementation/evidence/phase-3-2026-07-15.md); Phase 4 is ready.
