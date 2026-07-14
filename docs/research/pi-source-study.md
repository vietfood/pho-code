# Pi source study

- Status: Source audit complete; original app-server recommendation superseded by ADR 0002
- Audited revision: `0e6909f050eeb15e8f6c05185511f3788357ddb3`
- Audit date: 2026-07-14
- Scope: Pi's Codex subscription integration, model transport, agent loop, session model, compaction, subagent posture, and lessons for Pho Code
- Primary conclusion at audit time: Pi is a useful reference for restraint and event-driven structure, but it is not a reusable Codex agent runtime

> **Current architecture note:** [ADR 0002](../decisions/0002-native-agent-harness.md) accepts the native-harness responsibilities that this study originally used to argue against a V1 reimplementation, while removing V1 compaction and subagents. Pi is now direct behavioral evidence for OAuth, Responses transport, the loop, tools, and sessions; its client identity and backend behavior remain unverified for Pho Code until Phase 1 qualification.

## Purpose

This study records what the checked-out Pi source actually does, which parts are useful to Pho Code, and which assumptions would be unsafe to carry into the product. It is intentionally separate from the Codex study because the projects provide different evidence: Pi demonstrates a compact direct coding-agent harness, while Codex demonstrates a broader runtime whose mechanisms remain requirements evidence.

The study distinguishes direct source observations from architectural inferences. It does not treat the availability of Pi's OAuth and backend code as proof that another product may reuse its client identity or transport contract unchanged.

## Executive findings

1. Pi does not launch, embed, or connect to the Codex agent runtime. It performs ChatGPT OAuth and calls the Codex Responses backend directly.
2. Pi owns the resulting model request, stream parsing, agent loop, tool execution, session storage, and compaction behavior.
3. Pi deliberately excludes core subagents. Its repository contains an example extension that starts independent Pi subprocesses, not a persistent in-process agent tree comparable to Codex.
4. Pi's useful lessons are mostly structural: explicit event streams, transformable model context, a small default tool surface, append-only sessions, branch-aware compaction, extensions at the product edge, and visible omission of nonessential features.
5. Copying Pi's Codex connection would not provide Codex compaction, approvals, persistence, or subagents. Pho Code would inherit the most fragile integration surface while also taking responsibility for the missing runtime.
6. “Minimal” in Pi is primarily a product philosophy and boundary choice. The production coding agent still contains substantial session, compaction, extension, and UI machinery.

## Repository roles

The relevant Pi code is divided across three packages:

| Package | Responsibility relevant to this study |
| --- | --- |
| `packages/ai` | Provider-neutral model types, provider adapters, OAuth implementations, Codex Responses request construction, and stream parsing. |
| `packages/agent` | Stateful agent loop, event model, tool execution, message transformation, and newer reusable harness/session utilities. |
| `packages/coding-agent` | The terminal coding product: authentication storage, tools, sessions, branching, compaction, extensions, modes, and UI integration. |

This division is instructive but should not be copied mechanically. Pho Code has only one runtime in V1, so separate provider and generic-agent abstractions would add indirection without providing product value.

## Product philosophy and deliberate scope

