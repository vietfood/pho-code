# Codex source study

- Status: Source audit complete; original app-server recommendation superseded by ADR 0002
- Audited revision: `393f64565ab46f09d99ca4d9bd973537e72a114b`
- Audit date: 2026-07-14
- Locally inspected binary: `codex-cli 0.144.1`
- Scope: App-server, ChatGPT authentication, threads and turns, approvals, persistence, compaction, subagents, and the implications for a small GPUI client
- Primary conclusion at audit time: `codex app-server` is the narrowest boundary that exposed the then-required Codex behavior

> **Current architecture note:** [ADR 0002](../decisions/0002-native-agent-harness.md) removes app-server from V1 and defers compaction and subagents to V2. This audit remains source evidence for Codex authentication, transport, tool, approval, persistence, compaction, and subagent behavior; it is not the current Pho Code runtime contract.

## Purpose

This study explains Codex mechanisms that informed the former app-server design and remain useful evidence for Pho Code's native tools, state, compaction, subagents, and safety behavior. It is a source study rather than an implementation specification; current V1 contracts live in the ADR 0002 architecture documents.

The names “protocol V2” and “multi-agent V2” refer to different concepts. Protocol V2 is the app-server API namespace used throughout this historical audit; multi-agent V2 is a separate under-development feature. This distinction remains relevant only to a future app-server compatibility mode or source comparison.

## Executive findings

1. App-server is explicitly designed to power rich Codex clients and exposes a bidirectional, JSON-RPC-like protocol over stdio JSONL.
2. Managed ChatGPT login lets Codex own browser or device authorization, credential persistence, refresh, account state, and logout. Under ADR 0001 this kept tokens out of Pho Code; ADR 0002 deliberately accepts that responsibility with Keychain custody.
3. Threads, turns, and items form the public client model. The runtime owns model requests, tool continuation, history, resume, fork, rollback, compaction, and child sessions.
4. Approvals are server-initiated requests. A correct client must be fully bidirectional and must preserve the safety boundary during cancellation and reconnect.
5. Compaction is not merely a displayed summary. Codex selects local or remote mechanisms, can compact before or during a turn, persists exact replacement history and window metadata, and reconstructs from the newest checkpoint.
6. Stable multi-agent V1 is enabled by default. Multi-agent V2 adds richer persistent-tree and mailbox operations but is under development and disabled by default at the audited revision.
7. Child agents are Codex sessions and threads, not detached model calls. The app-server can surface their thread and item activity to initialized clients.
8. The protocol is version-specific. Any future app-server client should pin a supported runtime, generate matching schema for audit, type only required messages, tolerate unknown notifications, and test restart recovery.
9. Linking the internal Rust crates would import a broad workspace dependency graph. This remains evidence against treating Codex internals as Pho Code's native backend SDK.

## Relevant workspace components

| Component | Role in the audited architecture |
| --- | --- |
| `codex-rs/app-server` | Long-lived client-facing server, transport, connection lifecycle, request processing, and event fan-out. |
| `codex-rs/app-server-protocol` | Request, response, notification, item, account, thread, turn, and approval types plus schema generation. |
| `codex-rs/core` | Agent session, model loop, tools, sandbox coordination, compaction, history, state, and subagent control. |
| `codex-rs/login` | ChatGPT authentication and credential management used by Codex surfaces. |
| `codex-rs/protocol` | Lower-level persisted rollout, response, event, and session types shared inside the runtime. |
| `codex-rs/app-server-client` | In-process façade used by Codex surfaces; not selected for Pho Code because of its internal dependency graph. |

ADR 0001's design consumed the app-server protocol as a process client. Pho Code no longer does so in V1, but the internals explain which behaviors a native reimplementation can accidentally split or omit.

## App-server purpose and transport

