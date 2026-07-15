# Native harness system architecture

- Status: Normative V1 design
- Last updated: 2026-07-15
- Governing decision: [ADR 0003](../decisions/0003-deepseek-api-first-backend.md)
- Delivery sequence: [Implementation roadmap](../implementation/README.md)
- Component contracts: [DeepSeek backend](deepseek-api-backend.md), [tools](tools.md), and [sessions](sessions.md)
- Historical predecessor: [App-server client system](system.md)

## Document role

This document owns whole-system components, dependency direction, identities, application state, canonical event flow, concurrency, and presentation/runtime boundaries. It deliberately links component behavior and delivery checks instead of copying them.

[ADR 0003](../decisions/0003-deepseek-api-first-backend.md) owns the accepted product scope, DeepSeek pivot, command-mode boundary, alternatives, and reversal conditions. Component architecture owns detailed behavior. Phase files own work order and acceptance evidence. The evidence vocabulary and source baselines live in [the documentation index](../README.md).

## Architectural invariants

1. Pho Code owns credential state, context construction, the agent loop, tools, approvals, sessions, recovery, and presentation projection.
2. The credential actor owns API-key custody and leases; the concrete backend owns only DeepSeek wire behavior and never executes a local tool or mutates application state directly.
3. The `pho` command adapter and GPUI views render projected state and dispatch intents; they never perform network, Keychain, filesystem, journal, process, or orchestration work.
4. The reducer is the sole writer of user-visible application state and behaves deterministically for the same event sequence.
5. Completed provider items and completed tool results are authoritative over deltas and optimistic display fragments.
6. Every stream or child operation has a bounded queue, explicit owner, cancellation path, and one terminal outcome.
7. Tool execution begins only after complete arguments validate; patch and shell begin only after approval bound to the exact validated effect.
8. Session JSONL is durable local history; the in-memory projection is derived and rebuildable.
9. Credentials never enter arguments, environment variables, sessions, artifacts, model-visible results, child processes, or ordinary logs.
10. Restart never replays an approval, repeats a tool, or infers that an interrupted effect completed.
11. Model-visible truncation is explicit. V1 does not silently remove history or implement native compaction.
12. One session remains pinned to its qualified backend/model/thinking profile.
13. Command mode and GPUI consume the same intents and canonical events; neither owns a second harness or provider path.
14. Every request in one turn uses the same versioned Pho Code instruction-profile snapshot; instruction text guides model behavior but never grants authority or substitutes for code-enforced policy.

## System shape

```mermaid
flowchart LR
    U["User"] --> P["`pho` command or GPUI view"]
    P --> A["Application actions"]
    A --> R["Deterministic reducer"]
    R --> P
    R --> O["Runtime coordinator"]
    O --> L["Agent loop"]
    L --> C["Context builder"]
    L --> B["DeepSeek backend"]
    B --> N["API key, Keychain, HTTPS, and SSE"]
    L --> T["Tool runtime"]
    T --> F["Workspace and child processes"]
    O --> J["Session journal and artifacts"]
    J --> R
    B --> O
    T --> O
```

The reducer owns durable visible facts. Actors hold ephemeral handles and report typed events through bounded channels. The coordinator connects accepted intents to actors and ensures that every started operation produces one terminal event. Command and GPUI adapters differ only in input and rendering; all effects remain below this boundary.

## Component ownership

### Application shell and reducer

The application shell acquires and retains the process-wide single-instance guard before constructing any actor that may touch Keychain or writable session state. It then initializes non-secret preferences, actors, workspace, session, the top-level reducer, and the selected command or GPUI adapter, and coordinates shutdown without performing component work itself.

The reducer accepts typed intents and runtime events only. It contains no terminal handles, process handles, HTTP responses, Keychain values, file objects, or async closures. Invalid or late transitions become bounded diagnostics and cannot silently rewrite a terminal item.

### Runtime coordinator

The coordinator owns active task handles, bounded channels, cancellation tokens, and the one-active-turn rule. It starts work only after the reducer accepts an intent and translates actor terminal events back into durable application events.

The coordinator is not a second state store. Ephemeral handles disappear on restart; durable facts go through the session boundary before recovery can rely on them.

### Credential actor and backend

