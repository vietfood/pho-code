# Phase 3: Connect the live backend to the harness

- Status: **PASS — 2026-07-15** ([evidence](../evidence/phase-3-2026-07-15.md))
- Depends on: [Phase 2](phase-2-headless-harness.md)
- Produces: Headless live agent turn using the owned loop
- Next: [Phase 4](phase-4-tools.md)

## Required reading

1. [DeepSeek backend architecture](../../architecture/deepseek-api-backend.md)
2. [System event flow](../../architecture/native-harness-system.md#canonical-event-flow)
3. [Command-mode lifecycle](../../architecture/native-harness-system.md#presentation-adapters-and-application-lifecycle)
4. [Current DeepSeek qualification status](../../qualification/README.md)

## Outcome

The qualified Phase 1B backend and deterministic Phase 2 loop work as one live `pho` agent. Pho Code owns request context, assistant-phase assembly, tool continuation, cancellation, usage, command projection, and terminal state.

## Work

- Translate canonical context into the exact live-qualified full-history DeepSeek messages.
- Include only qualified request fields, fixed tool definitions, model/thinking/effort controls, maximum output, and required provider reasoning replay.
- Keep local request identity unique and assistant/tool provider identities exact according to Phase 1B evidence.
- Map reasoning, text, and indexed tool deltas into one local assistant phase.
- Treat the completed assistant phase, recognized finish reason, `[DONE]`, and accepted usage as authoritative.
- Assemble tool arguments by call identity and dispatch only after completion and schema validation.
- Run the harmless in-memory Phase 1B tool through the real Phase 2 loop and `pho` command projection.
- Exercise approval denial through a fake mutating tool without local effects.
- Cancel during text, reasoning, tool-argument streaming, approval wait, and continuation request.
- Surface missing/invalid key, insufficient balance, unknown model, request/schema rejection, incompatible choice/event, missing finish/terminator, malformed call, rate limit, service failure, resource interruption, stale price profile, and local overload through redacted domain errors.
- Render prompt/cache/output/reasoning usage and a dated estimated cost without presenting it as the account ledger or a hard cap.
- Prove command broken-pipe, terminal-loss, signal, and renderer-overload behavior while live work is active.

Do not add real workspace tools, automatic model retry, arbitrary base URLs, provider discovery, beta API features, or sessions in this phase.

## Evidence

Add live command checks for a text turn, provider-returned reasoning, multiple in-memory tool continuation, denial continuation, cancellation matrix, usage/cost projection, and full-history follow-up preserving assistant grouping, exact call/result identities, and required reasoning. Update the dated compatibility record when the live profile changes.

## Gate

Phase 3 passes when the qualification index's DeepSeek latest observation points to the active `PASS`, that account/model/thinking profile completes the live `pho` scenarios through the Phase 2 loop, no incomplete/cancelled/filtered/resource-interrupted/length-stopped call executes, required reasoning and exact IDs survive every continuation, ambiguous delivery is not retried automatically, usage/cost remains honest, and all observed command output remains bounded and redacted.
