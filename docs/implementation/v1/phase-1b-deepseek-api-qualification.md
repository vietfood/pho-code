# Phase 1B: Pivot to and qualify the DeepSeek API

- Status: **PASS — 2026-07-15** ([record](../../qualification/deepseek-2026-07-15.md))
- Depends on: [Phase 0 pass](phase-0-foundation.md) and the recorded [ChatGPT Phase 1 stop](phase-1-chatgpt-codex-qualification.md)
- Produces: Qualified DeepSeek credential/backend profile, provider-neutral assistant-phase seam, stable initial `pho` commands, sanitized fixtures, and a dated go/stop record
- Next: [Phase 2](phase-2-headless-harness.md)

## Why this phase exists

The original Phase 1 correctly stopped because Pho Code could not establish an authorized public ChatGPT OAuth client identity. [ADR 0003](../../decisions/0003-deepseek-api-first-backend.md) retains the owned harness, freezes that provider path, selects DeepSeek's documented API-key service, and requires a stable command surface before GPUI.

This phase is a pivot, not a second attempt to finish the old OAuth gate. It reuses bounded HTTP/SSE, cancellation, secret-redaction, Keychain, and fixture mechanisms where their contracts remain valid; it replaces OAuth state, Responses DTOs, encrypted replay, provider-item assumptions, and the one-off `phase1_probe` product path.

The phase includes a narrow no-tool vertical slice of the real loop so `pho chat` can qualify live streaming through application intents and canonical events. Phase 2 extends that same loop with deterministic tool continuation rather than replacing a temporary CLI runner.

## Required reading

Read these completely before implementation:

