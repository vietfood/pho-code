# ADR 0002: Own the agent harness and use ChatGPT Codex as the first backend

- Status: Superseded by [ADR 0003](0003-deepseek-api-first-backend.md)
- Decision date: 2026-07-14
- Scope: Pho Code V1 runtime, authentication, model transport, tools, sessions, and release boundary
- Decision owners: Pho Code maintainers
- Source baselines: Pi `0e6909f050eeb15e8f6c05185511f3788357ddb3`; Codex `393f64565ab46f09d99ca4d9bd973537e72a114b`; `fff-search` documentation observed at `0.9.6`
- Supersedes: [ADR 0001](0001-codex-app-server-sidecar.md)
- Superseded by: [ADR 0003](0003-deepseek-api-first-backend.md)

## Document role

This superseded ADR is the historical decision snapshot for choosing the native harness and attempting ChatGPT Codex as the first backend. Its Phase 1 stop condition was reached when Pho Code could not establish an authorized public OAuth client identity. [ADR 0003](0003-deepseek-api-first-backend.md) retains the native harness, freezes this backend attempt, selects DeepSeek's public API, and adds the stable `pho` command surface.

At this ADR's acceptance time, implementable behavior was split across the system, ChatGPT backend, tools, and sessions contracts. The mutable [system](../architecture/native-harness-system.md), [tools](../architecture/tools.md), [sessions](../architecture/sessions.md), and [implementation roadmap](../implementation/README.md) now follow ADR 0003; the [ChatGPT backend](../architecture/chatgpt-codex-backend.md) preserves this ADR's frozen provider contract.

## Decision summary

Pho Code V1 will be a small independently owned agent harness written in Rust with a native GPUI interface. Pho Code will perform ChatGPT subscription authentication, call the Codex Responses backend directly, construct model-visible context, run the model/tool continuation loop, execute its own tools behind explicit approvals, persist append-only sessions, recover interrupted work, and project the complete observable execution trace into the GUI.

`codex app-server` is no longer a runtime dependency. Codex and Pi remain checked-out evidence sources, not linked libraries or subprocess requirements. Codex is the first model backend because ChatGPT subscription access is the practical reason for V1; it is not the owner of Pho Code's harness.

V1 is intentionally personal, macOS-only, single-agent, single-backend, and bounded. Native compaction, subagents, a second real backend, branching session trees, strong sandboxing, public plugin compatibility, generalized provider discovery, and distribution-grade portability are deferred to V2 or later. Deferral does not weaken the V1 requirements for credential safety, explicit approvals, bounded output, deterministic state, or honest crash recovery.

Pho Code will reproduce the relevant behavior observed in Pi's ChatGPT OAuth and Codex Responses implementation without claiming that Pi's client identity, headers, endpoints, or model catalog form a stable public contract for Pho Code. Phase 1 must validate the actual integration and stop for reassessment if the required account or transport behavior cannot be established safely.

## Context

[ADR 0001](0001-codex-app-server-sidecar.md) selected app-server because the former V1 requirements included Codex-owned compaction and stateful subagents and because the product was described as a focused Codex client. Under those requirements, delegating authentication, tools, persistence, compaction, and scheduling to one external runtime was coherent.

The product goal is now clarified differently: Pho Code must be able to own its runtime and eventually operate with a non-Codex backend. Codex support is the first implementation constraint, not the permanent product boundary. Compaction and subagents are no longer V1 requirements, which removes the two strongest reasons to inherit the full Codex runtime immediately.

This change makes the native harness work unavoidable rather than accidental. A direct model stream does not provide an agent loop, tool safety, approvals, durable sessions, context reconstruction, cancellation, or child scheduling. Pho Code accepts those responsibilities deliberately and reduces scope elsewhere instead of hiding them inside views or postponing them until failures appear.

The current repository still contains only a GPUI dependency scaffold and a hello-world `main.rs`, so the decision changes documentation before implementation has committed to the obsolete process boundary.

## Decision drivers

The selected boundary must satisfy these drivers:

