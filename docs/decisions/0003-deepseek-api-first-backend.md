# ADR 0003: Use the DeepSeek API as the first backend and expose the harness through `pho`

- Status: Accepted
- Decision date: 2026-07-14
- Scope: Pho Code V1 authentication, model backend, pre-GPUI interaction surface, qualification gate, and roadmap
- Decision owners: Pho Code maintainers
- Supersedes: [ADR 0002](0002-native-agent-harness.md)
- Superseded by: [ADR 0004](0004-native-workbench-phase-6.md) for the Phase 6 GPUI product surface only; all backend, command, runtime, safety, and V1/V2 boundaries remain current

## Document role

This ADR owns the decision to retain Pho Code's independently owned native harness, freeze the unsupported ChatGPT subscription integration, use DeepSeek's documented API-key service as the only real V1 backend, and make the harness usable through the `pho` command before GPUI is complete.

[ADR 0002](0002-native-agent-harness.md) remains the historical record for choosing a native harness over `codex app-server` and for the failed ChatGPT OAuth premise. Current implementable behavior lives in [the system architecture](../architecture/native-harness-system.md), [DeepSeek backend](../architecture/deepseek-api-backend.md), [tools](../architecture/tools.md), and [sessions](../architecture/sessions.md). Delivery order and evidence live in [the implementation roadmap](../implementation/README.md).

## Decision summary

Pho Code V1 remains a small independently owned Rust agent harness with a native GPUI interface as its final product surface. Pho Code continues to own model-visible context, the model/tool continuation loop, first-party tools, approvals, append-only sessions, crash recovery, cancellation, and presentation of the observable execution trace.

The first and only supported real V1 backend is DeepSeek's public API using the documented OpenAI-format Chat Completions endpoint and a user-owned API key. `DeepSeekBackend` is concrete and provider-specific; Pho Code will not turn OpenAI-compatible JSON into a generalized provider promise before a second materially different backend exists.

The ChatGPT Codex OAuth and direct Responses implementation is frozen. Its deterministic source and tests may be preserved as developer-only historical work outside the current runtime module graph, but it is not an active product path, qualification dependency, fallback, or supported backend. Pho Code will not borrow Pi or Codex client identity, credentials, product metadata, or private compatibility constants.

Before GPUI is ready, the same harness is exposed through one command executable named `pho`. Command mode is a thin adapter over the same application intents, reducer, runtime coordinator, backend, tools, approvals, and session store later used by GPUI. It is not a second agent loop or a disposable probe that is replaced at the UI phase.

## Context

ADR 0002 deliberately required Phase 1 to stop if ChatGPT subscription access depended on an unavailable or unauthorized OAuth client identity. The deterministic implementation completed, but official OpenAI documentation did not establish a public third-party ChatGPT OAuth client registration for Pho Code. Continuing would require product impersonation, another application's credentials, or an undistributable identity, all of which the accepted stop conditions prohibited.

The project's actual durable value is the owned harness rather than subscription-specific authentication. Moving to a documented API-key service preserves that value while replacing the unstable bottom boundary. DeepSeek is selected because it currently offers a documented direct API, streamed chat completions, thinking content, tool calls, large-context models, usage accounting, and comparatively low published prices. Current model names, limits, availability, and prices are dated compatibility evidence rather than permanent architecture.

Waiting for GPUI before making the harness usable would delay live testing of the most important runtime behavior and encourage one-off probes that bypass the eventual application state model. A stable command mode makes every pre-GPUI phase operable by maintainers and early users and gives the final GUI a previously exercised runtime rather than a new integration path.

## Decision drivers

1. Use a provider authentication contract intended for third-party API clients without impersonation or an undistributable OAuth identity.
2. Preserve the native harness, tool safety, session, and presentation/runtime boundaries already justified by ADR 0002.
3. Reach live text and tool-continuation testing before GPUI without creating a second runtime.
4. Keep credentials out of source, environment inheritance, command-line arguments, sessions, diagnostics, and child processes.
5. Make model, thinking, context, usage, and price changes explicit through dated profiles and qualification records.
6. Preserve the exact assistant/tool/reasoning grouping required for DeepSeek continuation.
7. Keep V1 small: one real backend, one root turn, sequential tool execution, macOS, and no provider registry.
8. Retain the existing approval, bounded-output, deletion, crash-recovery, and no-silent-truncation requirements.
9. Surface provider data transfer and cost consequences clearly before a workspace is used with a live model.