Pi describes itself as a minimal terminal coding harness that is adapted through extensions, skills, prompt templates, themes, and packages in its [coding-agent README](../../refs/pi/packages/coding-agent/README.md#L13). The next paragraph says the built-in product skips features such as subagents and plan mode in favor of optional third-party additions.

That omission is part of the architecture. Pi's small default surface is not evidence that stateful subagents are simple; it is evidence that Pi avoids owning their semantics in core. Pho Code makes the same V1 omission and reserves native subagents for a separately designed V2 phase.

Pi exposes interactive, print/JSON, RPC, and SDK modes in the same README. This reflects a flexible harness boundary, but Pho Code's initial boundary is narrower: one native desktop application with one concrete ChatGPT Codex backend.

### Applicable philosophy

- Keep the default surface small and coherent.
- Make omitted features explicit rather than leaving half-implemented hooks.
- Keep model-visible messages distinct from UI-only application state.
- Use events to drive presentation rather than letting views control the execution loop.
- Add extension points only where an actual workflow needs them.
- Prefer a few capable tools over a broad, inconsistent built-in catalog.

### Philosophy that does not transfer directly

- Pi's multi-provider architecture is unnecessary when Pho Code supports only Codex.
- Pi's user-extensible TypeScript surface does not imply Pho Code needs a plugin system in V1.
- Pi's subprocess subagent example does not define the native V2 agent tree Pho Code will eventually need.
- Pi's exact OAuth identity, model catalog, headers, and backend assumptions cannot be adopted as Pho Code's contract.
- Pi's terminal interaction patterns should not dictate GPUI state ownership or desktop navigation.

## ChatGPT subscription authentication

Pi's provider documentation states that ChatGPT Plus/Pro can be selected through `/login` and that credentials are refreshed automatically in [`providers.md`](../../refs/pi/packages/coding-agent/docs/providers.md#L14). The same document describes this subscription use as OpenAI-endorsed. That is evidence about Pi's integration; it does not establish that another product can reuse Pi's exact OAuth identity or client headers.

### OAuth constants and modes

The OpenAI Codex OAuth implementation defines a client ID, authorization endpoint, token endpoint, local callback `http://localhost:1455/auth/callback`, device-code endpoints, and the `openid profile email offline_access` scope in [`openai-codex.ts`](../../refs/pi/packages/ai/src/utils/oauth/openai-codex.ts#L33).

It implements two user flows:

1. Browser authorization with PKCE and a localhost callback, with manual code entry as a fallback.
2. Device authorization that polls until the user completes verification or the flow expires.

The PKCE authorization request includes Pi's originator identity in [`openai-codex.ts`](../../refs/pi/packages/ai/src/utils/oauth/openai-codex.ts#L299). The browser callback path validates state and exchanges the authorization code; the implementation also supports pasting a redirect URL or code when the callback cannot complete automatically.

### Token and account handling

After exchange, Pi decodes token claims to obtain the ChatGPT account identifier in [`openai-codex.ts`](../../refs/pi/packages/ai/src/utils/oauth/openai-codex.ts#L402). It retains access token, refresh token, expiry time, and account ID, and its provider adapter exposes the current access token through the same credential interface used by other providers.

The coding agent stores credentials in `~/.pi/agent/auth.json`. It creates the file with restrictive permissions and its parent directory with a restrictive mode in [`auth-storage.ts`](../../refs/pi/packages/coding-agent/src/core/auth-storage.ts#L53). It uses an interprocess file lock during refresh, rereads the credential state under that lock, and preserves usable credentials when refresh fails in [the refresh path](../../refs/pi/packages/coding-agent/src/core/auth-storage.ts#L415).

Those storage details are sound lessons for any future native authentication implementation:

- serialize refresh across processes;
- reread state after acquiring the lock because another process may have refreshed first;
- update access and refresh tokens atomically from the caller's perspective;
- preserve prior credentials when a failed refresh has not proven them invalid;
- keep file permissions restrictive and never print token content.

They now apply directly to ADR 0002's native authentication boundary, with two deliberate changes: Pho Code stores its versioned credential bundle in macOS Keychain rather than a plaintext JSON file, and V1 prevents cross-process refresh races with an OS-released single-instance application lock.

## Direct Codex Responses transport

Pi's Codex provider points to `https://chatgpt.com/backend-api` and identifies OAuth as the authentication mode in [`providers/openai-codex.ts`](../../refs/pi/packages/ai/src/providers/openai-codex.ts#L7). The Responses implementation appends `/codex/responses` in [`openai-codex-responses.ts`](../../refs/pi/packages/ai/src/api/openai-codex-responses.ts#L572).

This is a direct model-service integration. No Codex thread, turn, item, approval, compaction, or child-agent protocol sits between Pi and the response stream.

### Request construction

Pi constructs each Responses request in [`buildRequestBody`](../../refs/pi/packages/ai/src/api/openai-codex-responses.ts#L481). The request includes:

- model and system instructions;
- the model-visible conversation input;
- `store: false` and `stream: true`;
- tool definitions and parallel-tool configuration;
- reasoning effort and encrypted reasoning content settings;
- text verbosity when applicable;
- a prompt-cache key;
- optional response continuation information for supported transports.

Because Pi supplies the model-visible history, Pi must decide how custom messages are filtered, how tool calls and results stay valid, and how compaction changes future requests. The backend request alone does not make those decisions.

### Headers and account selection

The request code supplies bearer authorization, the ChatGPT account identifier, a Pi originator, a user agent, session metadata, and transport-specific beta headers in [`openai-codex-responses.ts`](../../refs/pi/packages/ai/src/api/openai-codex-responses.ts#L1494). Pi derives the account identifier from the OAuth token when necessary.

Pho Code must not reproduce Pi's identity. ADR 0002 instead requires truthful Pho Code metadata and treats rejection of that identity as a Phase 1 stop condition.

### Streaming transports

Pi implements SSE response streaming and a WebSocket session mode in [`openai-codex-responses.ts`](../../refs/pi/packages/ai/src/api/openai-codex-responses.ts#L223). The SSE path sends the request, decodes optional compressed data, parses event frames, and maps provider events into Pi's assistant-message stream. The WebSocket path supports session reuse and `response.create` continuation, with fallback behavior when the session fails.

This code is useful evidence for the complexity hidden behind the phrase “connect to Codex.” Pho Code's concrete backend must handle partial text and provider-exposed reasoning, tool-call argument deltas, usage, terminal states, aborts, malformed events, delivery ambiguity, and provider-specific replay metadata.

### Model catalog

Pi carries a generated Codex model catalog in [`openai-codex.models.ts`](../../refs/pi/packages/ai/src/providers/openai-codex.models.ts#L1). A generated catalog is simple at runtime but can drift with upstream model availability and account eligibility.

Pho Code uses Pi's catalog only to form a tiny candidate probe set. A model joins the V1 allowlist only after the live compatibility gate succeeds for the selected account and request profile.

## Agent loop

Pi's reusable agent package separates stateful orchestration in [`agent.ts`](../../refs/pi/packages/agent/src/agent.ts#L1) from the lower-level streaming and tool loop in [`agent-loop.ts`](../../refs/pi/packages/agent/src/agent-loop.ts#L1). The package README documents the primary sequence as agent start, turn start, message events, tool events, turn end, and agent end in [`packages/agent/README.md`](../../refs/pi/packages/agent/README.md#L39).

### Message boundary

Pi distinguishes `AgentMessage` from the smaller set of messages accepted by an LLM. A `transformContext` step may prune or inject agent context, while `convertToLlm` filters and converts application-specific messages before a model request. This boundary is described in [`packages/agent/README.md`](../../refs/pi/packages/agent/README.md#L20).

The corresponding Pho Code lesson is to keep one narrow backend boundary without recreating Pi's multi-provider registry, keep canonical harness items separate from view models, and make every model-visible transformation an explicit runtime concern.

### Loop structure

At a high level, the loop:

1. accepts new user or continuation messages;
2. emits lifecycle and message events;
3. streams an assistant response;
4. identifies requested tools;
5. validates and executes tools;
6. appends tool results in source order;
7. continues the model loop while tool results or queued input require it;
8. emits final turn and agent state.

Steering and follow-up queues allow input to be injected at defined boundaries instead of racing the provider stream. Tool execution can be sequential or parallel, but final tool-result messages retain assistant source order. These are valuable consistency rules for a native harness.

Pho Code owns this loop in V1. The backend emits normalized provider events, the loop establishes tool continuation, and the reducer projects lifecycle state without inferring execution from display order.

### Event-driven presentation lesson

Pi's event model is a strong reference for GUI integration because it separates execution from rendering. Partial assistant messages and tool progress are transient; completed messages and tool results are durable parts of state. Pho Code adopts that distinction in its backend event normalization, headless loop, journal, and reducer.

The important design property is a deterministic reducer, not the exact Pi event names. Pho Code keys state by session, turn, item, tool call, and approval identities and treats authoritative completion events as final.

## Session model and branching

Pi stores coding-agent sessions as JSONL. Each entry has a type and tree linkage through `id` and `parentId`, enabling branches within one file; the format and migrations are described in [`session-format.md`](../../refs/pi/packages/coding-agent/docs/session-format.md#L1).

The append-oriented tree provides several useful properties:

- prior history is retained instead of destructively rewritten;
- branch navigation is an explicit parent change;
- compaction and branch summaries are additional entries;
- format versions can be migrated on load;
- the current model context can be rebuilt from a selected path.

This is now a direct native-harness reference. Pho Code V1 owns a simpler linear append-only JSONL journal rather than Pi's branch tree, records canonical completed events and effect boundaries, and rebuilds its projection locally. Branching and native compaction entries remain V2 work.

## Pi compaction

Pi's compaction is local harness behavior implemented in [`coding-agent/src/core/compaction/compaction.ts`](../../refs/pi/packages/coding-agent/src/core/compaction/compaction.ts#L1) and documented in [`docs/compaction.md`](../../refs/pi/packages/coding-agent/docs/compaction.md#L1). Calling the Codex Responses endpoint does not automatically supply this behavior.

### Trigger and budget

The documented automatic trigger is context usage exceeding the model context window minus reserved response tokens. Pi also supports manual `/compact` with optional instructions. It keeps a configurable amount of recent context and summarizes the older span.

The implementation estimates tokens locally, chooses a boundary that preserves recent work, and avoids cutting at a tool result that would be separated from its call. Valid boundaries include user or assistant messages and supported custom execution messages.

### Split turns

If a single tool-heavy turn is larger than the retained-context target, Pi may split that turn at a valid assistant boundary. It separately summarizes prior history and the discarded prefix of the oversized turn, then combines the summaries. This avoids retaining an unbounded turn merely because the normal boundary is too far back.

The mechanism demonstrates why compaction cannot safely be implemented as “summarize the first half of the messages.” Tool relationships, turn structure, active task state, and the most recent working context constrain the cut.

### Structured summary and file state

Pi asks the model for a structured continuation summary and tracks files read or modified across earlier summaries. On repeated compaction, the prior summary and surviving span inform the next summary so relevant state is carried forward.

The summary is lossy by design. Pi retains the complete JSONL history and appends a compaction entry containing the summary, the first retained entry identifier, token count before compaction, and implementation details. Reloading derives model context from the summary plus retained suffix.

### Branch summarization

When the user leaves one branch for another, Pi can summarize the abandoned branch from the common ancestor and append that summary at the navigation point. This is distinct from context-window compaction even though both use related summary machinery.

The distinction matters for Pho Code V2: compaction preserves continuation under a token budget, whereas branch summarization transfers selected work across divergent histories. V1 implements neither and reports context exhaustion explicitly.

### Comparison with Codex compaction

Pi provides a smaller, understandable model for local summarization. Codex additionally performs provider-aware compaction, can compact during continued execution, persists exact replacement history and window identity, and reconstructs from rollout checkpoints. Both are V2 requirements evidence; neither becomes a drop-in V1 compactor.

## Subagent posture

Pi's core coding-agent README explicitly says subagents are omitted. The repository's positive example is under [`examples/extensions/subagent`](../../refs/pi/packages/coding-agent/examples/extensions/subagent/README.md#L1), where an extension launches separate Pi processes for delegated prompts.

That example can provide concurrency and result aggregation, but it does not provide the core properties required by Pho Code's accepted subagent design:

- a persistent parent-child agent tree;
- independent resumable child sessions controlled by one runtime;
- mailbox delivery and follow-up to an idle child;
- direct-parent result routing;
- shared capacity, identity, and depth limits;
- lazy restoration after restart;
- authoritative child activity in the main client protocol.

The absence is deliberate, not a defect in Pi. It supports Pho Code's decision to keep V1 single-agent. The Codex study and historical subagent design remain requirements evidence for the native V2 design rather than a current runtime contract.

## Extension model

Pi favors extensions and packages over adding every workflow to core. Extensions can add tools, commands, context transformations, and lifecycle behavior. This keeps the default experience focused while allowing experimentation outside the core release cadence.

Pho Code should adopt the discipline before adopting the mechanism. V1 should keep optional workflows out of core, but it should not create a plugin API until there are multiple real extensions whose shared needs are understood. A premature plugin surface becomes a long-lived compatibility commitment and works against the goal of a small codebase.

## What Pho Code should reuse conceptually

### Use now

- A small product surface with explicit non-goals.
- A reducer-friendly lifecycle separating partial updates from completed state.
- Clear boundaries between execution state, model-visible context, and UI-only presentation.
- Narrow tools and visible errors.
- Append-oriented durable histories with explicit effect and recovery records.
- Conservative handling of credentials, Keychain persistence, and serialized refresh.
- Browser PKCE, callback/manual fallback behavior, direct SSE normalization, full-history replay, and strict complete tool arguments, all behind the Phase 1 compatibility gate.
- Sequential tool/result continuation and a small first-party tool surface.
- Compaction cut points that respect turns and tool relationships as requirements for the V2 compactor.

### Study later for a native harness

- Device-flow ergonomics if browser PKCE and manual fallback prove insufficient.
- Steering and follow-up queues.
- JSONL session trees and migrations.
- Local structured compaction and branch summaries.
- Extension hooks after the core product demonstrates stable needs.

### Do not copy into V1

- Multi-provider registries and generic provider selection.
- Pi's OAuth client identity, originator, or backend headers.
- Pi's request profile or model catalog without source pinning and live Pho Code qualification.
- TUI-specific messages, commands, themes, or navigation abstractions.
- The subprocess subagent example as the product's agent model.
- A plugin framework without validated extensions.

## Risks exposed by the Pi study

### Misidentifying the integration boundary

Calling Pi's provider “the Codex agent” would cause Pho Code to omit the runtime work that exists above a model stream. The concrete V1 consequence would be missing or inconsistent context construction, tool continuation, approvals, sessions, and recovery; compaction and subagents must remain explicit V2 omissions rather than assumed backend features.

### Treating source access as a stable product contract

Pi's source proves how Pi authenticates and sends requests at the audited revision. It does not prove that another originator may reuse the same identifiers or that all endpoint and header behavior is stable for Pho Code. The current V1 answer is the Phase 1 truthful-identity and live-compatibility gate, with app-server retained only as a possible reassessment outcome.

### Copying abstractions without their pressure

Pi supports many providers, execution modes, interfaces, and extensions. Copying those abstractions into a Codex-only desktop app would increase the code and test surface before a second use case exists.

### Underestimating compaction

Even Pi's comparatively small compactor handles token budgeting, turn boundaries, split turns, iterative summaries, file tracking, append-only entries, and session reload. A naive summary function would lose tool relationships and working state.

### Underestimating subagents

Launching concurrent subprocesses can demonstrate delegation but does not create a recoverable agent graph. Pho Code should defer subagents until V2 specifies and tests full native parent/child identity, attribution, budgets, cancellation, approvals, and recovery.

## Questions this study does not answer

- Whether Pho Code may use any direct ChatGPT OAuth or backend contract under its own product identity.
- Whether Pi's current provider behavior works for every ChatGPT plan or managed workspace.
- How Pi's TUI interaction design should translate to GPUI.
- Whether a future Pho Code plugin system is needed.
- Whether Pi's local compaction quality matches Codex's remote or provider-aware compaction for Pho Code workloads.
- Whether the subprocess subagent example is adequate for any optional, non-persistent workflow.

Those questions require product, service-contract, UX, or behavioral evidence beyond this source audit.

## Source map

| Topic | Primary source |
| --- | --- |
| Product philosophy and omitted subagents | [`packages/coding-agent/README.md`](../../refs/pi/packages/coding-agent/README.md#L13) |
| Subscription provider documentation | [`packages/coding-agent/docs/providers.md`](../../refs/pi/packages/coding-agent/docs/providers.md#L14) |
| Codex OAuth | [`packages/ai/src/utils/oauth/openai-codex.ts`](../../refs/pi/packages/ai/src/utils/oauth/openai-codex.ts#L33) |
| Credential persistence and locking | [`packages/coding-agent/src/core/auth-storage.ts`](../../refs/pi/packages/coding-agent/src/core/auth-storage.ts#L53) |
| Codex provider declaration | [`packages/ai/src/providers/openai-codex.ts`](../../refs/pi/packages/ai/src/providers/openai-codex.ts#L7) |
| Responses request and stream | [`packages/ai/src/api/openai-codex-responses.ts`](../../refs/pi/packages/ai/src/api/openai-codex-responses.ts#L223) |
| Generated Codex models | [`packages/ai/src/providers/openai-codex.models.ts`](../../refs/pi/packages/ai/src/providers/openai-codex.models.ts#L1) |
| Agent orchestration | [`packages/agent/src/agent.ts`](../../refs/pi/packages/agent/src/agent.ts#L1) |
| Low-level agent loop | [`packages/agent/src/agent-loop.ts`](../../refs/pi/packages/agent/src/agent-loop.ts#L1) |
| Agent event and message concepts | [`packages/agent/README.md`](../../refs/pi/packages/agent/README.md#L20) |
| Session format | [`packages/coding-agent/docs/session-format.md`](../../refs/pi/packages/coding-agent/docs/session-format.md#L1) |
| Coding-agent compaction | [`packages/coding-agent/src/core/compaction/compaction.ts`](../../refs/pi/packages/coding-agent/src/core/compaction/compaction.ts#L1) |
| Compaction documentation | [`packages/coding-agent/docs/compaction.md`](../../refs/pi/packages/coding-agent/docs/compaction.md#L1) |
| Subagent example extension | [`packages/coding-agent/examples/extensions/subagent/README.md`](../../refs/pi/packages/coding-agent/examples/extensions/subagent/README.md#L1) |

## Study conclusion

Pi should influence both how Pho Code stays small and how the first backend is studied, without becoming an identity or compatibility contract. Its strongest V1 lessons are explicit scope, serialized OAuth refresh, direct Responses normalization, event-driven state, strict tool continuation, append-oriented sessions, and deliberate omission of subagents. Its compaction and extension machinery remain V2 evidence.

For V1, the correct use of Pi is behavioral and comparative: independently implement the required mechanisms in Rust, preserve Pho Code's truthful product identity, qualify live assumptions, and stop rather than copying an unsafe or unsupported integration detail.
