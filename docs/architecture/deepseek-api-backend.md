# DeepSeek API backend architecture

- Status: Normative V1 backend contract; live compatibility not yet established
- Last updated: 2026-07-14
- Governing decision: [ADR 0003](../decisions/0003-deepseek-api-first-backend.md)
- System context: [Native harness system architecture](native-harness-system.md)
- Implementation phase: [Phase 1B](../implementation/v1/phase-1b-deepseek-api-qualification.md)
- External contract reviewed: DeepSeek API documentation and Open Platform terms on 2026-07-14
- Platform: macOS only

## Purpose

This document specifies Pho Code's only supported real V1 model backend: a user-owned DeepSeek API key, the fixed DeepSeek production API origin, streamed OpenAI-format Chat Completions, provider-returned reasoning, function tool calls, usage accounting, and dated model profiles. The linked Phase 1B plan owns implementation order and qualification evidence.

The backend is deliberately concrete. DeepSeek's wire format resembles OpenAI Chat Completions, but Pho Code promises only the DeepSeek behavior implemented and qualified here. V1 does not expose a configurable base URL, an OpenAI-compatible provider setting, the Anthropic-format endpoint, or a provider registry.

The backend supplies normalized model events and accepts complete model-visible input. It does not own the agent loop, tool schemas, approvals, local effects, sessions, terminal rendering, or GPUI state.

## Authoritative external surface and uncertainty