## Decision

### Product and platform boundary

V1 supports one macOS application installation, one user-supplied DeepSeek API key, one concrete DeepSeek backend, one selected workspace per active session, one root turn at a time, sequential tool execution, append-only local sessions, a stable command interface, and a native GPUI interface over the same runtime.

`pho` is the executable and user-facing command name. `pho-code` may remain the Rust package and internal application name. The supported command surface grows by phase but its meanings remain stable:

```text
pho login
pho status
pho logout
pho chat
pho chat --stdin
pho session list
pho session resume <session-id>
```

Only commands whose owning phase has passed are available. An unavailable later-phase command fails with a clear capability message; it never falls back to an alternate implementation.

The Phase 4 instruction/context hardening follow-up adds `pho context` as an offline read-only inspection command. It discloses Pho Code-owned static model context and limits without acquiring operational authority, accessing credentials or workspace content, or starting a model turn.

### Command-mode boundary

The CLI parses bounded input, dispatches typed application intents, subscribes to canonical events, renders them for a terminal, and maps terminal domain state to process exit status. It does not construct provider requests, read Keychain directly, execute tools, write journals, infer completion from text deltas, or own retry policy.

`pho login` means securely installing and validating a user-owned DeepSeek API key, not performing OAuth. It reads the key through a no-echo secret input, validates its shape locally, stores it in the Pho Code Keychain namespace, and validates access through the documented models endpoint. The key is never accepted in an argument, environment variable, project file, redirected ordinary stdin, or shell command. Failed remote validation does not silently retain a newly supplied unusable key; replacement and rollback behavior is defined by the backend credential contract.

`pho chat` reads one bounded prompt from a controlling terminal and sends it through the current application runtime. Prompt text is not accepted as a positional argument because shell history and process inspection can disclose argv. `pho chat --stdin` is the explicit automation path; it treats bounded stdin as prompt content and disables interactive approvals unless a separate controlling terminal is available. In the qualification slice chat can run a no-tool ephemeral turn. Once sessions exist, it uses the normal session writer and offers explicit new/resume selection. Command mode renders provider-returned reasoning, text, tool requests, approvals, output, usage, estimated cost, truncation, cancellation, and terminal state from the same canonical events as GPUI.

Interactive approvals read from the controlling terminal, not piped prompt input. When no controlling terminal is available, a required approval is denied safely or the command fails before the effect according to the tool contract. No command-line flag may auto-approve patch or shell in V1.

### Credential boundary

The user creates and funds the API key through DeepSeek's platform. Pho Code stores only the API key and a small versioned nonsecret profile identifier in macOS Keychain under its own service namespace. It does not store account passwords, scrape browser state, import environment variables, or share one application-owned key among users.

One credential actor owns Keychain reads, replacement, validation leases, and logout. API keys do not expire or refresh through a Pho Code protocol; a 401 makes the key invalid for new leases until the user replaces it. A transient network failure does not delete a previously valid key. Insufficient balance, rate limiting, model unavailability, and request rejection do not invalidate the credential.

The existing process-wide single-instance guard remains because command and future GPUI processes share Keychain and session state. A second process stops before credential or writable-session access rather than racing the active owner.

### DeepSeek backend boundary

V1 uses direct HTTPS requests to the fixed production origin `https://api.deepseek.com`, with `GET /models` for credential/model availability validation and `POST /chat/completions` for inference. Redirects to another origin are rejected. The API key is sent only as a bearer authorization header to the allowlisted origin.

The backend uses the OpenAI-format Chat Completions contract directly through the existing Rust HTTP stack. It does not depend on an OpenAI SDK, advertise arbitrary OpenAI-compatible endpoints, use the Anthropic-format endpoint, or expose beta endpoint selection.

The initial qualified profile targets `deepseek-v4-flash`, thinking enabled, and reasoning effort `high`. Model plus thinking settings are pinned to a session profile. `deepseek-v4-pro` may be promoted only after separate live qualification. Legacy aliases scheduled for removal are not used as V1 identities.

The request sends the smallest qualified field set: model, ordered messages, thinking control, reasoning effort, stream, streamed usage, bounded maximum output tokens, fixed tool schemas when enabled, and automatic tool choice. Sampling controls ignored in thinking mode, beta strict tool mode, JSON mode, FIM, prefix completion, arbitrary user identifiers, log probabilities, and provider-hosted tools are outside V1.