1. [ADR 0003](../../decisions/0003-deepseek-api-first-backend.md).
2. [DeepSeek backend architecture](../../architecture/deepseek-api-backend.md).
3. [Native harness system](../../architecture/native-harness-system.md), especially the presentation-adapter and assistant-phase boundaries.
4. [Sessions](../../architecture/sessions.md#model-context-reconstruction) for the future durable grouping this phase's serializable types must support.
5. Official DeepSeek [quick start](https://api-docs.deepseek.com/), [models](https://api-docs.deepseek.com/api/list-models), [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/), [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/), [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls), [errors](https://api-docs.deepseek.com/quick_start/error_codes/), [rate/keep-alive behavior](https://api-docs.deepseek.com/quick_start/rate_limit/), and [pricing](https://api-docs.deepseek.com/quick_start/pricing/) pages.
6. Current DeepSeek [Open Platform terms](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html) and linked privacy material for dated release evidence, without treating this engineering review as legal advice.
7. [Qualification record index](../../qualification/README.md).

## Phase outputs

The phase must leave:

- one user-facing executable named `pho` while retaining `pho-code` as the Rust package name;
- a terminal adapter that dispatches application intents and renders canonical events without owning runtime work;
- `pho login`, `pho status`, `pho logout`, `pho chat`, and explicit `pho chat --stdin` behavior;
- a DeepSeek-specific API-key credential record and actor backed by macOS Keychain;
- a concrete `backend::deepseek` request, SSE chunk mapper, assistant-phase assembler, usage mapper, and error classifier;
- a provider-neutral backend seam centered on completed assistant phases rather than Codex Responses items;
- the real no-tool agent-loop vertical slice used by command mode;
- sanitized deterministic model-list, request, stream, reasoning, tool-call, usage, and error fixtures;
- one in-memory tool continuation used only for qualification after no-tool chat succeeds;
- a dated DeepSeek qualification record and explicit model/profile allowlist;
- frozen ChatGPT source preserved under an explicit historical boundary outside default runtime selection and compilation.

## Implementation ownership

The intended current shape is:

```text
Cargo.toml
  [[bin]] name = "pho", path = "src/main.rs"

src/
  main.rs                 process entry, command selection, runtime startup
  cli/
    command.rs            bounded syntax and typed intent construction
    renderer.rs           canonical terminal projection
    terminal.rs           controlling-TTY secret and approval input
  app/
    action.rs             shared typed intents
    reducer.rs            one state transition owner
    runtime.rs            coordinator and task ownership
    state.rs              credential/workspace/session/turn projection
  auth/
    api_key.rs            candidate validation and credential actor
    keychain.rs           versioned DeepSeek Keychain record
  backend/
    mod.rs                provider-neutral request, assistant phase, events, errors
    deepseek.rs           private DeepSeek DTOs and transport
    profile.rs            dated DeepSeek model/thinking/price profile
    sse.rs                shared bounded byte framing only
    scripted.rs           deterministic normalized backend
  agent/
    loop_runtime.rs       no-tool slice extended in Phase 2
```

Exact files may change, but ownership may not. Terminal code never receives a credential lease or provider DTO. `backend::mod` does not gain a union of Codex and DeepSeek optional fields. Frozen ChatGPT source may move to an explicit historical namespace outside the default module graph. If a developer-only Cargo feature compiles it, that feature must pass the normal all-feature baseline; no command or ordinary runtime can select it.

## Work sequence

### 1. Close and preserve the old qualification

- Change the 2026-07-14 ChatGPT record from pending to `STOP — FROZEN` and state that no live request ran.
- Record the exact stop reason: no authoritative public Pho Code OAuth client identity was established.
- Preserve deterministic implementation evidence and test results without promoting them to service compatibility.
- Remove the old record from current qualification pointers while retaining its historical link.
- Do not delete source, fixtures, or evidence as part of the pivot.

### 2. Freeze a DeepSeek evidence matrix

Create a dated qualification draft with one row per external assumption:

- production origin and models/chat paths;
- bearer authentication and redirect policy;
- model-list response and configured-model presence;
- `deepseek-v4-flash`, thinking enabled, and high effort;
- request fields, maximum output, tool schema, and tool choice;
- SSE comments, data frames, usage-only chunk, and `[DONE]`;
- content, reasoning, tool-call index/ID/name/argument deltas;
- finish reasons and multiple-tool-call ordering;
- required reasoning replay for tool continuations;
- usage/cache/reasoning fields and cost arithmetic;
- documented error statuses and retry guidance;
- current model aliases, limits, prices, terms, and privacy-review dates.

Each row links first-party documentation, states the Pho Code decision, names its deterministic test, reserves a sanitized live result, and labels volatile facts as dated observations. No live key, prompt, response, reasoning, tool argument, account data, raw traffic, or authorization header enters the record.

### 3. Replace the shared Codex-shaped backend seam

Refactor the core types before adding a DeepSeek adapter:

- Replace `OpaqueReplayState` and flattened `BackendInput` provider-item assumptions with canonical user messages, completed assistant phases, and paired tool results.
- Define `AssistantPhase` to group optional assistant text, optional provider-returned reasoning, replay requirement, ordered completed calls, and bounded provider compatibility metadata.
- Keep local item/phase/call identities distinct from provider completion and tool-call IDs.
- Replace separate provider-item completion assumptions with events that can represent deltas followed by one authoritative completed assistant phase.
- Retain usage fields for prompt, cache hit, cache miss, output, reasoning, and total tokens without assuming every provider supplies every field.
- Keep all secret and content-bearing `Debug` implementations redacted.
- Update `ScriptedBackend` fixtures to the new seam before the live adapter depends on it.

Do not add provider enums, generic wire DTOs, a registry, custom base URLs, or optional Codex fields. The seam expresses harness facts justified by both the scripted loop and current DeepSeek contract.

### 4. Establish the one command/runtime boundary

Change the package to produce `pho` and implement command parsing as an adapter:

- `pho login` dispatches `InstallCredential` after reading a key from a controlling terminal with echo disabled.
- `pho status` dispatches `InspectCredentialStatus` and performs no remote inference.
- `pho logout` dispatches `RemoveCredential` and reports Keychain deletion truthfully.
- `pho chat` reads one bounded prompt from a controlling terminal and dispatches `SendEphemeralPrompt`.
- `pho chat --stdin` reads one bounded prompt from stdin explicitly; it never treats piped input as an implicit mode.

Prompt text is not accepted in argv because shell history and process inspection can disclose it. API keys are never accepted through argv, environment, ordinary stdin, files, shell interpolation, or redirected input.

The adapter renders events and does not call the actor/backend directly. Broken pipes, SIGINT, terminal loss, renderer overload, and process shutdown become typed cancellation/lifecycle inputs. A successful exit requires a canonical successful terminal state. Failure output remains redacted and distinguishes invalid usage, missing credential, model/service failure, cancellation, interrupted ambiguity, and internal failure.

### 5. Implement API-key custody and model validation

- Replace the OAuth credential bundle with the versioned record in [the backend contract](../../architecture/deepseek-api-backend.md#keychain-record).
- Use a distinct production Keychain account from frozen ChatGPT credentials.
- Require the shell-owned single-instance guard before actor construction and Keychain access.
- Validate candidate shape locally without revealing length or prefix in errors.
- Validate remotely through `GET /models` with redirects disabled and a hard response/time limit.
- Require the candidate model in the returned bounded list without treating list presence as full qualification.
- Commit only a remotely accepted candidate; preserve the prior committed key if validation or replacement fails.
- Treat 401 as invalid, 402 as insufficient balance only where documented for inference, transient transport/server failure as temporary, and model absence as profile incompatibility.
- Ensure logout prevents new leases before deletion and quarantines a record whose deletion fails.

Test missing/malformed stored data, first install, replacement success, invalid candidate with prior key, validation timeout, redirect, oversized/malformed model list, missing model, Keychain read/write/delete failure, second process, owner crash, logout race, and seeded-secret absence.

### 6. Implement DeepSeek request construction

- Use the fixed production origin and direct Rust HTTP stack.
- Build only the qualified minimum OpenAI-format Chat Completions body.
- Set model, thinking, high reasoning effort, streaming, usage inclusion, and a bounded positive `max_tokens` explicitly.
- Omit tools and tool choice in no-tool chat; add fixed tools only in the qualification continuation.
- Reject unqualified models, thinking modes, beta features, arbitrary endpoints/headers, multi-choice requests, and unsupported fields before send.
- Project complete canonical assistant phases without losing text/reasoning/call grouping.
- Bound every message, schema, identifier, content field, aggregate request, and serialized body.

Add exact wire-shape tests whose failures display field paths but no prompt, instructions, reasoning, tool arguments, or key.

### 7. Adapt the bounded SSE stack

Reuse only byte-framing behavior that remains valid. The DeepSeek semantic mapper must cover:

- LF/CRLF, split UTF-8, multiple data lines, comments, and `: keep-alive`;
- byte-liveness versus semantic-progress deadlines;
- one stable completion ID/model and exactly choice index zero;
- reasoning/content deltas and empty deltas;
- tool-call slots assembled by tool index with stable ID/name/type;
- one usage-only chunk with empty choices;
- `stop`, `tool_calls`, `length`, `content_filter`, and `insufficient_system_resource`;
- `[DONE]` only after a recognized semantic finish;
- malformed/oversized frames, event/item/aggregate overflow, duplicate/late terminal, inconsistent IDs, unknown finish reason, and abrupt EOF.

Completed assistant phases replace delta projections as authority. Partial reasoning/text may remain visible after interruption but does not become replayable history. Partial calls never execute.

### 8. Build the no-tool vertical slice behind `pho chat`

Implement the narrow real path that Phase 2 will extend:

1. The command adapter dispatches a bounded ephemeral user prompt.
2. The reducer accepts it only with a ready credential and qualified profile.
3. The coordinator starts the same `AgentLoop` owner used later.
4. The loop builds one no-tool context and starts `DeepSeekBackend`.
5. Canonical reasoning/text deltas render through the terminal adapter.
6. The authoritative assistant phase, usage, cost estimate, and terminal state reach the reducer.
7. Cancellation or failure produces one terminal state and process result.

No session journal, workspace tool, automatic retry, or GPUI type is introduced. The ephemeral transcript is explicitly not crash-durable. The command must not be named or implemented as a provider probe.

### 9. Prove reasoning and in-memory tool continuation

Add one harmless deterministic in-memory function tool through the actual normalized boundary:

1. Send a fixed local schema with automatic tool choice.
2. Assemble every returned call under hard limits and wait for `tool_calls` plus `[DONE]`.
3. Strictly parse and validate complete argument objects without repair.
4. Execute completed calls sequentially in provider order.
5. Build tool messages with exact call IDs and deterministic results.
6. Replay the original assistant phase, including required complete `reasoning_content`, before those tool messages.
7. Receive a final assistant phase and terminal usage.
8. Round-trip the complete assistant phase through its candidate durable DTO.

Test multiple calls, interleaved call deltas, changed indices/IDs/names, missing reasoning, invalid JSON/schema, cancellation, length/filter/resource finish, EOF, and duplicate call identity. No filesystem or process tool is enabled.

### 10. Implement usage and dated estimated cost

- Parse checked prompt, cache-hit, cache-miss, completion, reasoning, and total values.
- Establish by live evidence whether the initial profile requires the usage-only chunk.
- Reject arithmetic overflow and retain explicit unknown fields rather than inventing zero.
- Verify whether reasoning tokens are included in completion tokens and never double-count them.
- Store current published rates only in a dated nonsecret profile used for estimates.
- Label every monetary value as estimated with currency and observation date.
- Mark cost unknown when authoritative token fields or a matching price profile are unavailable.
- Enforce output-token and continuation limits independently of estimated money.

### 11. Qualify command reliability

Test command behavior at process boundaries:

- help/version and invalid command without actor startup;
- no-TTY secret input and terminal echo restoration after success, error, panic boundary, cancellation, and signal;
- prompt-size and invalid UTF-8 rejection;
- explicit stdin mode, empty stdin, over-limit stdin, and no implicit pipe mode;
- stdout/stderr broken pipe before and during stream;
- SIGINT before send, before first event, during reasoning/text, and after terminal;
- canonical exit result for success, usage error, missing/invalid key, insufficient balance, rate limit, cancellation, ambiguous interruption, and internal failure;
- no secret/content marker in argv snapshots, process errors, logs, panic output, or diagnostic fixtures.

Use process integration tests rather than only calling the parser. Manual macOS evidence must verify no-echo input, Keychain prompts, restart reuse, and signal behavior in a real terminal.

### 12. Write the live qualification record

Create `docs/qualification/deepseek-YYYY-MM-DD.md` containing:

- Pho Code revision, macOS version/architecture, DeepSeek account class without identity, and credential path exercised;
- reviewed API, model, pricing, terms, and privacy document dates;
- validated production origin and model-list behavior;
- selected model, thinking/effort profile, maximum output limit, and observed system fingerprint only if safely useful;
- text, reasoning, tool continuation, exact replay, cancellation, error, and usage results;
- cache hit/miss fields and dated price observations;
- command no-echo, restart reuse, status, logout, broken pipe, signal, and redaction results;
- remaining assumptions and an explicit `PASS` or `STOP`.

Never include a key, account identifiers, prompt/output/reasoning content, raw request/response, full error body, tool argument/result, workspace content/path, or authorization header.

## Deterministic test matrix

| Area | Minimum cases |
| --- | --- |
| Core seam | assistant-phase grouping, local/provider ID separation, exact call/result pairs, required-reasoning marker, redacted debug/serialization errors |
| Credentials | candidate shape, transactional replacement, prior-key preservation, Keychain failures, 401 invalidation, temporary failure, logout race, process guard |
| Models | success, missing candidate, malformed/oversized list, redirect, timeout, unknown fields, bounded count/IDs |
| Request | qualified minimum shape, full phase replay, tool omission/presence, unsupported field rejection, aggregate limit |
| SSE | fragmentation, UTF-8, CRLF/LF, multiline, comments/keep-alive, timeout classes, malformed/oversized, choice/ID mismatch, terminal matrix, EOF |
| Tools | indexed delta assembly, multiple ordered calls, strict JSON/schema, exact IDs, reasoning replay, missing replay, no partial execution |
| Usage/cost | cache fields, reasoning inclusion, usage-only chunk, missing/conflicting values, overflow, stale/missing price, dated estimate label |
| Ambiguity | failure before send, after send/before headers, after event, cancellation at each stage, no automatic retry |
| Command | help, secret TTY, no TTY, stdin opt-in, prompt bounds, renderer backpressure, broken pipe, signals, exit status |
| Redaction | seeded key/prompt/reasoning/tool/header markers absent from argv, environment, errors, logs, debug, fixtures, and qualification output |

## Required checks

Run focused tests throughout, then the repository baseline in [AGENTS.md](../../../AGENTS.md#build-and-test-workflow). Live checks are opt-in, use only the real credential actor/Keychain path, and must avoid ordinary workspaces and sensitive prompts. A skipped live or manual command check does not satisfy the hard gate.

## Hard gate

Phase 1B passes only when:

1. The original ChatGPT record says `STOP — FROZEN`, and no ordinary runtime command can select that backend.
2. Core backend types contain no Codex encrypted-replay or provider-item assumptions and preserve DeepSeek assistant phases exactly.
3. `pho login`, `status`, `logout`, `chat`, and explicit `chat --stdin` use the shared intent/reducer/coordinator boundary and pass process-level redaction/cancellation tests.
4. A user-owned key validates through `/models`, survives restart in Keychain, and is removed or visibly quarantined by logout.
5. `deepseek-v4-flash` with thinking enabled/high completes streamed text, provider reasoning, in-memory tool call/result continuation, exact required reasoning replay, cancellation, and usage reporting.
6. SSE terminal, error, resource-limit, keep-alive, malformed, and delivery-ambiguity behavior is deterministic and bounded.
7. Usage and cost display is arithmetically safe, dated, explicitly estimated, and never represented as a hard account cap.
8. The dated qualification evaluates every ADR 0003 stop condition and says `PASS`; the qualification index points to it as the current passing profile.
9. Repository formatting, check, build, test, clippy, documentation links, and manual macOS command checks all pass with their exact evidence recorded.

Stop and revisit ADR 0003 if the live service requires a shared embedded key, arbitrary redirect, beta-only core tool behavior, silent model substitution, unbounded provider reasoning/tool state, missing exact replay data, provider-stored thread state, or a privacy/terms posture the maintainer cannot truthfully disclose for the intended release.