The official [DeepSeek quick start](https://api-docs.deepseek.com/) documents bearer API-key authentication, the `https://api.deepseek.com` OpenAI-format base URL, and streamed chat completions. The [Chat Completions reference](https://api-docs.deepseek.com/api/create-chat-completion/) documents messages, thinking controls, tool calls, SSE chunks, finish reasons, and usage fields. The [Thinking Mode guide](https://api-docs.deepseek.com/guides/thinking_mode/) documents the special replay requirement for reasoning content associated with tool calls.

The [model and pricing page](https://api-docs.deepseek.com/quick_start/pricing/) is volatile operational evidence. On 2026-07-14 it listed `deepseek-v4-flash` and `deepseek-v4-pro`, both with thinking and tool support, and announced removal of the `deepseek-chat` and `deepseek-reasoner` aliases on 2026-07-24. Pho Code therefore qualifies explicit current model IDs and never treats a documented price, context length, maximum output, or model alias as permanent.

DeepSeek's [Open Platform terms](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html) require developers to protect API keys and disclose applicable downstream personal-data processing. Architecture records the technical boundary and release checks; it does not claim a legal interpretation or permanent provider policy.

Only a dated qualification record establishes that one Pho Code revision, account, model, and profile worked. Documentation availability alone does not prove account funding, regional availability, exact model behavior, or future compatibility.

## Component boundary

```mermaid
flowchart LR
    Presentation["`pho` or GPUI adapter"] --> Actions["Typed application intents"]
    Actions --> Auth["Credential actor"]
    Loop["Pho Code agent loop"] --> Backend["DeepSeekBackend"]
    Auth --> Keychain["macOS Keychain"]
    Auth --> Backend
    Backend --> Service["DeepSeek API"]
    Backend --> Events["Normalized model events"]
    Events --> Loop
```

The application shell acquires the process-wide single-instance guard before constructing the credential actor or writable session store. The actor owns API-key install, Keychain access, validation state, leases, replacement, and logout. `DeepSeekBackend` owns request DTOs, headers, HTTPS/SSE transport, wire assembly, provider finish semantics, model-profile checks, usage mapping, and redacted error classification.

The command and GPUI adapters dispatch intents and render events. They never receive a raw API key, build an authorization header, parse SSE, validate tool arguments, or infer a turn's terminal state from displayed text.

## Credential profile

### User-owned API key

Pho Code uses only an API key created and funded by the user through DeepSeek's platform. It never embeds a maintainer key, shares one key across installations, reads a key from the source workspace, imports an environment variable, accepts a key as a command argument, or forwards it to a child process.

`pho login` is the user-facing credential-install command. The term is interaction language; no OAuth or account-password flow exists. The command requests a key from a controlling terminal using no-echo input. If no controlling terminal exists, it fails before reading ordinary stdin so a key cannot be captured accidentally through a pipe, transcript, or shell history.

The input is bounded before retention, wrapped in a secret type whose `Debug`, `Display`, serialization errors, and traces redact the value, and cleared promptly after Keychain commit or failure. Leading or trailing whitespace is rejected rather than silently changing the supplied credential.

### Keychain record

The logical Keychain record contains:

```text
schema_version
api_key
credential_profile_revision
last_successfully_validated_at
last_successfully_validated_model_set_digest
credential_state (ready or invalid; an invalid record never leases)
```

Only the API key is secret, but the complete record remains private to the credential actor. Model names and detailed availability live in the dated backend profile, not as credential authority. Sessions refer to a nonsecret backend/model profile revision and never contain the key or Keychain record.

The production service and account names are Pho Code-specific and distinct from the frozen ChatGPT credential slot. A malformed or unknown record version is quarantined from leasing and reported as replacement-required. There is no plaintext fallback.

### Install, replacement, validation, and logout

Credential installation is transactional from Pho Code's perspective:

1. Read and validate the candidate's bounded local shape in memory.
2. Call the allowlisted `GET https://api.deepseek.com/models` endpoint with the candidate through a nonpersistent validation lease.
3. Require a successful bounded model-list response containing the configured qualification candidate.
4. Replace the Keychain record only after remote validation succeeds.
5. Clear the previous in-memory lease and candidate material.

A failed candidate does not overwrite a previously usable record. If Keychain replacement fails after successful remote validation, the prior committed record remains authoritative and the candidate is cleared. The active presentation adapter reports that the new key was not installed.

`pho status` reads only nonsecret local state by default: installed/missing/malformed, profile revision, and last successful validation time. An explicit future remote-check option may revalidate model availability, but ordinary status does not create inference traffic or imply that a past result is current.

`pho logout` first prevents new leases, waits for or cancels owned requests according to application shutdown rules, deletes the Keychain record, and clears in-memory copies. Deletion failure remains visible and the record stays quarantined; Pho Code must not report signed out while continuing to lease it.

### Credential states

```text
Missing
Installing
Validating
Ready
TemporarilyUnavailable
Invalid
Malformed
RemovalFailed
```

HTTP 401 during validation or inference moves the credential to `Invalid` and prevents new requests until replacement. Network unavailability, timeout, HTTP 429, server failure, or overload enters `TemporarilyUnavailable` without deleting a previously validated key. HTTP 402 is `InsufficientBalance` and retains the key. Model absence is a backend-profile failure, not credential invalidation.

The API contract exposes no refresh token or Pho Code-managed expiry. There is no refresh actor, expiry skew, account-ID extraction, OAuth callback, or automatic authorization replay.

## Fixed API surface

### Origin and endpoints

V1 allowlists exactly:

```text
https://api.deepseek.com/models
https://api.deepseek.com/chat/completions
```

The HTTP client rejects redirects and never forwards authorization to another origin. The production origin is not user-editable. Tests use an injected loopback transport boundary or fake HTTP service without weakening production URL validation.

The beta origin/path, Anthropic-format API, FIM completions, prefix completions, and future provider endpoints are unsupported. A provider documentation change is reviewed and qualified before production constants change.

### Headers

Requests contain only:

- `Authorization: Bearer <api-key>` from the current credential lease;
- `Accept: application/json` for models or `Accept: text/event-stream` for chat;
- `Content-Type: application/json` for chat;
- an honest bounded Pho Code user agent;
- a nonsecret local request correlation header only if live qualification shows the service accepts it and it materially aids support.

Pho Code does not send arbitrary headers, cookies, account identifiers, personal user IDs, workspace paths, session titles, or machine names. Final header maps are never formatted into logs or diagnostics.

## Model profile

### Initial profile

The first candidate profile is:

```text
provider: deepseek
wire_format: openai-chat-completions
model: deepseek-v4-flash
thinking: enabled
reasoning_effort: high
stream: true
stream_usage: true
tool_choice: auto when tools exist
maximum_output_tokens: bounded Pho Code value established by qualification
```

Thinking and reasoning effort are explicit even when provider defaults currently match, preventing silent behavior changes when defaults move. The profile does not set temperature, top-p, presence penalty, or frequency penalty because the current thinking-mode documentation says those controls are unsupported or ineffective.

`deepseek-v4-pro` is a separate optional profile only after the complete qualification matrix passes. Legacy aliases and unqualified model IDs are rejected before network send. Pho Code never silently substitutes another model or mode after availability, balance, or context failure.

### Profile lifecycle

A qualified profile records model ID, thinking mode, effort, request schema revision, exercised tool behavior, observed context/output limits, usage fields, pricing observation date, first and last live validation dates, and provider documentation review date.

Sessions pin the profile revision. A price-only update can change future estimates without changing wire replay, but its effective date must be preserved with each estimate. A model, thinking, tool, or replay change requires a new compatibility profile and live qualification before new sessions use it. Existing sessions do not migrate or switch silently.

`GET /models` proves only that the account currently sees an ID. It does not prove thinking, streaming, tools, replay, limits, or price.

## Chat request

### Minimum body

The V1 request contains the smallest qualified subset:

```json
{
  "model": "deepseek-v4-flash",
  "messages": [],
  "thinking": { "type": "enabled" },
  "reasoning_effort": "high",
  "stream": true,
  "stream_options": { "include_usage": true },
  "max_tokens": 0,
  "tools": [],
  "tool_choice": "auto"
}
```

The example shows structure only. `max_tokens` is always a positive qualified local limit. `tools` and `tool_choice` are omitted when no tools are enabled. V1 requests one implicit choice and rejects multi-choice response behavior. `user_id`, beta strict mode, response JSON mode, prefixes, stop sequences, log probabilities, and sampling controls are omitted.

Before serialization, Pho Code enforces counts and byte limits for messages, content, reasoning, tool calls, IDs, names, schemas, and aggregate request size. It serializes provider DTOs only inside `backend::deepseek` and redacts before error formatting.

### Message projection

The context builder supplies provider-neutral canonical phases. The DeepSeek adapter projects them into ordered messages:

```text
System instructions -> system message
User message -> user message
Completed assistant phase -> assistant message
Completed tool result -> tool message with exact tool_call_id
```

A completed assistant phase may contain content, `reasoning_content`, and one or more completed tool calls. Those fields remain grouped in one assistant message. Flattening a tool call into a synthetic user message, inventing a call ID, or moving reasoning to a different assistant message is forbidden.

The full retained V1 history is sent on every request. Pho Code does not rely on a provider thread, previous-response identifier, or server-stored conversation. Provider context caching may apply automatically, but it is an optimization outside correctness and never changes the local journal or replay rules.

### Reasoning replay

Current DeepSeek documentation distinguishes two cases:

- Reasoning from an assistant phase without a tool call may be returned in later history but is not required for the next user turn under the documented behavior.
- Reasoning from an assistant phase with a tool call is required in subsequent continuation context.

Pho Code persists all completed provider-returned reasoning as visible canonical content and marks whether it is required for provider replay. The backend always replays required reasoning exactly and may replay other completed reasoning only according to the qualified profile. It never summarizes, edits, concatenates across assistant phases, or manufactures missing reasoning for wire continuation.

If required reasoning is missing, oversized, corrupted, or paired with different tool calls, the context is `CannotReplay` and no request is sent. This is distinct from local context exhaustion.

## Streaming response

### SSE framing

The shared byte framer incrementally decodes UTF-8, accepts LF and CRLF, joins multiple `data:` lines, ignores bounded comments including `: keep-alive`, ignores unknown non-data fields, and enforces line, frame, event-count, aggregate-byte, idle-time, and total-time limits before unbounded allocation.

Each data frame before `[DONE]` must contain one bounded JSON chat-completion chunk. `[DONE]` is required to terminate a successful stream. EOF without `[DONE]`, malformed UTF-8/JSON, an oversized frame, multiple terminal markers, data after terminal, or a stream whose semantic finish never arrived fails the request.

DeepSeek may keep a request connected with SSE comments while it waits for inference. A comment proves transport liveness but not model progress. The backend maintains separate byte-liveness and semantic-progress deadlines so keep-alives cannot retain item assembly indefinitely.

### Choice and identity invariants

V1 accepts only choice index `0`. A nonempty choice array containing another index, a second simultaneous choice, a changing completion ID/model/profile, or inconsistent tool-call identity is a protocol error. An empty choice array is allowed only for the qualified usage-only chunk.

Every ordinary chunk must match the stable completion ID and qualified model. The backend may retain the bounded system fingerprint as safe compatibility metadata but does not treat it as a stable model version or expose it as an identifier to tools.

### Assembly model

One response assembly owns:

```text
completion_id
model
system_fingerprint
reasoning buffer
assistant-content buffer
ordered tool-call slots keyed by tool index
finish_reason
usage
```

Reasoning deltas append only to the reasoning buffer. Content deltas append only to assistant content. A tool-call slot acquires one stable index, call ID, function type, name, and argument byte stream. Later deltas may omit repeated fields but may not contradict a known value. Counts and per-field bytes are bounded.

Tool-call argument deltas are display-only. No call reaches validation or dispatch until the stream has a recognized `tool_calls` finish reason, all slots contain complete identities, `[DONE]` arrives, and the final argument strings pass strict local JSON and schema validation in the loop/tool boundary.

### Finish reasons

The qualified finish reasons map as follows:

| Provider reason | Domain result |
| --- | --- |
| `stop` | Successful terminal assistant phase when no incomplete tool slot exists |
| `tool_calls` | Completed assistant tool phase eligible for local validation |
| `length` | Incomplete terminal failure; no unfinished tool executes |
| `content_filter` | Filtered terminal failure with bounded retained partial display |
| `insufficient_system_resource` | Provider-interrupted failure eligible only for explicit user retry |
| Unknown | Incompatible protocol failure |

`[DONE]` without one recognized finish reason is incomplete. A finish reason without `[DONE]` is also incomplete. Displayed deltas remain nonauthoritative until both conditions hold.

### Normalized events

The backend emits provider-neutral ordered events:

| Event | Required information | Durability |
| --- | --- | --- |
| `ResponseStarted` | local request ID, optional completion ID, model profile | Transient until completion |
| `ReasoningDelta` | assistant-phase identity and bounded text delta | Transient |
| `TextDelta` | assistant-phase identity and bounded text delta | Transient |
| `ToolCallArgumentsDelta` | assistant-phase identity, tool index, known call identity, argument bytes | Transient and non-executable |
| `AssistantPhaseCompleted` | content, provider reasoning, replay requirement, ordered completed calls, provider metadata | Durable |
| `UsageUpdated` | prompt/cache/output/reasoning/total fields | Durable with terminal response |
| `ResponseCompleted` | finish class, completion ID, model/profile, terminal transport evidence | Durable terminal |
| `ResponseIncomplete` | provider/local reason and bounded partial-state metadata | Durable terminal failure |
| `ResponseFailed` | classified redacted error | Durable terminal failure |
| `ResponseCancelled` | cancellation stage and local transport acknowledgement | Durable local terminal |

The shared domain may retain finer text/tool item events for projection, but DeepSeek wire chunks must be normalized through the completed assistant-phase boundary before persistence or continuation. Provider DTOs and raw chunks never enter canonical state.

## Tool-call safety and continuation

DeepSeek documents that generated arguments may be invalid or contain hallucinated parameters. Pho Code treats all tool names, IDs, and arguments as untrusted provider input.

A returned call can enter the tool runtime only when:

1. The response completed with `tool_calls` and `[DONE]`.
2. The call has a unique bounded nonempty provider call ID and allowlisted function name.
3. The argument text is complete UTF-8 JSON containing exactly one top-level object and no trailing data.
4. Strict local schema validation passes; unknown properties and excessive nesting/size fail conservatively.
5. The call ID has not previously completed or executed in the session.
6. The loop accepts it within continuation and tool-call limits.
7. Any required approval binds to the exact validated local effect.

Multiple calls in one assistant phase remain ordered by provider tool index. Pho Code executes them sequentially. After every call has one terminal tool result, the next request contains the original complete assistant message followed by tool messages in the same order with exact call IDs. A denied or validation-error result preserves protocol pairing when safe; it does not pretend the executor ran.

A cancelled, filtered, length-stopped, resource-interrupted, malformed, or abruptly ended response never produces an executable call from partial assembly.

## Cancellation, delivery ambiguity, and retry

User cancellation aborts the HTTP request and stops body reads. The backend emits one cancellation event only after local transport termination is acknowledged. It distinguishes cancellation before send, after send/before headers, before first semantic event, and after streaming began.

POST delivery after request bytes leave the process is potentially ambiguous. Pho Code does not automatically retry model requests, including 429, 500, 503, resource interruption, connection loss, or EOF. A classified failure may display provider guidance and allow a new explicit user action, but that action begins from visible canonical state.

There is no OAuth refresh-and-replay exception. A 401 invalidates the current credential for new work and requires `pho login` replacement. The failed request is not replayed automatically after replacement.

If transport fails after any content, reasoning, or tool delta, the turn retains bounded partial display and ends `InterruptedAmbiguous`. No provider phase is promoted to durable completion and no tool executes.

## Usage and estimated cost

When `stream_options.include_usage` is enabled, the backend accepts one usage-bearing chunk under the qualified shape. It maps prompt tokens, cache-hit tokens, cache-miss tokens, completion tokens, reasoning tokens when supplied, and total tokens into checked nonnegative integers. Arithmetic overflow, impossible relationships, conflicting duplicate usage, or usage after `[DONE]` is a protocol error or bounded diagnostic according to whether terminal accounting remains unambiguous.

Missing usage does not rewrite a successful text/tool result into failure if the qualification profile explicitly allows absence, but every presentation marks cost unknown. Phase 1B must decide whether usage is required for the initial profile.

A dated price profile can estimate:

```text
cache_hit_tokens * observed_cache_hit_rate
+ cache_miss_tokens * observed_cache_miss_rate
+ completion_tokens * observed_output_rate
```

Reasoning tokens are not double-counted when already included in completion tokens. Every amount is labeled `estimated`, names the currency and price observation date, and uses checked decimal arithmetic. Pho Code does not infer remaining account balance or claim a spending cap. The provider account ledger is authoritative.

## Error taxonomy

The backend maps failures into stable domain categories:

- `CredentialsMissing`, `CredentialsMalformed`, `CredentialInvalid`, `CredentialStoreFailed`, and `CredentialRemovalFailed`;
- `NetworkUnavailable`, `HeaderTimeout`, `DeliveryUnknown`, `RateLimited`, `ServiceUnavailable`, and `StreamTimedOut`;
- `InsufficientBalance`, `ModelUnavailable`, `RequestInvalid`, `RequestRejected`, and `ContentFiltered`;
- `SseMalformed`, `SseOversized`, `StreamEndedEarly`, `StreamLimitExceeded`, `ChoiceIncompatible`, `FinishReasonMissing`, `EventIncompatible`, and `ReplayStateMissing`;
- `Cancelled`, `InterruptedAmbiguous`, and `InternalInvariantViolation`.

The current documented HTTP mapping begins with 400 invalid format, 401 authentication failure, 402 insufficient balance, 422 invalid parameters, 429 rate limit, 500 server error, and 503 overload. Unknown statuses use bounded safe classification and never format the raw body by default.

Error parsing bounds body bytes before JSON/text decoding. Diagnostics may retain status, safe provider code, request stage, local correlation ID, model/profile, byte/event counts, finish reason, timing, cancellation stage, usage-field presence, and retry guidance. They never retain raw headers, API key, prompt, message content, reasoning, tool arguments, tool output, workspace path, raw response body, or model-visible schemas by default.

## CLI rendering contract

The backend has no terminal dependency. Command mode consumes canonical application events and renders:

- credential and model-profile status;
- reasoning in a visibly labeled, collapsible or separately styled stream;
- assistant text on stdout;
- tool/approval lifecycle and diagnostics on stderr or a structured terminal channel;
- usage and estimated cost after the authoritative terminal event;
- interruption, truncation, and uncertainty without erasing partial display.

Broken stdout/stderr pipes notify the coordinator and trigger bounded cancellation; they do not panic or leave a model/tool running without an owner. Process exit success requires a canonical completed turn, not merely emitted text. Stable exit-code meanings belong to command-mode implementation evidence and must not expose provider status codes directly as a public compatibility promise.

## Security and privacy requirements

- Accept the API key only through a controlling terminal or future GPUI secure field; never through argv, environment, project configuration, ordinary stdin, clipboard logging, or URL query.
- Store the key only in macOS Keychain and secret-wrapped memory; clear transient copies and authorization buffers promptly.
- Send authorization only to the fixed allowlisted HTTPS origin and reject redirects.
- Prevent inherited child environments and diagnostics from receiving provider credentials.
- Bound model-list bodies, error bodies, request serialization, SSE lines/frames/events, content, reasoning, tool slots, arguments, usage values, and retained diagnostics.
- Treat provider reasoning as sensitive user/session content and label it accurately; never call it a summary when the provider reports full reasoning content.
- Preserve exact required reasoning/tool context without displaying or logging provider DTOs.
- Never execute a tool from a delta, partial stream, unknown finish reason, or failed schema validation.
- Inform the user before first live workspace use that selected model-visible content is sent to DeepSeek and may be subject to provider processing/cache behavior.
- Record the terms/privacy review date for release qualification and block a release claim when material policy questions remain unresolved.

## Qualification handoff

[Phase 1B](../implementation/v1/phase-1b-deepseek-api-qualification.md) owns fixtures, command implementation, live model validation, pricing observation, and its hard gate. Dated results live under [qualification records](../qualification/README.md). [ADR 0003](../decisions/0003-deepseek-api-first-backend.md) owns the decision-level reversal conditions.

Phase 1B must stop and reassess if the service requires embedding a shared key, forwarding credentials outside the allowlisted origin, omitting required user disclosure, accepting unbounded reasoning/tool data, using beta-only tool semantics for the core loop, silently switching models, or relying on server state that prevents deterministic full-history reconstruction.

## V2 exclusions

This document does not design additional providers, custom endpoints, OpenAI SDK integration, the Anthropic-format API, dynamic model discovery, automatic failover, beta strict tools, JSON/FIM/prefix modes, remote tools, images, parallel tool execution, compaction, subagents, or distribution-grade credential coordination. A later second-backend decision must use live evidence before generalizing this contract.