### Assistant phase and reasoning boundary

DeepSeek Chat Completions returns one assistant message that may contain final text, provider-returned `reasoning_content`, and one or more tool calls. Pho Code preserves that grouping as one canonical assistant phase. Tool-call IDs remain provider identities separate from local item IDs.

Provider-returned reasoning is observable content, not opaque encrypted state and not a Pho Code reconstruction of private reasoning. It is labeled as provider-returned reasoning, bounded, treated as sensitive session content, and rendered collapsed by default. When an assistant phase contains a tool call, the complete required reasoning content is persisted and replayed with that phase because the provider requires it for later continuation. A missing required reasoning/tool pairing fails safely rather than being dropped or regenerated.

The stream mapper accepts exactly one choice, assembles content and reasoning deltas separately, assembles tool calls by choice and tool index while validating stable call identity, and treats only a recognized terminal finish reason plus the stream terminator as authoritative completion. Partial arguments never execute. Multiple completed calls may be returned, but the Pho Code loop validates, approves, and executes them sequentially in provider order.

### Usage and cost boundary

Canonical usage retains prompt tokens, prompt-cache hits and misses, output tokens, reasoning tokens when supplied, and total tokens. A dated model profile may contain published prices used to calculate an explicitly labeled estimate. The provider's account ledger remains authoritative.

Pho Code does not claim a hard monetary spending cap because prices can change and the service reports authoritative usage only after generation. It limits maximum output tokens, model continuations, tool calls, wall-clock duration, context size, and queued/output bytes before work begins. The CLI and GPUI show the configured limits and accumulated provider usage.

### Privacy and external-service boundary

Live model use sends the system instructions, retained conversation, provider-required reasoning, tool schemas, and bounded model-visible tool results to DeepSeek. Source text is sent only when it enters a prompt or tool result; selecting a workspace alone does not upload it. Pho Code displays this boundary before first live workspace use and documents that the user must have authority to send the selected content.

API calls may create provider-side context-cache entries under the service's current behavior. Pho Code cannot promise provider deletion, training exclusion, residency, or retention beyond the current provider terms and controls. Public distribution requires a fresh terms, privacy, jurisdiction, and disclosure review; the personal V1 gate records the reviewed documents and date without presenting legal conclusions as technical verification.

### Frozen ChatGPT work

The ChatGPT Phase 1 result is `STOP`, not `PASS` and not a verification gap that silently blocks the new path. Its deterministic OAuth, Keychain, Responses, and SSE source may be preserved outside the current runtime module graph while the DeepSeek pivot reuses safe generic mechanisms. Frozen source need not remain on the default compile path; if a Cargo feature exposes it, the repository's all-feature checks still apply. It receives no product UI, live qualification, compatibility maintenance, or release claim in V1.

Removal or revival of the frozen code is a separate explicit decision. Revival requires an authoritative supported client identity and a new qualification; it cannot occur as an undocumented fallback when DeepSeek fails.

### V1 and V2 boundary

V1 still excludes compaction, subagents, parallel model turns, parallel tool execution, a second supported real backend, custom base URLs, provider plugins, remote MCP tools, strong sandboxing, signing, notarization, automatic updates, and non-macOS portability.

The existence of frozen ChatGPT code does not count as a second operational backend and does not justify generalizing the backend seam. V2 must implement and qualify a materially different second backend before extracting shared provider abstractions.

## Consequences

### Benefits

- Pho Code uses a documented third-party API credential rather than an unsupported subscription OAuth identity.
- The owned loop, tools, approvals, sessions, and GPUI direction remain intact.
- The harness becomes testable and usable through `pho` before native UI work is complete.
- API-key state is materially simpler than OAuth refresh, account routing, and client-identity compatibility.
- DeepSeek exposes streamed usage and tool-capable reasoning needed for the intended execution trace.
- One application-intent/event boundary receives continuous testing from command mode through GPUI.

### Costs and constraints

- The user pays separate API usage rather than using a ChatGPT subscription.
- Model names, behavior, prices, and availability remain external moving dependencies requiring dated qualification.
- Provider-returned reasoning and tool continuation introduce sensitive persisted content and exact replay requirements.
- Source and conversation content sent to the model leaves the machine and enters DeepSeek's service boundary.
- The existing ChatGPT-specific domain shapes and credential bundle require refactoring even where lower-level transport code is reusable.
- Maintaining a coherent terminal renderer adds work before GPUI, though it replaces disposable probe code rather than duplicating the runtime.