The app-server README states that `codex app-server` powers rich interfaces such as the Codex VS Code extension in its [opening paragraph](../../refs/codex/codex-rs/app-server/README.md#L1). The official [Codex app-server documentation](https://learn.chatgpt.com/docs/app-server.md) likewise recommends it for deep integrations requiring authentication, conversation history, approvals, and streamed agent events.

### Wire format

The protocol resembles JSON-RPC 2.0 but omits the `jsonrpc` header. Requests and server-initiated requests carry identifiers; notifications do not. The default stdio transport uses one JSON object per line, documented in [`app-server/README.md`](../../refs/codex/codex-rs/app-server/README.md#L20).

Stdio was the ADR 0001 V1 choice because it:

- avoids a listening network port;
- naturally shares the child-process lifecycle;
- is easy to capture in deterministic fixtures;
- keeps protocol stdout separate from diagnostic stderr;
- is the documented default rather than an experimental transport.

The same README marks WebSocket as experimental and unsupported. Unix-socket control is available but unnecessary for the first locally spawned-client slice.

### Backpressure

App-server uses bounded queues between transport ingress, request processing, and outbound writes. When ingress is saturated, it returns code `-32001` with a retry-later message in [the backpressure section](../../refs/codex/codex-rs/app-server/README.md#L49).

This is a runtime guarantee and a client obligation. The former client design had to bound its own queues, keep reading while the UI was busy, classify retryable requests, and surface ambiguous failures for operations that could not be safely repeated.

### Versioned schema

The binary can generate TypeScript or JSON Schema output specific to its exact version in [the message-schema section](../../refs/codex/codex-rs/app-server/README.md#L55). During the audit, the installed `0.144.1` binary successfully generated a schema containing the required account, thread, compaction, approval, collaboration, and subagent item types.

Schema generation is evidence, not automatic compatibility. A future app-server mode would still need a supported-version policy and runtime handshake checks because a user may launch a different binary than the one used to generate fixtures.

## Connection lifecycle

Every connection begins with a single `initialize` request followed by an `initialized` notification. Requests before initialization fail, and repeated initialization fails; these rules are documented in [the initialization section](../../refs/codex/codex-rs/app-server/README.md#L87).

The initialize response exposes runtime metadata such as the Codex home and platform family. The former client design would record compatibility metadata in diagnostics without treating it as permission to read credential storage directly.

After initialization, the client typically:

1. reads account state;
2. completes login if necessary;
3. lists, starts, resumes, or forks a thread;
4. starts a turn with user input;
5. reads streamed notifications and answers server requests;
6. observes authoritative turn completion;
7. resumes or reconstructs after a process restart.

The lifecycle overview is documented in [`app-server/README.md`](../../refs/codex/codex-rs/app-server/README.md#L64).

## Managed ChatGPT authentication

The app-server auth documentation recommends managed ChatGPT authentication, where Codex owns OAuth, persists credentials, and refreshes them automatically in [`app-server/README.md`](../../refs/codex/codex-rs/app-server/README.md#L1919).

### Account operations

The protocol includes account read, login start, login cancellation, logout, and account update notifications. The login request supports:

- API-key login;
- managed ChatGPT browser login;
- ChatGPT device-code login;
- an internal token-injection mode;
- other experimental variants not relevant to Pho Code.

ADR 0001 selected only the managed ChatGPT variants. ChatGPT subscription access and API-key usage are different billing and policy modes in the official [authentication guide](https://learn.chatgpt.com/docs/auth.md), a distinction the current native backend also preserves.

### Browser flow

`account/login/start` with the ChatGPT variant returns a login identifier and authorization URL. The client opens the URL and waits for an account-login completion notification, then rereads account state. Browser launch is an interaction convenience; only runtime completion establishes authentication.

### Device flow

The device-code variant returns verification information for environments where the callback flow is unavailable. The former client design treated it as a fallback. Current native V1 studies it but implements it only if browser PKCE plus manual fallback proves insufficient.

### Internal token injection is excluded

The `chatgptAuthTokens` variant is labeled unstable and for OpenAI internal use only in [`protocol/v2/account.rs`](../../refs/codex/codex-rs/app-server-protocol/src/protocol/v2/account.rs#L87). It also transfers refresh responsibility to the host.

Using internal token injection would have defeated ADR 0001 and remains forbidden under ADR 0002. Current Pho Code owns its OAuth actor but does not accept Codex-injected or externally supplied ChatGPT token bundles.

### Credential authority

Codex may use plaintext auth storage or an operating-system keyring depending on configuration. The former client did not inspect either. Current Pho Code likewise never imports Codex credentials and stores its own bundle only in its Keychain namespace.

## Threads, turns, and items

The app-server client model has three top-level primitives described in [`app-server/README.md`](../../refs/codex/codex-rs/app-server/README.md#L64):

- A thread is a conversation and persisted agent session.
- A turn is one unit of agent execution within a thread.
- An item is a typed input, output, tool, approval-related, compaction, or collaboration record within a turn.

### Thread operations

The protocol includes start, resume, fork, read, list, archive, unarchive, rollback, and other lifecycle operations. Start creates a new thread; resume reconnects the runtime to persisted state; fork creates a new identifier with copied history.

The ADR 0001 client would initially have used only the smallest required set: account read/login, thread start/list/read/resume/fork, turn start/steer/interrupt, compact start, and approval responses. This is not a current V1 method list.

### Turn operations

`turn/start` supplies a thread identifier and user input plus optional runtime configuration such as model, working directory, sandbox, and approval policy. The server returns initial turn state and then emits lifecycle notifications.

`turn/steer` adds input at a supported execution boundary. `turn/interrupt` requests cancellation of the current turn. Neither should be emulated by writing synthetic messages into the GUI transcript.

### Item lifecycle

The common stream includes item started, item deltas, item completed, turn started, and turn completed. Item variants include user and agent messages, reasoning, command execution, file changes, tool calls, web operations, compaction, and collaboration state.

Partial text and reasoning deltas are useful for responsive display, but a completed item is the authoritative final representation. The Pho Code reducer must handle an item that starts, receives no visible delta, and completes, as well as completion after reconnect or out-of-order UI scheduling.

### Client projection

The app-server state is richer than a flat chat transcript. The former client therefore projected by `(thread_id, turn_id, item_id)` and derived ordered transcript rows, active operations, approval panels, and agent-tree summaries from that normalized state.

The projection is disposable. A persisted thread can be read or resumed to reconstruct authoritative state, but `thread/read` must set `includeTurns: true` when the transcript is required because turns are otherwise omitted, as documented in [`app-server/README.md`](../../refs/codex/codex-rs/app-server/README.md#L483). The app's local store should contain only UI preferences, recent identifiers, and diagnostics needed to restore presentation.

## Approvals and host requests

App-server sends approval requests from server to client and waits for a response before proceeding. The sequence is documented in [the approvals section](../../refs/codex/codex-rs/app-server/README.md#L1445), and request variants are mapped in [`protocol/common.rs`](../../refs/codex/codex-rs/app-server-protocol/src/protocol/common.rs#L1465).

Relevant requests include command execution, file change, and permission escalation. The client may also receive other host requests as features evolve.

### Safety implications

- The protocol implementation must correlate requests in both directions.
- The read loop must remain active while an approval dialog is open.
- The UI must display the runtime-provided action. When optional `availableDecisions` is present it is exact; when absent, a compatible client uses the conservative method-specific fallback documented for the pinned runtime and never invents a broader permission.
- Process exit, turn interruption, or thread invalidation cancels the pending UI request.
- Reconnecting must not replay an old approval response to a new request identifier.
- No local-default path may auto-approve simply because the runtime is a child process.

### Completion authority

An approval response permits the runtime to continue; it does not prove the command or file change completed. The UI updates final status from the subsequent authoritative item completion event.

## Runtime persistence and reconstruction

Codex persists rollout items and thread metadata under its own home. Session reconstruction rebuilds the active model-visible history and state from those records.

### Why ADR 0001 avoided a duplicate log

The Codex log includes state that a rendered transcript may omit: developer context, tool relationships, replacement histories, world-state baselines, model-specific compaction data, source metadata, and child-thread edges. A parallel Pho Code transcript database would be incomplete and could not safely resume the model loop.

Pho Code may cache projection data for startup performance later, but any cache must be invalidatable and subordinate to thread read or resume.

### Resume and fork

Resume restores a persisted thread and reconstructs the current model-visible context. Fork derives a new thread from existing history. Compaction checkpoints and model changes make both operations runtime responsibilities.

The first implementation must test process restart and resume before compaction or subagent UI is considered trustworthy, because both later features depend on reconstruction.

## Compaction architecture in Codex

Codex compaction comprises trigger accounting, mechanism selection, replacement generation, durable installation, and reconstruction. The dedicated [compaction architecture](../architecture/compaction.md) converts these findings into Pho Code behavior.

### Context-window accounting

[`session/context_window.rs`](../../refs/codex/codex-rs/core/src/session/context_window.rs#L1) calculates active context usage, usable window, automatic compaction scope, and whether the current limit has been reached. Provider-reported usage can inform the authoritative count, while local estimates cover cases without final server usage.

### Trigger points

Codex can compact:

- before sampling when the current context is already over the configured budget;
- during a tool-continuation loop when a new response would exceed the limit;
- when model compaction-compatibility hashes change;
- when a model downshift reduces the available context;
- manually through `thread/compact/start`.

Pre-turn and model-change logic is implemented in [`session/turn.rs`](../../refs/codex/codex-rs/core/src/session/turn.rs#L798). Mid-turn continuation logic appears earlier in [the same file](../../refs/codex/codex-rs/core/src/session/turn.rs#L280).

### Mechanism selection

The manual compact task selects token-budget, remote V2, legacy remote, or local compaction according to feature and provider capabilities in [`tasks/compact.rs`](../../refs/codex/codex-rs/core/src/tasks/compact.rs#L27). The audited `remote_compaction_v2` feature is stable and enabled by default in [`features/src/lib.rs`](../../refs/codex/codex-rs/features/src/lib.rs#L1357).

That feature stage does not guarantee every account or provider uses remote V2. The former client design observed lifecycle events and final state rather than exposing a UI toggle for internal compaction selection.

### Local compaction

The local path adds a summarization prompt to the current history, calls the model, retries context overflow by dropping the oldest safe input, and extracts the final assistant summary in [`compact.rs`](../../refs/codex/codex-rs/core/src/compact.rs#L220).

It rebuilds replacement history from selected real user messages, the generated summary, and canonical injected context. Recent user content is bounded to avoid rebuilding another oversized context immediately.

### Remote compaction

Remote paths ask the provider to return compacted or encrypted replacement items. Codex still owns validation, event processing, installation, token recomputation, and persistence after the service response.

The mechanism distinction is future native V2 input. Under the former app-server V1 boundary, both mechanisms were represented to the client as one context-compaction item lifecycle.

### Durable replacement history

When compaction succeeds, [`session/mod.rs`](../../refs/codex/codex-rs/core/src/session/mod.rs#L3022) replaces live history, advances the compaction window, persists a `Compacted` rollout item containing the exact replacement history, records a full world-state baseline, and recomputes usage.

Persisting the exact replacement is critical. A summary string alone cannot reconstruct provider-specific items, canonical context, or the precise model-visible continuation.

### Reconstruction

[`session/rollout_reconstruction.rs`](../../refs/codex/codex-rs/core/src/session/rollout_reconstruction.rs#L112) locates the newest compaction checkpoint and reconstructs history by installing its replacement followed by the later rollout suffix. It also restores or replays the associated state needed after that checkpoint.

ADR 0001 therefore treated manual compact success, resume, and fork as a single behavioral chain in acceptance tests.

### App-server projection

Manual compact returns promptly and emits a `contextCompaction` item through started and completed notifications, as documented in [`app-server/README.md`](../../refs/codex/codex-rs/app-server/README.md#L673). Automatic compaction uses the same item type; legacy compacted notification behavior is deprecated in [the item reference](../../refs/codex/codex-rs/app-server/README.md#L1384).

The former app-server GUI did not need to parse the summary or replacement history to present correct status. It did need to retain the visible transcript and communicate that the model-visible context was compacted.

## Subagent architecture in Codex

Codex has stable collaboration tools and an under-development multi-agent V2. Both create or operate on agent sessions, not isolated provider calls. The dedicated [historical subagent architecture](../architecture/subagents.md) defines the former ADR 0001 UI contract and supplies requirements evidence for native V2 Phase 8.

### Feature selection

`Feature::Collab` uses key `multi_agent`, is stable, and is enabled by default. `Feature::MultiAgentV2` uses `multi_agent_v2`, is under development, and is disabled by default in [`features/src/lib.rs`](../../refs/codex/codex-rs/features/src/lib.rs#L1033).

Configuration selects V2 when enabled, otherwise stable V1, otherwise disabled. The former client would not have enabled V2 merely to obtain richer UI events.

### Stable V1 tools

When stable collaboration is active, the model receives tools for spawning an agent, sending input, resuming, waiting, and closing. Tool planning is assembled in [`tools/spec_plan.rs`](../../refs/codex/codex-rs/core/src/tools/spec_plan.rs#L790).

The corresponding app-server lifecycle is primarily exposed as `CollabAgentToolCall` items. Those items contain sender and receiver thread identifiers, prompt and model metadata when available, status, and agent-state summaries in [`protocol/v2/item.rs`](../../refs/codex/codex-rs/app-server-protocol/src/protocol/v2/item.rs#L335).

### Multi-agent V2 tools

V2 introduces spawn, queue-only message, follow-up that wakes an idle agent, wait, interrupt, and list operations. Spawn supports no history, full history, or the last N turns; the implementation is in [`multi_agents_v2/spawn.rs`](../../refs/codex/codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs#L40).

V2 activity emits `SubAgentActivity` items for started, interacted, and interrupted behavior. These types existed as optional forward-compatible information for the former app-server V1 design.

### Agent control and registry

The core shares an agent control plane and registry across the agent tree. The registry tracks identities, metadata, depth, and reservations; spawn establishes a new or forked thread with shared runtime services. Capacity reservation is performed before spawning and rolled back on failure.

This structure prevents several naive-subagent bugs:

- exceeding total identity or active-turn limits under concurrent spawn;
- losing the parent relationship;
- delivering completion to the wrong ancestor;
- treating an idle child as destroyed;
- creating a child without a resumable session;
- racing child creation against shutdown.

### Mailboxes and follow-up

V2 distinguishes queueing a message from starting a follow-up turn. Each child has a mailbox and runtime state, allowing communication to arrive without corrupting an active provider request.

Stable Codex multi-agent V1 exposes a different model-visible tool surface, so the former app-server GUI could not promise V2 messaging controls. The current native V2 lesson remains: child communication is stateful and ordered, not an arbitrary task-channel send.

### Completion and persistence

Child final results are delivered to the direct parent, and spawn edges are persisted so the tree can be restored. App-server listens for newly spawned threads on initialized connections and attaches event listeners in [`app-server/src/lib.rs`](../../refs/codex/codex-rs/app-server/src/lib.rs#L1090).

The former client could therefore display child activity and transcripts without starting a second app-server connection per agent. It still had to key every item to the correct thread and avoid assuming parent and child turns completed in a fixed order.

### Shared workspace

Child sessions inherit the workspace and execution environment configured by the parent unless explicitly overridden by supported runtime behavior. Multiple agents can therefore edit the same files concurrently.

A future native V2 GUI should make concurrent child activity visible but cannot guarantee conflict-free edits. Agent instructions, approval policy, scheduling, and runtime limits remain necessary controls.

## Tool execution, sandbox, and filesystem state

Codex core owns tool definitions, command execution, file operations, sandbox selection, network policy, and the continuation from tool results back to the model. App-server exposes structured lifecycle and approval requests to the client.

Under ADR 0001, Pho Code selected policies through documented request fields and could not implement its own shell runner without splitting sandbox and persistence ownership. ADR 0002 changes the owner: the native tool runtime and approval policy now own the V1 shell.

The app-server runtime may emit file-change items after applying or proposing modifications. The former GUI would render the supplied structured state and, later, diffs or file references without considering the display a second source of filesystem truth.

## Error and cancellation semantics

The app-server boundary has multiple failure layers:

- process discovery or spawn failure;
- initialization or compatibility failure;
- request-level protocol error;
- runtime overload;
- account or service failure;
- turn failure;
- tool or approval denial;
- compaction failure;
- child-agent failure;
- transport EOF or child exit.

The source distinctions remain useful to current native domain errors even if the initial UI groups them into a smaller number of recovery views.

Under app-server, turn interruption was a runtime request rather than proof that every child process or tool had stopped; the final turn notification established authoritative state, and process termination could leave a persisted thread requiring inspection. Current native V1 preserves the general lesson but establishes termination and recovery through its own backend, tool, and journal states.

## Why not link the Rust workspace

The `codex-app-server-client` crate is an in-process façade used by Codex surfaces. Its [`Cargo.toml`](../../refs/codex/codex-rs/app-server-client/Cargo.toml#L15) directly depends on app-server, core, exec server, configuration, feedback, protocol, UDS, WebSocket, and other internal crates.

`codex-core` itself spans authentication, agents, sandboxing, state, tools, MCP, skills, plugins, networking, and rollout persistence in [`core/Cargo.toml`](../../refs/codex/codex-rs/core/Cargo.toml#L18). Workspace crates use version `0.0.0` in [`codex-rs/Cargo.toml`](../../refs/codex/codex-rs/Cargo.toml#L131), indicating an internal release relationship rather than a small independently versioned SDK boundary.

Linking those crates would make Pho Code's compile graph and source compatibility depend on Codex internals. ADR 0001 therefore preferred the external binary plus a narrow protocol DTO layer. ADR 0002 keeps the no-linking conclusion but independently implements the smaller required behavior instead of launching that binary.

## Original app-server client requirements derived from the source

> The requirements in this section belong to the superseded ADR 0001 boundary. They remain a checklist for any future app-server compatibility mode, not current V1 implementation work.

### Required

- Spawn and supervise app-server over stdio.
- Keep stdout framing and stderr diagnostics separate.
- Complete initialize exactly once per connection.
- Support managed ChatGPT account read, browser login, device login, cancellation, and logout as needed by the UI.
- Correlate client requests and server-initiated approval requests.
- Model threads, turns, and items explicitly.
- Preserve partial versus completed item state.
- Support start, resume, fork, steer, interrupt, and manual compact operations used by product workflows.
- Render stable collaboration tool calls and keep child threads independent.
- Decode unknown notifications without terminating the read loop.
- Bound queues and diagnostics.
- Detect version incompatibility before starting user work.
- Reconstruct from the runtime after restart.

### Explicitly outside V1

- Reading or managing Codex token storage.
- Injecting ChatGPT tokens.
- Direct Responses calls.
- Linking internal Codex crates.
- WebSocket transport.
- A second command runner or sandbox.
- A duplicate conversation database.
- Enabling multi-agent V2 as a product requirement.
- Reimplementing compaction or agent scheduling.

## Risks exposed by the Codex study

### Protocol drift

App-server evolves with Codex, and generated schemas are version-specific. Mitigation requires a supported-version policy, fixtures from the supported binary, tolerant notification routing, and explicit upgrade review.

### Sidecar distribution

A small client still needs a runtime. Requiring user installation is simplest for development; bundling affects artifact size, licensing, signing, updates, and platform support. That remains a packaging decision, not an excuse to blur the process boundary.

### Approval deadlocks

A client that only sends requests and consumes notifications will miss server requests and leave turns waiting. Approval handling belongs in the first vertical slice.

### Projection divergence

If the UI treats deltas as durable or stores an independent transcript, reconnect and completion events can produce duplicated or contradictory state. The normalized reducer and runtime reconstruction path are correctness requirements.

### Experimental-feature leakage

Protocol V2 contains fields and item variants associated with under-development features. Any future app-server mode must separate decoding capability from product dependency rather than adopting experimental behavior accidentally.

### Shared-workspace subagents

Multiple children can operate on the same files. Runtime capacity limits reduce resource pressure but do not prevent logical edit conflicts. UI visibility, conservative instructions, and review remain necessary.

## Historical app-server and future-design questions this study does not answer

- Which exact Codex binary versions a future app-server compatibility mode would support.
- Whether the binary will be bundled, discovered, or installed separately.
- Which model, effort, sandbox, and approval defaults produce the intended product experience.
- How the app should behave when its window closes during an active turn.
- Which reasoning details should be displayed or retained.
- Whether stable V1 collaboration supplies every desired manual child-control interaction.
- When, if ever, multi-agent V2 is stable enough to adopt.
- Whether a future native harness has a supported direct authentication and model-transport contract.

These require implementation evidence, product decisions, or upstream guarantees beyond a source audit.

## Source map

| Topic | Primary source |
| --- | --- |
| App-server purpose and transport | [`codex-rs/app-server/README.md`](../../refs/codex/codex-rs/app-server/README.md#L1) |
| Request and notification mapping | [`app-server-protocol/src/protocol/common.rs`](../../refs/codex/codex-rs/app-server-protocol/src/protocol/common.rs#L460) |
| Account operations | [`app-server-protocol/src/protocol/v2/account.rs`](../../refs/codex/codex-rs/app-server-protocol/src/protocol/v2/account.rs#L68) |
| Thread operations | [`app-server-protocol/src/protocol/v2/thread.rs`](../../refs/codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L1) |
| Turn operations | [`app-server-protocol/src/protocol/v2/turn.rs`](../../refs/codex/codex-rs/app-server-protocol/src/protocol/v2/turn.rs#L1) |
| Item types | [`app-server-protocol/src/protocol/v2/item.rs`](../../refs/codex/codex-rs/app-server-protocol/src/protocol/v2/item.rs#L1) |
| Event-to-item mapping | [`app-server-protocol/src/protocol/event_mapping.rs`](../../refs/codex/codex-rs/app-server-protocol/src/protocol/event_mapping.rs#L1) |
| Context-window accounting | [`core/src/session/context_window.rs`](../../refs/codex/codex-rs/core/src/session/context_window.rs#L1) |
| Compaction trigger selection | [`core/src/session/turn.rs`](../../refs/codex/codex-rs/core/src/session/turn.rs#L280) |
| Manual compact selection | [`core/src/tasks/compact.rs`](../../refs/codex/codex-rs/core/src/tasks/compact.rs#L27) |
| Local compaction | [`core/src/compact.rs`](../../refs/codex/codex-rs/core/src/compact.rs#L91) |
| Remote V2 compaction | [`core/src/compact_remote_v2.rs`](../../refs/codex/codex-rs/core/src/compact_remote_v2.rs#L52) |
| Replacement persistence | [`core/src/session/mod.rs`](../../refs/codex/codex-rs/core/src/session/mod.rs#L3022) |
| Rollout reconstruction | [`core/src/session/rollout_reconstruction.rs`](../../refs/codex/codex-rs/core/src/session/rollout_reconstruction.rs#L112) |
| Multi-agent feature stages | [`features/src/lib.rs`](../../refs/codex/codex-rs/features/src/lib.rs#L1033) |
| Collaboration tool planning | [`core/src/tools/spec_plan.rs`](../../refs/codex/codex-rs/core/src/tools/spec_plan.rs#L790) |
| Multi-agent V2 spawn | [`core/src/tools/handlers/multi_agents_v2/spawn.rs`](../../refs/codex/codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs#L40) |
| Agent registry | [`core/src/agent/registry.rs`](../../refs/codex/codex-rs/core/src/agent/registry.rs#L16) |
| Agent control | [`core/src/agent/control.rs`](../../refs/codex/codex-rs/core/src/agent/control.rs#L88) |
| New child-thread subscription | [`app-server/src/lib.rs`](../../refs/codex/codex-rs/app-server/src/lib.rs#L1090) |
| In-process client dependencies | [`app-server-client/Cargo.toml`](../../refs/codex/codex-rs/app-server-client/Cargo.toml#L15) |

## Study conclusion

Codex contains the runtime Pho Code has now chosen to rebuild in a deliberately smaller V1: managed subscription authentication, a tool-capable model loop, durable thread state, approval mediation, compaction checkpoints, and stateful child agents. App-server remains strong evidence and a plausible future compatibility mode, but it is not the current runtime boundary.

ADR 0002 accepts the risk that Pho Code could become an incomplete second runtime and controls it by shrinking V1 to one backend, one root agent, sequential tools, explicit approvals, append-only sessions, and no compaction or subagents. This study should be used to challenge incomplete native behavior and to design V2 requirements, not to reintroduce app-server ownership silently.