One credential actor owns API-key installation, validation, Keychain access, leases, replacement, and logout. It is constructed only after the application shell holds the single-instance guard and cannot acquire or release that process-lifecycle guard itself. `DeepSeekBackend` owns provider DTOs, headers, HTTPS/SSE, assistant-phase assembly, event mapping, model compatibility, and usage fields. Their exact contract is [the backend architecture](deepseek-api-backend.md).

The backend emits normalized events and cannot decide whether a tool runs. `ScriptedBackend` implements the same narrow streaming boundary for deterministic tests; it does not justify a public provider framework. Frozen ChatGPT source is outside the current component and default compile graphs and is never selected as fallback.

### Agent loop and context builder

The loop owns one user turn from context snapshot to terminal outcome. It streams one backend response, accepts only completed tool calls, delegates validation/approval/execution to the tool runtime, appends results in provider order, and continues until terminal response or a configured limit.

The agent layer owns one code-reviewed V1 instruction profile containing identity/persona, working method, tool guidance, and safety guidance. The profile has an explicit revision and content digest. The coordinator snapshots it before a turn, and the loop supplies the exact same bytes to the initial request and every tool continuation. Any content change requires an intentional revision update and fixture review. V1 has no environment, workspace-file, provider, or ordinary command-input override for system instructions; user-configurable instruction precedence and durable session pinning require a later explicit design.

Instruction text treats workspace content and tool output as potentially untrusted data and tells the model not to bypass approval, containment, deletion, secret, output, timeout, or cancellation controls. Those statements are defense in depth only. The tool runtime, credential actor, context validator, coordinator, and presentation boundary remain authoritative even when the model ignores, misunderstands, or is induced to contradict the instructions.

The shared runtime configuration names maximum model continuations per turn, tool calls per turn, tool-argument bytes, model-visible tool-result bytes, turn wall-clock duration, pending approvals, and canonical/presentation handoff capacity. The command adapter drains canonical and presentation events synchronously, so each handoff has at most one outstanding event; zero capacity fails before work starts. Its bounded renderer uses nonblocking terminal descriptors so a non-draining sink fails visibly instead of blocking the coordinator. An asynchronous adapter must place the same handoffs behind bounded channels. Backend and tool contracts add their component byte and time bounds. Exhausting a loop or renderer limit stops new requests and effects, cancels the current owner when necessary, and produces one visible terminal result; it never silently drops work or continues with a partial call/result pair.

The context builder reconstructs provider-neutral model input from canonical completed phases and selects enabled fixed schema snapshots supplied by the tool runtime. It preserves assistant text/reasoning/tool grouping, exact call/result identities, and provider-required replay data, rejects inconsistent history, and reports context fit without truncating. Wire conversion remains inside the backend.

### Tool runtime

The tool runtime owns schema definitions, argument validation, workspace policy, approvals, one-active-tool scheduling, execution, live deltas, canonical previews, truncation, artifact write requests/references, and cancellation. Search, read, patch, shell, and model-visible output behavior are defined in [the tool architecture](tools.md).

### Session store

The session store owns versioned append-only JSONL, flush boundaries, persistent artifact files and limits, reconstruction, interrupted/uncertain recovery, and context replay. Those persistence semantics are defined only in [the session architecture](sessions.md).

### Diagnostics

Diagnostics retain bounded structured facts needed to explain compatibility and lifecycle failures: component, operation, safe identity, state, provider event or finish type, status class, byte counts, usage-field presence, truncation, and timing.

They exclude API keys, raw headers, environment values, prompts, provider reasoning, file bodies, complete command output, personal paths, account data, and replay content. Export requires a user-reviewed preview.

## Module boundaries

The initial package follows this dependency direction:

```text
src/
  main.rs
  cli/
    command.rs
    renderer.rs
    terminal.rs
  app/
    action.rs
    instance_lock.rs
    reducer.rs
    state.rs
  auth/
    api_key.rs
    keychain.rs
  backend/
    deepseek.rs
    scripted.rs
    sse.rs
  agent/
    instructions.rs
    loop.rs
    context.rs
    types.rs
  tools/
    search.rs
    read.rs
    patch.rs
    shell.rs
    output.rs
  session/
    journal.rs
    record.rs
    recovery.rs
    artifacts.rs
  ui/
    workspace.rs
    transcript.rs
    composer.rs
    approval.rs
    auth.rs
    diagnostics.rs
```

