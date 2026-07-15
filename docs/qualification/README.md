# Compatibility qualification records

- Status: DeepSeek Phase 1B live qualification passed on 2026-07-15
- Owner: Implementation evidence, not architecture
- Current producer: [V1 Phase 1B](../implementation/v1/phase-1b-deepseek-api-qualification.md)

This directory stores dated, sanitized results from live external compatibility checks. Architecture defines required behavior; a qualification record states what was actually exercised for one application revision, account class, model, platform, and date.

A record must distinguish fixture evidence from live evidence and must never contain API keys, tokens, authorization material, account IDs, personal identity, live prompts/responses/reasoning, raw traffic, tool arguments/results, workspace content, or provider replay values.

Maintain two explicit pointers for each supported or attempted provider:

- **Latest observation/status:** the newest qualification attempt, including `STOP`, expiry, or invalidation. A dependent live phase may proceed only when this entry says the linked passing profile remains current.
- **Latest passing profile:** the newest historical `PASS` record, retained even when a later observation invalidates it.

A `PASS` updates both pointers. A `STOP`, expiry, or invalidation updates only the latest observation/status and blocks Phase 3 until a new `PASS`; it never rewrites the historical passing record.

## DeepSeek API

- Latest observation/status: **PASS on 2026-07-15.** See the [current DeepSeek record](deepseek-2026-07-15.md).
- Latest passing profile: **`deepseek-v4-flash`, thinking enabled, reasoning effort high, streamed Chat Completions — 2026-07-15.**

The passing record qualifies the concrete profile through `pho`; model availability or a successful `/models` response alone would not establish it.

## Frozen ChatGPT Codex attempt

- Latest observation/status: **STOP — FROZEN on 2026-07-14; deterministic/macOS-local work completed, but no live request ran because an authorized public Pho Code OAuth client identity was not established.** See the [final stop record](chatgpt-codex-2026-07-14.md).
- Latest passing profile: **None.**

This historical provider is not a V1 runtime choice or fallback. Its pointers remain separate so a future DeepSeek pass cannot be misrepresented as ChatGPT compatibility.