## Rejected and deferred alternatives

### Continue searching for an OpenAI OAuth identity

Rejected for V1. The accepted Phase 1 stop condition occurred, and no repository evidence establishes a supported public client identity for Pho Code. Further speculative work would delay the harness without changing the authorization boundary.

### Reuse Pi or Codex identity

Rejected. It would misrepresent the product, couple Pho Code to another application's credentials and metadata, and violate both prior architecture and the explicit stop condition.

### Make every OpenAI-compatible endpoint configurable

Deferred. Similar JSON shape does not prove identical streaming, reasoning, tool, error, usage, or retention semantics. A concrete DeepSeek adapter keeps claims honest and bounded.

### Embed a Pho Code API key

Rejected. It would expose a shared billable secret in a client application and make users' effects attributable to the maintainer's account. V1 accepts only a user-owned key through secret-safe input.

### Wait for GPUI before live use

Rejected. It would postpone backend, loop, approval, tool, and session feedback and encourage one-off probes outside the application state model.

### Build a separate CLI harness

Rejected. Two loops or persistence paths would produce divergent behavior and make the GPUI integration a second implementation. `pho` is an adapter over the one runtime.

### Treat estimated cost as a hard cap

Rejected. Price profiles can become stale and authoritative usage arrives after generation. Pho Code enforces deterministic token and operation limits and labels cost as an estimate.

## Failure and recovery requirements

The implementation plan must cover at least:

1. Secret input without echo, no controlling terminal, cancellation, replacement rollback, Keychain denial, and logout deletion failure.
2. Models-endpoint validation under invalid key, transient network failure, malformed response, missing configured model, and cross-origin redirect.
3. HTTP 400, 401, 402, 422, 429, 500, 503, unknown status, bounded error parsing, and redaction.
4. SSE comments and keep-alives, byte fragmentation, invalid UTF-8/JSON, oversized frames/items, idle and total timeout, abrupt EOF, missing terminator, duplicate terminal, and choice mismatch.
5. Interleaved text, reasoning, and multiple tool-call deltas with stable index/call identity.
6. Missing or changed tool-call IDs, partial JSON, provider finish reasons, required reasoning replay, and sequential multiple-call handling.
7. Delivery failure before send, after send/before headers, after first event, and during cancellation without automatic ambiguous retry.
8. Usage chunk absent, partial, late, duplicated, inconsistent, or beyond local numeric bounds.
9. Stale price profile and unavailable model without silent substitution.
10. CLI broken pipe, terminal loss, signal cancellation, approval without a TTY, invalid UTF-8 arguments, oversized prompt, and renderer backpressure.
11. Restart with a stored key, interrupted turn, pending approval, running tool, or incomplete journal without automatic replay.
12. Provider privacy/terms change that invalidates the recorded release assumptions.

## Validation plan

### Deterministic evidence

- Secret wrapper, Keychain, credential state, request DTO, error mapping, SSE chunk, reasoning, tool-call, usage, and redaction fixtures.
- Scripted-backend tests for the complete canonical loop and exact assistant-phase/tool-result pairing.
- Command tests that dispatch intents and compare canonical traces rather than mocking a separate CLI loop.
- Terminal tests for streaming, cancellation, approvals, denial, non-TTY failure, broken pipe, exit status, and absence of seeded secrets.

### Live evidence

- `pho login` stores a user-supplied key and validates `GET /models` without revealing it.
- `pho status` reports local credential/profile state without calling inference unless explicitly requested.
- `pho chat` completes streamed text, provider-returned reasoning, tool call/result continuation, cancellation, classified failure, and usage accounting on the qualified model.
- Restart reuses Keychain state, and `pho logout` makes the key unavailable to later requests.
- Dated evidence records current API documents, terms/privacy documents, model, thinking profile, usage fields, and prices without prompts, outputs, reasoning, tool arguments, or secrets.

## Open follow-up decisions

This ADR does not freeze exact byte, token, timeout, artifact, or queue limits; terminal color and formatting; the eventual GPUI visual language; whether a later qualified non-thinking profile is exposed; distribution policy; application-level session encryption; or a second provider. The relevant architecture and implementation phase must resolve those choices before their acceptance gate.