Exact files may evolve, but dependency rules do not: provider DTOs stay private to `backend::deepseek`; Keychain values stay private to `auth`; terminal and GPUI types stay inside their adapters; tools and sessions do not depend on either adapter; the loop sees normalized backend and tool types. Frozen ChatGPT source may remain under an explicitly historical namespace outside the default module graph, but current modules never depend on it. Any optional feature that compiles it must still pass all-feature checks.

## Identities and canonical items

Local opaque identities are independent from display order and provider IDs:

```text
WorkspaceId
SessionId
TurnId
ItemId
BackendRequestId
ToolCallId
ApprovalId
ArtifactId
```

Provider IDs are stored separately only when wire replay or safe diagnostics require them. Pho Code never substitutes a local item ID for a provider call ID.

Canonical visible/durable item kinds are:

```text
UserMessage
AssistantPhase
AssistantText
ProviderReasoning
ToolCall
Approval
ToolResult
Usage
TurnStatus
Diagnostic
```

`AssistantPhase` is the canonical grouping required for provider replay. It owns zero or one assistant-text value, zero or one provider-reasoning value, and ordered completed tool calls. The terminal and GPUI may project those children as separate rows without changing their grouping. `ProviderReasoning` is provider-returned content, remains sensitive, and records whether exact replay is required.

## State model

```text
AppState
  startup: Starting | Ready | Failed
  credentials: Missing | Installing | Validating | Ready |
               TemporarilyUnavailable | Invalid | Malformed | RemovalFailed
  workspace: None | Opening | Open | WorkspaceFailed
  session: None | Loading | Ready | SessionFailed
  active_turn: Option<TurnState>
  pending_approval: Option<ApprovalState>
  transcript: ordered projected items
  diagnostics: bounded ring
```

`TemporarilyUnavailable` retains the Keychain record but does not claim current remote availability. `Invalid` quarantines a key rejected with HTTP 401. Insufficient balance, model unavailability, rate limiting, and request incompatibility are backend failures while the credential remains installed.

An active turn moves through:

```text
Preparing
RequestingModel
StreamingModel
AwaitingApproval
RunningTool
ContinuingModel
Cancelling
Completed | Failed | Cancelled | Interrupted | Uncertain
```

Only one approval or running tool exists in V1. Terminal turns are immutable except for later recovery/diagnostic annotation.

## Canonical event flow

### User turn

