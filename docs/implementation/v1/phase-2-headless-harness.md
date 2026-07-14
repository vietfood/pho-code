# Phase 2: Deterministic headless harness

- Status: Blocked until Phase 1B passes
- Depends on: [Phase 1B pass](phase-1b-deepseek-api-qualification.md#hard-gate)
- Produces: Provider-neutral tool-continuation loop proven with `ScriptedBackend` through the shared command/runtime boundary
- Next: [Phase 3](phase-3-live-backend.md)

## Required reading

1. [System component and state boundaries](../../architecture/native-harness-system.md)
2. [DeepSeek normalized events](../../architecture/deepseek-api-backend.md#normalized-events)
3. [Presentation-adapter boundary](../../architecture/native-harness-system.md#presentation-adapters-and-application-lifecycle)
4. [Contributor rules](../../../AGENTS.md)

## Outcome

The owned harness can complete text and tool-continuation turns deterministically without GPUI, a live account, or workspace mutation. This phase extends Phase 1B's no-tool vertical slice rather than replacing it. It proves orchestration and command projection; it does not re-test DeepSeek wire behavior qualified in Phase 1B.

## Work

### Canonical domain model

- Implement local session, turn, assistant phase, item, backend request, tool call, approval, and artifact identities.
- Keep provider completion/call IDs and provider-required reasoning replay separate from local IDs.
- Implement exhaustive turn, item, tool, approval, completion, cancellation, interruption, and uncertainty states from [the system architecture](../../architecture/native-harness-system.md#state-model).
- Ensure durable-domain serialization contains no credentials or live handles.

### Context builder

- Convert canonical completed phases into ordered backend input.
- Preserve assistant text/reasoning/call grouping, exact call/result pairs, and required replay metadata.
- Reject missing pairs, duplicate terminals, incomplete arguments, and model switches.
- Advertise only the fixed schema snapshots supplied by the tool runtime and enabled for the scenario.
- Return an explicit context-fit result; never truncate history.

### One-turn loop

- Implement the turn and tool continuation flow defined by [canonical event flow](../../architecture/native-harness-system.md#canonical-event-flow).
- Configure and enforce maximum model continuations per turn, tool calls per turn, tool-argument bytes, model-visible tool-result bytes, wall-clock duration, pending approvals, and queued canonical/presentation events.
- Process tool calls sequentially in provider order.
- Validate complete strict JSON before dispatch.
- Ask an injected approval policy before the fake mutating tool.
- Execute each accepted call at most once.
- Emit canonical events through the same reducer GPUI will later use.
- Give every started turn and tool exactly one terminal result under cancellation races.

### Command-mode scenarios

- Route scripted turns through the same command parser, application actions, reducer, coordinator, loop, and terminal renderer used by live `pho chat`; tests may inject the backend but not bypass the application boundary.
- Render assistant reasoning, text, tool calls/results, approval state, usage, truncation, and terminal outcomes from canonical events.
- Exercise `pho chat`, explicit stdin mode, SIGINT, broken pipe, non-TTY approval, denial, renderer backpressure, and stable process results with deterministic scripts.
- Keep developer backend injection unavailable from the ordinary release command surface.

### Scripted scenarios

Cover text success, provider-returned reasoning, read-only tool continuation, required reasoning replay, mutating approval/denial, multiple sequential calls, malformed/incomplete arguments, context-length stop, failure before and after deltas, cancellation races, unknown optional event, incompatible required event, duplicate/late events, and separate exhaustion of every configured continuation/tool/byte/duration/approval/queue limit.

## Non-goals

- Live DeepSeek requests beyond the already qualified Phase 1B smoke path.
- Real filesystem/process tools.
- Durable JSONL or crash recovery.
- GPUI views.

## Gate

Phase 2 passes when the scripted scenarios produce deterministic canonical traces through both direct test observation and command rendering, provider DTOs plus terminal/GPUI types are absent from the loop, assistant-phase grouping survives every continuation, no partial/cancelled/incomplete call executes, stale approvals cannot mutate an active turn, each limit stops new requests/effects with a visible terminal reason, broken presentation channels cancel safely, and every operation reaches exactly one terminal state.