1. Pho Code remains usable without a `codex` executable or app-server process.
2. ChatGPT subscription authentication is the first practical access path; API-key billing is not an equivalent V1 substitute.
3. The application displays the observable trace that the provider and harness expose: streamed text, provider-exposed reasoning, tool requests, approvals, output, completion, errors, and truncation metadata.
4. Pho Code owns the model/tool loop, session format, restart behavior, and future backend seam.
5. The first release remains small enough for personal use and understandable maintenance.
6. GPUI views remain presentation and interaction code rather than an execution runtime.
7. Tools operate through explicit, testable policies with bounded resources and visible failure.
8. The design permits a later real backend without building a provider framework before one exists.
9. The documentation distinguishes verified upstream behavior, live-validated Pho Code behavior, and fragile compatibility assumptions.
10. V2 features do not distort the V1 state model or acceptance gate prematurely.

## Evidence and support posture

### Pi proves the shape of a small direct harness

Pi declares an OAuth-backed ChatGPT Codex provider in [`providers/openai-codex.ts`](../../refs/pi/packages/ai/src/providers/openai-codex.ts#L7). Its OAuth implementation defines browser PKCE, device authorization, token exchange and refresh, account extraction, and callback behavior in [`utils/oauth/openai-codex.ts`](../../refs/pi/packages/ai/src/utils/oauth/openai-codex.ts#L33).

Pi builds the complete model-visible request, tool definitions, reasoning settings, encrypted reasoning replay request, prompt-cache metadata, and streaming options in [`openai-codex-responses.ts`](../../refs/pi/packages/ai/src/api/openai-codex-responses.ts#L481). It sends directly to the ChatGPT backend's `/codex/responses` path, supplies account and client metadata, decodes the stream, and maps provider events into normalized messages.

Above that transport, Pi owns a streaming tool loop, lifecycle events, append-only sessions, output truncation, and local compaction. These mechanisms demonstrate that the desired small harness is feasible, while also showing that authentication plus a Responses request is only the bottom layer.

### Official documentation does not establish a general subscription API contract

The official [Codex authentication documentation](https://learn.chatgpt.com/docs/auth) documents ChatGPT subscription sign-in for Codex product surfaces such as the desktop app, CLI, and IDE extension. The official [OpenAI API authentication reference](https://developers.openai.com/api/reference/overview#authentication) documents API keys and workload-identity access tokens for general API requests.

Neither source establishes Pi's ChatGPT client identity and direct Codex backend request as a supported third-party contract for Pho Code. The correct conclusion is bounded: Pi's audited source proves how Pi behaved at its recorded revision; it does not prove permanence, authorization for another product identity, or compatibility across every account and workspace.

This uncertainty is accepted because subscription access is the practical V1 requirement. It must remain localized in one backend, documented in diagnostics and release notes, and protected by a live compatibility gate.

### Codex remains behavioral evidence

The Codex source remains useful for tool schemas, event semantics, process handling, output limits, patch behavior, approval safety, context construction, and future compaction and subagent requirements. Pho Code does not link Codex's internal Rust workspace or treat its types as a stable library API.

### `fff-search` is a deliberate concrete dependency

The `fff-search` crate exposes background workspace indexing, filesystem watching, fuzzy path matching, content search, Git-aware metadata, and optional frecency/query databases through its Rust API. This matches a resident GUI harness better than spawning `find` and `grep` for every model query.

The crate also brings a broader dependency and background-work surface than a one-shot command. V1 will therefore wrap only the file-picker and content-search behavior it needs, use one bounded index per selected workspace, and omit persistent frecency/query history until measured product value justifies it. Search failure remains visible; the harness does not silently fall back to unrelated command semantics.

## Decision

### Product and platform boundary

V1 supports one macOS application process, one selected local workspace per active session, one ChatGPT Codex backend, one root agent turn at a time, sequential tool execution, and append-only local sessions. Multiple saved sessions may exist, but V1 does not run concurrent agents or parallel model turns.

The first usable build may remain unsigned and developer-launched. Distribution, notarization, automatic updates, and other operating systems are V2 or later unless a separate decision promotes them.

### Runtime ownership

| Concern | Pho Code V1 | ChatGPT Codex backend | macOS / workspace |
| --- | --- | --- | --- |
| OAuth initiation, callback, refresh serialization, logout | Owns | Authorizes and issues credentials | Keychain stores credentials |
| Account entitlement and model availability | Observes and reports | Authoritative | N/A |
| Request construction and streamed transport | Owns | Produces response events | Network stack carries traffic |
| Model inference and provider-exposed reasoning | Projects | Authoritative | N/A |
| Agent and tool continuation loop | Owns | Requests tool calls and consumes results | N/A |
| Tool schemas and validation | Owns | Selects from supplied tools | N/A |
| File search, reads, patches, and shell execution | Owns policy and orchestration | Observes only tool results | Filesystem and processes perform effects |
| Approvals | Owns user decision and enforcement | N/A | User authorizes side effects |
| Session journal and reconstruction | Owns | Supplies response metadata | Filesystem stores journal and artifacts |
| Model-visible context | Owns construction | Enforces context window | N/A |
| GUI and observable trace | Owns | Supplies provider events | GPUI renders |
| Compaction and subagents | Deferred to V2 | Not relied on for V1 | N/A |

The table is a correctness boundary. No GPUI view may perform provider I/O or execute a tool, and no backend event may mutate the workspace without passing through the Pho Code tool policy and approval state.

### Authentication boundary

Pho Code will implement browser-based OAuth with PKCE and a loopback callback, following the behavior audited in Pi. The flow must generate a high-entropy verifier and state, bind only to loopback, validate callback path and state, support cancellation and a bounded timeout, exchange the authorization code, and return to an explicit authenticated or failed state. A manual redirect/code fallback may be provided when the callback cannot bind or complete. Device authorization is optional for V1 and should be added only when the browser flow proves insufficient on macOS.

Access tokens, refresh tokens, expiry, and the account identifier required by the backend are stored in macOS Keychain under Pho Code's own service namespace. Sessions, diagnostics, prompts, and preferences never contain credentials. Pho Code does not read or reuse `~/.codex/auth.json`, Pi's auth file, or another application's keychain entries.

One authentication actor serializes reads, refreshes, writes, and logout. V1 also acquires an operating-system-released single-instance lock for its application-support namespace before reading Keychain, so a second Pho Code process cannot race refresh-token rotation. The actor refreshes before expiry with a conservative skew and may perform one refresh-and-retry after a terminal pre-stream authentication rejection only when no SSE stream or side effect has begun. Refresh-token rotation is persisted as one logical update; a transient refresh failure retains the Keychain record and enters `TemporarilyUnavailable`. An authoritative invalid grant or revoked credential enters `ReauthenticationRequired`, removes the bundle from active use, and attempts to delete it from Keychain. Account entitlement or backend compatibility rejection does not by itself delete an otherwise valid credential.

The token is treated as an opaque credential. If a claim must be decoded to obtain the ChatGPT account identifier used by the audited transport, decoded claims are metadata, not a local proof that authentication succeeded.

### Model backend boundary

V1 implements one concrete `ChatGptCodexBackend` plus one deterministic `ScriptedBackend` used by tests. Provider-neutral model request and event types keep ChatGPT wire objects out of the harness, but V1 does not introduce a registry, plugin protocol, dynamic capability negotiation, or a generic authentication framework.

The backend owns URL and header construction, request DTOs, SSE framing, optional content decoding, provider event mapping, account metadata, opaque response replay fields, and compatibility diagnostics. The harness owns conversation context, tool definitions, limits, and continuation decisions.

The backend emits normalized lifecycle events for text, provider-exposed reasoning, output-item boundaries, tool-call argument deltas and completion, usage, terminal completion, incomplete response, cancellation, and failure. Unknown well-formed optional events are retained as bounded diagnostics; missing or incompatible events required to continue a tool call fail the turn.

Pho Code never labels reasoning summaries as private chain-of-thought. It records whether content was a summary or provider-returned reasoning when the transport distinguishes them.

### Agent-loop boundary

The loop accepts one user turn, constructs model-visible context, streams one assistant response, validates any requested tool calls, obtains required approvals, executes tools sequentially, appends tool results in source order, and continues until the model returns a terminal assistant response or a configured limit is reached.

Explicit limits cover model continuations per turn, tool calls per turn, tool argument bytes, tool result bytes sent back to the model, wall-clock duration, pending approvals, and queued UI events. Cancellation propagates to the active provider request or tool process and ends the turn as interrupted only after the owning operation acknowledges termination or a timeout produces an explicit uncertain state.

The loop does not infer success from a displayed delta. Completed provider items and completed tool executions establish durable content. A partially streamed tool-call argument object is never executed.

### Tool boundary

V1 exposes four capabilities through narrow schemas:

- file/path and content search backed by `fff_search`;
- bounded text-file reading using ordinary buffered filesystem I/O on a background executor;
- an in-process `apply_patch` implementation with preflight validation and visible diffs;
- noninteractive shell execution through a controlled macOS `zsh` process.

`io_uring` is not used. It is a Linux interface and does not apply to the macOS-only V1 target. Source-file reads are latency- and correctness-oriented rather than high-throughput bulk I/O; adding a Linux-specific async I/O architecture would increase dependencies and platform branches without improving the dominant workload. The read tool instead supports bounded line ranges, line numbers, text/binary detection, canonical path containment, symlink checks, and observable truncation.

Workspace reads and searches may run without approval. Every patch and shell command requires an explicit per-call user decision in V1. No persisted always-allow policy exists. Outside-workspace access is rejected. Approvals are guardrails and an interaction contract; V1 does not claim a strong OS sandbox.

The patch tool parses and validates the entire request before mutation, rejects ambiguous or stale hunks, resolves every path inside the workspace, presents the computed diff, stores recovery material before replacement, writes through same-directory temporary files, and reports per-file results. File deletion, if supported by the patch grammar, uses recoverable macOS Trash rather than permanent removal.

The shell tool uses a noninteractive shell without loading user startup files, a deliberate working directory, a filtered environment, closed stdin, concurrent stdout/stderr capture, a process group for cancellation, a timeout, bounded live output, and a retained artifact subject to a hard cap. PTY and interactive program support are outside V1.

### Persistence boundary

Each session is a versioned append-only JSONL journal owned by Pho Code. The journal records durable user and assistant messages, provider-exposed reasoning, tool requests and results, approvals and decisions, turn lifecycle, usage, backend continuation metadata needed for reconstruction, and interruption or failure. High-frequency rendering deltas need not be persisted individually when the authoritative completed record retains their content.

Full or extended tool output may be stored in bounded session artifacts with journal references. Truncated model-visible and UI previews record their limit and omitted amount when known. Credentials remain separate in Keychain.

On restart, completed records reconstruct once. A turn or tool left active becomes interrupted or uncertain; pending approvals are invalidated; mutating tools are never replayed. V1 does not compact the journal or branch it. When model context cannot continue safely, the turn fails with a visible context-limit state and offers a new session rather than silently dropping history.

### GPUI boundary

Views render projected domain state and dispatch intents. Provider networking, OAuth waits, file indexing, filesystem reads, patch application, shell waits, journal I/O, and async orchestration remain outside render paths.

The first product view contains account status, workspace and session selection, transcript, composer, structured reasoning and tool rows, approval interaction, interrupt, and failure/recovery state. It does not include a terminal emulator, file tree, IDE editor, diff editor, model marketplace, plugin manager, compaction controls, or agent tree.

### V1 and V2 boundary

V1 includes enough hardening to avoid data loss, credential leakage, invisible mutation, unbounded memory, and false recovery claims. Deferring Phase 9 hardening does not permit unsafe V1 shortcuts.

V2 is the first version that may include:

- local context budgeting and compaction;
- child sessions, bounded scheduling, communication, and Claude-style agent presentation;
- a second real backend and the resulting abstraction refactor;
- branching histories and migrations beyond the V1 journal;
- strong sandboxing, broader platform support, signing, notarization, distribution, performance tuning, and plugin or extension design.

The existing compaction and subagent documents are retained as historical app-server designs and requirement inputs. They are not V1 acceptance contracts and do not become native V2 designs without separate review.

## Consequences

### Benefits

- Pho Code becomes the harness the product intends to own rather than a presentation wrapper.
- No Codex binary or app-server protocol is required at runtime.
- The observable trace and persistence contract are under Pho Code's control.
- Pi's small event-driven and append-only design can be adapted directly to Rust and GPUI needs.
- V1 can stay understandable by omitting compaction, subagents, provider catalogs, and plugin infrastructure.
- A later backend can reuse the tested agent loop and tools rather than replace the application.

### Costs and constraints

- Pho Code handles OAuth credentials and assumes responsibility for refresh correctness and secure storage.
- The selected ChatGPT backend integration may change without a stable third-party compatibility promise.
- Tool execution and approval design become security-critical local code.
- Session reconstruction and context construction must be correct before the GUI can claim durable conversations.
- V1 cannot continue arbitrarily long sessions because native compaction is deferred.
- A single real backend does not yet prove operational independence from OpenAI; it proves independence from the Codex executable.
- macOS-only and personal-use scope limits immediate distribution.

## Rejected and deferred alternatives

### Continue with app-server

Superseded for V1. App-server remains a strong choice for a client that wants Codex-owned compaction, tools, persistence, and subagents, but it contradicts the clarified requirement that Pho Code own the harness and later support another backend.

### Use an API key for the first backend

Rejected for V1 because ChatGPT subscription access is the practical reason for the project. API-key support remains a possible later backend or recovery path, but it does not replace the Phase 1 validation obligation for subscription OAuth.

### Port Pi line by line

Rejected. Pi is TypeScript, supports many providers and extension surfaces, and contains product-specific behaviors that Pho Code does not need. Pho Code will reimplement the verified mechanisms in idiomatic Rust, keep source citations for adapted behavior, and preserve license notices if source is copied rather than independently implemented.

### Link Codex internal Rust crates

Rejected. The internal workspace is broad, release-coupled, and would return runtime ownership to Codex internals while importing substantially more functionality than V1 needs.

### Implement a general provider framework now

Rejected. `ChatGptCodexBackend` and `ScriptedBackend` are sufficient. The scripted implementation proves deterministic testing, not provider portability. A second real backend in V2 will establish the common contract and justify any trait or registry extraction.

### Use `io_uring` for file reads

Rejected. It is unavailable on macOS and does not address the dominant bounded text-read workload. A background buffered reader is smaller, portable within the chosen target, easier to cancel, and sufficient to keep GPUI responsive.

### Claim production-grade sandboxing

Rejected for V1. Explicit approvals, workspace containment, environment filtering, process groups, and recoverable patch writes reduce risk but do not form an OS security boundary. A strong macOS sandbox requires a dedicated threat model and validation phase.

## Failure and recovery requirements

The implementation plan must cover at least:

1. Browser callback port conflict, invalid state, cancellation, timeout, and manual fallback.
2. Missing, expired, rotated, revoked, or malformed credentials without token disclosure.
3. Refresh failure under concurrent requests without duplicate refresh or credential loss.
4. Backend authorization or compatibility rejection with an explicit reassessment state.
5. Malformed, oversized, unknown, incomplete, or abruptly closed SSE streams.
6. Partial tool-call arguments that never execute.
7. Provider disconnect before and after partial output, with retry ambiguity surfaced.
8. Tool schema rejection, denial, timeout, cancellation, and output overflow.
9. Search index scan failure, watcher failure, workspace change, and stale results.
10. File read path escape, binary content, oversized file, symlink escape, and concurrent mutation.
11. Patch stale context, ambiguous match, partial filesystem failure, and recovery material.
12. Shell spawn failure, stdout/stderr flood, timeout, process-group termination, and nonzero exit.
13. Journal partial trailing record, failed append, duplicate reconstruction, and schema mismatch.
14. Application exit during provider streaming, approval, patch, or shell execution.
15. Model context exhaustion without silent history loss.
16. UI overload without loss of authoritative terminal events.

## Phase 1 stop conditions

Pause and revisit this decision before building the full harness if any of the following occurs:

- the login flow requires an unavailable or unauthorized client identity rather than a public-client-compatible path;
- the account or backend rejects Pho Code's originator or required request metadata;
- token refresh cannot be implemented without reading another application's credential store;
- the required Codex model or tool-calling behavior is unavailable to the authenticated subscription;
- the transport cannot preserve the provider output required for correct tool continuation;
- an authoritative policy or service contract establishes that the selected direct integration is inappropriate for Pho Code;
- the only working implementation silently launches Codex or app-server.

The outcome may be a new authentication decision, an API-key fallback, a temporary app-server compatibility mode, or cancellation of the backend. It must not be an undocumented workaround distributed as stable support.

## Validation plan

### Deterministic evidence

- Sanitized OAuth, refresh, request, SSE, tool-call, completion, and error fixtures derived from the audited sources or locally captured Pho Code traffic.
- Unit tests for PKCE, state validation, expiry decisions, refresh serialization, SSE framing, provider event normalization, loop transitions, tool policies, journal parsing, and redaction.
- Scripted backend tests for fragmented tool arguments, duplicate and late events, cancellation, invalid event order, tool failure, and limit exhaustion.
- Filesystem and process tests using temporary workspaces and nonsecret commands.

### Live evidence

- Browser subscription login and reuse from macOS Keychain.
- Refresh or a controlled equivalent without exposing credentials.
- One streamed text response with provider-exposed reasoning when available.
- One live tool request, result continuation, and final response.
- Approval, denial, interruption, restart, session reconstruction, and continued conversation.

Live evidence must record the date, Pi and Pho Code implementation revision, account/workspace class without personal identifiers, selected model, observed endpoint behavior, and any compatibility assumptions. It must not capture credentials or raw sensitive prompts.

### Evidence language

Fixture coverage proves Pho Code behavior against the fixture. It does not prove current service compatibility. A live authenticated walkthrough proves the observed account and date, not a permanent public contract. Documentation and release notes must retain that distinction.

## Security and privacy requirements

- Store subscription credentials only in macOS Keychain under a Pho Code namespace.
- Never log authorization headers, tokens, callback codes, PKCE verifiers, raw keychain records, or unredacted backend request bodies.
- Bind the OAuth callback to loopback only and validate state before code exchange.
- Keep session journals and output artifacts user-local and document that they contain prompts, file content, reasoning summaries, commands, diffs, and output.
- Canonicalize and validate workspace paths before reads or mutation; do not rely on lexical prefix checks.
- Require an explicit decision for every V1 shell command and patch.
- Do not persist approvals for automatic reuse.
- Bound network frames, event queues, tool arguments, process output, journal records, artifacts, and diagnostics.
- Keep mutation recovery material separate from model-visible tool results.
- Structured file tools never permanently delete and use macOS Trash for supported removals. The shell rejects known direct permanent-deletion utilities as defense in depth but remains a general approved process rather than a deletion-proof sandbox.

## Open follow-up decisions

This ADR does not freeze:

- the exact OAuth client metadata and callback port that the Phase 1 spike will validate;
- whether device authorization joins browser PKCE in V1;
- the initial model slug and model-availability discovery strategy;
- exact queue, request, tool, output, journal, and artifact limits;
- the Rust crates used for HTTP/SSE, Keychain access, process groups, and atomic writes;
- whether completed session content is encrypted at rest beyond normal macOS user-account protection;
- the exact visual language for reasoning, tool progress, truncation, and uncertain interruption;
- signing or distribution beyond developer-local use.

These are resolved through the implementation phases and captured in tests or follow-up decisions when they materially affect compatibility, security, or persisted data.

## Licensing consequence

Pi is MIT licensed and Codex is Apache-2.0 licensed. This ADR describes behavior and copies no implementation source. Any later direct adaptation must preserve applicable notices and identify the source revision. `fff-search` is MIT licensed at the evaluated release and must be included in dependency and distribution license review.

## Validation status of this decision

This decision is based on a read-only source audit, current official authentication documentation, and the user's accepted product scope. No Pho Code OAuth, direct Responses, tool, session, or GPUI harness implementation existed when the ADR was accepted. ChatGPT subscription compatibility remains the first high-risk live gate rather than a completed fact.