1. The user dispatches `SendPrompt` with session identity and text.
2. The reducer validates credential, backend profile, workspace, session, and active-turn state.
3. The session writer records the turn/effect boundary required by [durability policy](sessions.md#durability-boundaries).
4. The context builder reconstructs complete retained context and selects the fixed schema snapshots supplied by the tool runtime.
5. The loop starts the backend stream and emits normalized item events.
6. Deltas update the projection; an authoritative completed assistant phase becomes durable with its text, reasoning, and ordered calls grouped.
7. A terminal provider response completes the turn, or completed calls from the assistant phase enter validation in provider order.

### Tool continuation

1. The loop accepts an authoritative provider-completed assistant phase containing calls with complete argument bytes.
2. The tool runtime strictly parses and validates the fixed local schema.
3. When required, it creates an approval bound to the canonical effect and current source state.
4. Denial produces a structured tool result; approval permits one execution.
5. Every terminal tool result becomes durable before entering the next model request.
6. The loop continues with full retained context, the original assistant phase, exact call/result pairing, and required reasoning replay.

End-of-stream without both a recognized finish reason and required stream terminator fails the turn. A cancelled, failed, filtered, resource-interrupted, incomplete, or length-stopped response cannot execute an unfinished call.

## Concurrency, cancellation, and errors

V1 has one reducer, one credential actor, at most one backend stream, one active tool, one serialized session writer, one search index per open workspace, one active presentation adapter, and a bounded blocking executor. Every producer uses bounded channels. Completed, approval, tool-result, failure, and terminal events cannot be silently dropped; overload fails visibly.

Cancellation is owned by the operation being stopped. Backend abort, credential validation abort, terminal signal or broken-pipe notification, search generation invalidation, read cancellation, patch cancellation at durable effect boundaries, shell process-group termination, and writer shutdown each produce an explicit terminal result. Once patch commit begins, cancellation may require rollback or an exact partial/uncertain result according to [the patch contract](tools.md#commit-strategy). Cancellation intent alone is not proof of termination.

Errors cross boundaries as structured categories with operation, safe identity, user message, diagnostic code, and retry classification. Retry classification is advisory; V1 never automatically retries a model request. An explicit user retry starts from visible canonical state under [the backend contract](deepseek-api-backend.md#cancellation-delivery-ambiguity-and-retry).

## Security boundary

The model and backend stream are untrusted input. They cannot grant approval, widen a workspace, select secret environment values, or turn a read tool into a mutation. System instructions can guide the model but cannot expand those authorities. The API key remains in Keychain/in-memory credential state. First-party file operations enforce containment; approved shell remains a general process under the user's account and is not a sandbox.

Component-specific security rules live in [backend security](deepseek-api-backend.md#security-and-privacy-requirements), [tool security](tools.md#security-and-privacy), and [session privacy](sessions.md#storage-location-and-privacy).

## Presentation adapters and application lifecycle

The transcript is an execution trace, not a flat chat list. It preserves labeled provider-exposed reasoning, assistant text, validated tool requests, approval state, running/cancelling state, bounded output, truncation/artifact metadata, and terminal completion/failure/cancellation/interruption/uncertainty.

The `pho` command adapter parses bounded command input, dispatches typed intents, renders canonical events, and maps terminal domain state to a process result. It obtains secrets and approvals only from a controlling terminal, treats broken pipes and signals as cancellation inputs, and never reads Keychain, invokes a backend, or executes a tool directly. Its raw and interactive terminal projections consume the same canonical events. Before durable sessions exist, an interactive process may dispatch repeated explicitly ephemeral turns, but displayed prior turns do not enter later model context; once Phase 5 passes, ordinary chat uses the session boundary.

`pho context` is an offline inspection command outside the application-operation path. It prints the exact built-in system instructions, their revision and digest, fixed model/request settings, runtime limits, and the ordinary plus disposable-debug tool schema profiles. It does not acquire the instance lock, read Keychain, select a workspace, capture a prompt/history, or send a network request. It labels dynamic per-turn messages as unavailable and service-side provider context as unobservable instead of claiming to reproduce either.

GPUI views render projected state and dispatch the same typed intents. They may coalesce deltas and virtualize old rows but cannot hide lifecycle boundaries or mutate runtime actors directly. Command and GPUI rendering can differ in layout while preserving the same item kinds, approvals, truncation, and terminal truth.

Startup order is: command parsing without secret values, diagnostics/preferences, single-instance lock, session scan when available, credential actor, workspace/search index when requested, selected-session recovery, presentation adapter, then coordinator actions. Credential or network failure still permits offline session inspection after the session phase exists.

Shutdown rejects new work, cancels the active owner, invalidates pending approval, flushes terminal/interrupted state, stops watchers/actors, and exits only after owned child processes are reaped or an explicit uncertain-shutdown diagnostic is durable.

## Test seams and architecture checks

- `ScriptedBackend` supplies deterministic event sequences without network access.
- Fake clock, secret input, credential store, and loopback HTTP service cover credential state.
- Temporary sessions/workspaces and deterministic child commands cover I/O boundaries.
- The same reducer handles scripted, live, and reconstructed events.
- Terminal and GPUI adapters can be tested against the same canonical event transcript.

Phase-specific verification and gates live under [the implementation roadmap](../implementation/README.md). Architecture review is required if provider DTOs leak into core state, command or GPUI code performs runtime work, those adapters produce different lifecycle behavior, a second concurrent request becomes necessary, a tool effect cannot bind to approval, recovery must guess whether an effect happened, or a V2 feature becomes necessary for the accepted V1 outcome.

## V2 seam

Canonical records, local/provider identity separation, a narrow backend boundary, and an independent tool runtime are intended to make later decisions possible; they are not predesigned compaction, subagents, or provider portability. See the intentionally brief [V2 roadmap](../implementation/v2/README.md).
