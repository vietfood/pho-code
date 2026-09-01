# Subagent orchestration implementation plan

## Status and use

Status: **In implementation; planning complete; implementation not started.**

This is the read-mostly implementation contract for the promoted
[subagent product](./product.md). Dated work, measurements, failures,
corrections, owner feedback, and verification belong in [`logs/`](./logs/README.md).

The plan deliberately promotes only session delegation from future roadmap
Phase E. Multi-agent worktrees, branch integration, conflict reconciliation,
and remote mutation stay in the roadmap. The implementation must not advance
blocked V5 intelligence milestones or pending V4 process extraction under this
feature's name.

The implementation order is:

1. characterize the Pho/Pi session contract and external native-event seams;
2. prove a read-only Pho child in a fresh Pi-backed session;
3. add continuation, background control, the complete transparent UI, and
   truthful Codex/Claude native-activity projection;
4. finish lifecycle, persistence, and recovery behavior;
5. add a narrowly serialized Pi workspace-writer path;
6. harden, evaluate, package, and obtain owner acceptance.

Milestones are delivery order, not permission to weaken the final product
contract. Partial builds must state the exact Pho model × access matrix and
external native-projection level they actually verify.

## Global acceptance rules

Every slice follows these rules:

- Keep `renderer -> protocol <- shell adapter -> application -> runtime -> Pi
  SDK` dependency direction for Pho-owned orchestration. External native
  activity continues through the existing backend-host adapters.
- Use Pi's public session/runtime APIs for Pho children. Do not reproduce an
  agent loop or launch a global `pi` CLI.
- Make every child a separately owned session with a separately routed abort
  signal, transcript, permission state, interaction queue, and Pi session key.
- Use immutable ids for commands and events. Friendly names are display data.
- Validate workspace, parent session, parent run, target, access, and capacity
  in the privileged boundary immediately before every mutation.
- Accept only current source-owned target ids. Never accept arbitrary provider,
  executable, package, server, or agent-profile values.
- Keep parent transcript, session grants, pending interactions, hidden reasoning,
  and prepared attachments out of fresh child context.
- Bind child event and permission handlers before prompt admission. Rebind them
  after any runtime session replacement.
- Never advertise read-only, tool visibility, usage, cost, steering, native
  collaboration suppression, or resume behavior that the selected backend does
  not prove.
- Never fall back to another backend/model or broader access.
- Keep child output bounded for model context and untrusted for rendering.
- Keep the complete child transcript in its authoritative backend store.
- Preserve existing global run/controller limits; introduce no independent
  unbounded pool, per-child polling loop, or Settings slider.
- Use OS Trash for approved removal of verified Pho/Pi-owned artifacts; never
  use permanent deletion.
- Abort all child controllers concurrently during shutdown under one aggregate
  deadline; do not multiply timeouts per child.
- Fail closed on corrupt relationship metadata, mismatched parentage, stale
  revisions, unsupported access, or ambiguous backend ownership.
- No nested Pho delegation in the first release. Child session bindings omit the
  model-facing orchestration tool.
- Record exact verification. Unit coverage is insufficient for runtime, IPC,
  renderer, native external-activity projection, or packaged claims.

## Current baseline and compatibility constraints

### Current application behavior

- V2 Milestone 3 owns independent session controllers, composite identity,
  per-session interaction queues, background attention, archive/Trash,
  concurrent shutdown, four active runs, and eight resident controllers.
- The product term **Pho backend** means the app-owned Pi wrapper; source
  protocol still identifies it as `pi`. Only this backend receives Pho-owned
  orchestration.
- Pho Code routes direct Codex app-server and Claude ACP chats through the
  current production host seam. Those external backends retain their
  configuration, authentication, native tools, persistence, agent loops, and
  native subagent ownership.
- The Codex adapter already maps `collabAgentToolCall` and `subAgentActivity`
  into a bounded generic `subagent` tool row. Stable ACP may report activity
  through its own event surface. Neither backend receives `pho_subagent`.
- Pi workspace context, baked resources, permission routing, compaction, and
  session JSONL already have accepted ownership. A child must reuse them without
  enabling ambient resource discovery.
- The right sidebar already supports floating feature tiles, at most two
  visible surfaces, a parked tray, persistence, and chat-header launchers.
- No Pho subagent relationship registry, child target catalog, model tool,
  transcript card, or Agents surface exists.

### Installed Pi API facts to characterize, not reimplement

The pinned Pi SDK exposes session creation/opening, `parentSession` metadata,
prompt/steer/follow-up/abort, active-tool selection, event subscription,
compaction, and disposal. Milestone 0 must pin the exact behavior of the
installed version before production code relies on it, especially:

- whether `parentSession` records provenance without copying transcript context;
- session-directory and JSONL identity for a child;
- resource-loader behavior with a fresh session and the current workspace;
- tool activation before the first prompt and after session replacement;
- abort settlement while a parent tool call is waiting;
- compaction and title behavior for sessions hidden from the ordinary chat list;
- safe disposal/eviction with a settled or interrupted child.

The SDK's example subagent extension is evidence for public APIs, not an
architecture to copy. Pho embeds the SDK and must not depend on a separate CLI
process or ambient agent-definition directories.

### External native-activity facts to characterize

Pho does not start or control Codex/Claude children. Before enriching their
presentation beyond today's generic activity row, prove against each actual
adapter API:

- whether a native event represents one activity, one stable child, or an
  aggregate;
- stable child/thread ids, names, prompts, recipients, status, usage, and
  transcript/open links actually exposed;
- official steer/stop/open operations, their cancellation and error semantics,
  and whether they target the child rather than the parent;
- ordering, replay, restart, duplicate-id, and process-exit behavior;
- fields that may contain secrets, unbounded output, or backend-internal data.

Projection stays at the highest proven level: disclosure only, bounded activity,
stable read-only metadata, or a specific official control. Compatibility is
behavioral; do not infer controls from a CLI version, prompt text, receiver id,
or generic tool kind.

## Planned architecture

### Control flow

| Step | Owner | Planned action |
| --- | --- | --- |
| 1. Request | Pho/Pi baked extension | Validate the strict `pho_subagent` action payload and caller identity. |
| 2. Coordinate | Application `SubagentCoordinator` | Resolve parent/run/workspace, target, access ceiling, capacity, and relationship id. |
| 3. Create | Runtime child-session factory | Create a fresh Pi-backed session through existing public services. |
| 4. Persist | Application relationship store | Atomically bind child id to the exact Pi session key and parent delegation. |
| 5. Bind | Runtime/application controller registry | Attach events, permissions, transcript projection, abort, and UI state before prompting. |
| 6. Run | Pi SDK or backend adapter | Execute the exact delegation prompt in the child-owned loop. |
| 7. Project | Application/protocol | Coalesce live state, preserve authoritative snapshots, and route child attention. |
| 8. Observe/settle | Coordinator/tool bridge | Return an immediate handle, then bounded Wait state/result without polling. |

### Layer ownership

| Layer | New responsibility | Forbidden responsibility |
| --- | --- | --- |
| Shared protocol | JSON-safe child/target/snapshot/command/event values and bounds. | Pi, Electron, backend, filesystem, or stream objects. |
| Application | Parent-child relationships, access ceiling, admission, lifecycle, orchestration commands, result bounding. | Provider calls, Electron APIs, or rendering. |
| Runtime | Pi child construction, resource/tool binding, Pho model targets, transcript/usage projection, disposal. | UI state or Electron IPC. |
| External backend adapters | Project only proven Codex/Claude native subagent activity/metadata/controls through existing backend events. | Pho child creation, relationship policy, or invented native control. |
| Electron shell | Narrow bridge, application-data path adapter, recoverable Trash handoff, notification/focus adapter. | Raw `ipcRenderer`, session objects, process handles, or arbitrary paths. |
| UI | Transcript activity card, Agents tile, inspector, exact owner controls, accessible state. | Direct filesystem/backend access or authority decisions. |

### Why coordination belongs in the application layer

The parent and child both use the Pho backend, but their relationship spans
separate Pi sessions, the application session registry, lifecycle metadata,
global admission, attention, and renderer projection. The application layer
already coordinates those use cases without importing Electron. It owns the
relationship and admission state; runtime owns how the fresh Pi session is
created and run.

Do not add a Pi extension that shells out to Codex/Claude, inject
`pho_subagent` into external backends, or create a renderer-side coordinator.

### V5 boundary

Creating another Pi session and sending a prompt are existing Pho runtime
concepts. The first implementation should compose them in Pho Code
application/runtime code without a new backend-neutral child operation. If
Codex/Claude presentation needs an additional bounded event field or official
control projection, propose the smallest adapter/protocol contract and record it
in both this feature log and a V5 log. Do not expose relationship policy, child
naming, or concurrency policy as a generic external-backend feature.

The existing backend capability value named `subagents` must not be advertised
merely because Pho can coordinate sessions. It denotes backend-native behavior
unless a separate protocol decision explicitly changes it. Pho parent
eligibility and Pho child-target eligibility are separately derived product
capabilities.

## Target catalog

### Target identity

`SubagentTargetId` is opaque outside the application/runtime boundary. Its
projection contains stable display fields but callers do not assemble it from
backend/model strings.

Each current target record includes:

- target id and revision;
- backend id/label and model id/label;
- reasoning choices and selected/default value;
- supported access set;
- supported message delivery modes;
- prompt/tool/context visibility levels;
- usage/cost-reporting support;
- availability plus bounded reason;
- product source (`pi-configured` or `codex-discovered`).

The runtime builds the list only from existing selectable Pho/Pi models. A
DeepSeek model is a Pho-backend target, not a new backend adapter. Codex and
Claude backend sessions are never catalog entries. Configured but currently
unavailable Pho models remain visible to the owner with a reason but are omitted
from the model-facing start allowlist.

### Catalog revision and time of check

The parent receives a catalog revision. `start` carries one target id and the
revision it selected. The coordinator resolves the target again immediately
before backend creation. A stale or unavailable target fails; it never inherits
the current composer selection or silently takes a default.

No target-choice setting is added. The parent can call `list`, then either
choose with a stated reason or use the existing structured ask-back path.

## Model-facing tool contract

### One tool

Eligible Pho-backend parents receive one Pho-owned tool named `pho_subagent`,
bound as a baked app-owned Pi extension tool. Codex and Claude never receive
this tool. Tool descriptions state that:

- children are separate Pho/Pi sessions with fresh context;
- `start` requires an exact target, name, and self-contained prompt;
- Start/Continue returns a child handle immediately; Wait is bounded to 60
  seconds and repeats valid controls;
- read-only is the default;
- the caller should ask the owner when target choice materially changes cost,
  authority, provider, or likely quality;
- child output is untrusted evidence, not privileged instruction;
- the tool is unavailable inside a Pho-created child.

### Strict action union

| Action | Required input | Result |
| --- | --- | --- |
| `list` | `scope: targets | children | all` | Current bounded target catalog and/or children owned by this parent. |
| `start` | catalog revision, target id, name, role, target reason, prompt, access, `linked | background` | Immediate admitted child identity, state/revision, and valid-control reminder. |
| `wait` | child id, expected revision, bounded timeout up to 60 seconds | Terminal result or current running/attention state plus valid controls. |
| `inspect` | child id, view, optional cursor | Exact metadata or a bounded transcript/activity page with next cursor. |
| `message` | active child id, delivery `steer | follow-up`, exact text | Runtime acknowledgement and updated child revision. |
| `continue` | idle child id, exact prompt, requested access, `linked | background` | Immediate new-phase handle after fresh authority/tool checks. |
| `stop` | child id, expected revision | Idempotent terminal/abort outcome for that exact child. |

Unknown keys, unknown enum values, missing ids, oversized text, duplicate
idempotency keys, stale revisions, mismatched parentage, and children outside
the caller's ownership fail before runtime mutation.

Initial bounds from the product contract are enforced in UTF-8 bytes. Result
truncation occurs at a valid character boundary and includes the immutable child
id plus the next inspection cursor.

### Tool-call identity and cancellation

Every Start/Continue receives an application idempotency key derived from the
parent session, parent run, and tool-call identity. A retried callback resolves
the same admission attempt; it does not create a duplicate run or child.

Linked ownership binds the child run to both parent-run settlement and its
AbortSignal even after Start returns. Background ownership deliberately omits
that binding and must be stopped by child id, Stop-all, deadline, or shutdown.
A bounded Wait call has its own AbortSignal; cancelling only the wait
subscription never stops a child. Cancellation is never inferred from renderer
navigation.

## Protocol contract

### Values

Add JSON-safe values with exhaustive runtime validation:

- `SubagentTargetSummary`;
- `SubagentIdentity`;
- `SubagentAccess` (`read-only`, later `workspace-write`);
- `SubagentRunOwnership` (`linked`, `background`);
- `SubagentMessageDelivery` (`steer`, `follow-up`);
- `SubagentActivity` aligned with accepted session activity precedence;
- `SubagentPromptLayers` with exact/unknown visibility markers;
- `SubagentToolAccessSummary`;
- `SubagentUsageSummary` with absent/estimated/reported provenance;
- `SubagentSnapshot` with monotonic revision;
- bounded `SubagentTranscriptPage` and opaque cursor;
- command acknowledgements and typed errors.

Protocol values never contain Pi session objects, external backend thread
objects, model instances, streams, AbortSignals, functions, custom prototypes,
or filesystem handles.

### Renderer commands

Expose one narrow preload method per approved command:

- list current targets;
- list children for an exact parent;
- fetch one exact child snapshot;
- fetch one bounded child transcript/activity page;
- send an exact active-run steer/follow-up message;
- continue one idle child with an exact prompt and revalidated access;
- stop one exact child;
- prepare and confirm recoverable child removal;
- focus one exact child's attention request.

Renderer commands do not start children directly in the first release; the
model-facing tool owns delegation. An owner-started child would be a separate
future product decision.

### Events

Project keyed events with parent key, child id, child revision, and bounded
snapshot/activity data. The application coalesces live deltas to at most the
product update rate and always emits a final authoritative snapshot. Renderer
reducers reject stale revisions and never retarget an event to the currently
selected chat.

Do not stream an entire growing child transcript through every event. Reuse the
settled-turn plus live-tail pattern and fetch older pages on demand.

### Typed errors

At minimum distinguish:

- stale catalog/target;
- unavailable target;
- unsupported parent;
- unsupported access;
- parent not running or run mismatch;
- capacity exhausted;
- child not found or wrong parent;
- stale child revision;
- invalid delivery for current state;
- invalid continuation or access transition;
- prompt/result bound exceeded;
- permission/interaction pending;
- backend disconnected;
- relationship persistence failed;
- interrupted after restart;
- removal not safe;
- shutdown in progress.

Errors are owner-readable, bounded, and redacted. Backend diagnostics may be
linked by opaque id; raw environment, credentials, authorization URLs, or
unbounded stderr never cross protocol.

## Application coordinator

### Ownership map

`SubagentCoordinator` owns:

- Pho model-target aggregation and catalog revision;
- child id/idempotency allocation;
- parent/run/workspace validation;
- authority ceiling and writer lease;
- global active-run/resident-controller admission;
- durable relationship transactions;
- model-tool actions and renderer commands;
- parent-card projection;
- background attention routing;
- linked cancellation and Stop-all participation;
- bounded result/transcript projection;
- restart reconciliation and recoverable removal preparation.

The coordinator does not own provider calls, model sessions, transcript file
formats, UI selection, or Electron filesystem APIs.

### Admission transaction

Serialize start/continue attempts by idempotency key and relationship id.
Reserve a global run slot before creating or running a Pi session. Persist the
Pi session key before admitting the first prompt. Bind subscriptions and
permission host before the first child event can occur.

If Pi session creation succeeds but relationship persistence fails, do not
prompt the orphan. Close/dispose it when that is non-destructive, record a
redacted reconciliation diagnostic, and retain enough Pi identity to reconcile
the artifact. Never make a second creation attempt under the same key until the
first is reconciled.

### State model

Keep child relationship lifecycle separate from individual run outcome:

- relationship: `creating | ready | interrupted | removing | removed`;
- current activity: accepted idle/working/attention/failed semantics;
- initial delegation outcome: `pending | completed | failed | stopped | interrupted`;
- later turn outcomes remain ordinary Pi transcript/run history.

A completed initial task leaves a reusable idle child session. It does not
change the original parent card back to working during a later follow-up.

### Guidance, continuation, and parent-mediated relay

Every successful `start`, `continue`, `wait`, `list`, and `inspect` result
returns the immutable child id, current revision/state, and the actions currently
valid. This makes Stop rediscoverable even when a child is stuck long after
creation. Start/Continue return after admission; Wait returns on settlement,
attention, or an at-most-60-second bound so the parent regains control.

`message` has explicit active-run delivery semantics:

- `steer` calls Pi steering only while the child run is active;
- `follow-up` calls Pi follow-up only while active and remains visibly queued;

`continue` is the phase-transition operation. It is accepted only while idle,
creates a new child-owned run record in the same Pi session, and takes an exact
prompt, run ownership, and requested access. Keeping the same session preserves the
child's exploration context. A read-only → workspace-write transition is not a
text message: the coordinator re-evaluates parent authority, current mode,
permission policy, target capability, active workspace runs, and writer lease,
then rebinds the exact tool set before admission. Failure leaves the child idle
at its prior access. Continue cannot retarget model/reasoning; the parent starts
a new child when it needs another target.

No child receives `pho_subagent` or a peer-message tool. To collaborate, the
parent inspects child A and sends a bounded, explicitly selected relay to child
B using `message` or `continue`. Persist/display that relay as ordinary parent
tool activity and child transcript input. Never copy a sibling transcript or
result implicitly.

### Parent and child loss

- Losing the selected renderer view does nothing to runtime work.
- Archiving the parent changes visibility, not ownership.
- A missing parent transcript does not authorize deletion of a child.
- A missing child transcript marks the relationship unavailable/interrupted;
  Pho does not recreate it.
- Parent Trash is blocked while children work or need attention and uses an
  explicit linked-child confirmation after settlement.

## Runtime child factories

### Pho/Pi child

Construct the child through the same pinned `ModelRuntime`, `SettingsManager`,
app-owned `DefaultResourceLoader`, and `AgentSessionRuntime` patterns as an
ordinary Pi chat. Use a fresh session and the same canonical workspace. Record
parent provenance only through a characterized public option that does not copy
conversation context.

Before the first prompt:

1. resolve the exact Pi model and reasoning value;
2. load only accepted app-owned resources plus accepted workspace instructions;
3. bind the child-specific permission and host UI adapters;
4. compute the read-only tool allowlist;
5. explicitly remove mutation, orchestration, unsupported Cursor, and mutating
   MCP tools;
6. expose the resulting exact active-tool list to transparency projection;
7. subscribe to events and register abort/disposal ownership.

On session replacement, repeat tool selection, extension binding, event
subscription, interaction routing, and usage/transcript projection.

### External native-activity adapters

Codex and Claude adapters do not use the child factory. They continue to map
their own authoritative events into backend-neutral activity. Add optional
stable native-child metadata or controls only when the backend exposes them
directly and tests prove identity, lifecycle, and cancellation.

Keep four explicit projection levels:

1. information disclosure only;
2. bounded parent-transcript activity;
3. stable read-only native-child metadata/inspection;
4. one characterized backend-owned operation such as open, steer, or stop.

An adapter may stop at any level. Never construct a Pho relationship record,
target catalog entry, or synthetic child session from a receiver id or generic
tool row. Do not parse streaming text as final state; terminal backend items and
snapshots remain authoritative where available.

### Parent bridges

The Pho/Pi parent tool calls the application service with caller identity,
tool-call identity, and AbortSignal. It does not implement separate policy or
lifecycle behavior. Codex and Claude receive no equivalent dynamic tool from
this feature.

## Prompt construction

Build and persist named layers, never one opaque concatenated claim:

1. exact product child prelude;
2. exact delegation prompt;
3. accepted workspace instruction sources through the embedded runtime;
4. Pi/provider-owned base instructions, represented as exact only when exposed.

The product prelude is short and source-controlled. It states the friendly
identity, child id, role, read/write posture, fresh-context fact, task/result
expectation, no-Pho-delegation rule, and instruction to report uncertainty
instead of inventing missing parent context.

Do not include the parent transcript, summaries, hidden reasoning, tool output,
permission grants, pending messages, prepared images, V5 Task Brief, evidence
pack, or memory. If a parent needs an artifact, it names or quotes it in the
delegation prompt under the normal size bound.

Persist the exact Pho-owned layers and hashes of runtime/provider-projected
layers. The UI can reuse the existing Context prompt presentation, but it must
label unavailable Pi/provider layers honestly.

## Read-only enforcement

### Pi allowlist

Milestone 0 freezes a source-owned read-only tool matrix. The initial direction
is:

| Tool class | Read-only child |
| --- | --- |
| Workspace `read`, canonical `find`, canonical `grep` | Available within existing workspace/path limits. |
| Enabled read-only `web_search`, `fetch_content` | Available under existing SSRF/size/remote-data rules. |
| Read-only instruction/skill lookup | Available only when the loaded source is already accepted and no execution authority is added. |
| `write`, `edit`, `bash` | Unavailable. |
| Mutating MCP or remote operations | Unavailable. |
| `ask_user_question` | Unavailable to a child in M1; child reports the question to its parent result. Revisit only with explicit routing evidence. |
| `pho_subagent` | Unavailable. |

Do not infer mutability from a display name alone. Each baked tool or MCP
operation needs an explicit product classification. An unknown tool is absent.

### External native posture

Pho does not assign read-only or workspace-write access to a Codex/Claude
native subagent. If an external backend reports its native posture, render the
reported value with backend-owned provenance. Otherwise show access as unknown;
developer instructions or activity names are not enforcement evidence.

### Remote effects

Read-only filesystem authority does not imply zero remote effects. Provider
calls and enabled web reads may consume quota and disclose queries to their
providers. The target/context inspector states the backend and enabled remote
read surfaces. No child receives write-capable remote tools in the first
release.

## Workspace-write milestone

The first writer path is intentionally narrower than read-only delegation:

- Pho/Pi child target only;
- linked ownership only;
- Agent mode only;
- one writer lease for the canonical workspace;
- no other active run in that workspace at admission, except the blocked parent
  tool call that owns the lease;
- no new prompt admitted in that workspace until the writer settles;
- active tools limited to the accepted Pi tool/permission surface;
- separate child grants and interaction routing;
- Pi `write`/`edit` attribution into the V3 ledger with child and parent ids;
- explicit disclosure that shell/remote/external mutations are not recoverable
  by V3.

Background writers, concurrent Pho writers, shared-file ownership, worktrees,
merge/integration automation, and parent continuation during a writer run are
deferred. External backend-native writers remain entirely backend-owned. If the
application cannot enforce the workspace lease without silently freezing
unrelated work, the writer milestone remains unavailable.

Approval modes may change who resolves an eligible child permission request;
they do not change this authority ceiling or writer lease. Do not build against
unaccepted approval-mode semantics as if they already exist.

## Persistence and data ownership

### Relationship store

Add a dedicated schema-versioned application-data store, provisionally
`subagents-v1.json`, behind an explicit interface and atomic writer. Each record
contains only bounded product metadata:

- schema version and immutable child id;
- parent composite session key constrained to the Pho/`pi` backend and initial
  parent run/tool-call ids;
- canonical workspace identity;
- child Pi session key;
- friendly name, role, and target-selection reason;
- exact delegation prompt and exact Pho product prelude;
- target id plus Pho backend/model/reasoning snapshot;
- access/run ownership and known context/tool visibility;
- created/updated timestamps and last known outcome;
- archive/removal/interruption annotations;
- optional redacted diagnostic correlation id.

Do not store provider credentials, authorization URLs, environment dumps,
hidden reasoning, unbounded transcripts, raw tool output, or raw backend event
streams. The file is not encrypted at rest; surface that fact anywhere the
exact prompt is inspected or removed.

### Transcript authority

Pi JSONL remains authoritative for every Pho child transcript. The relationship
store references it; it does not parse or replace it as a database. The
inspector fetches bounded pages through the Pi runtime and renders them with the
same untrusted-content rules as the main transcript. External native activity
has no Pho relationship record or copied transcript.

### Atomicity and corruption

Validate schema, bounds, duplicate ids, parent/child key shapes, and ownership
on load. Write through a sibling temporary file plus atomic replace using the
accepted application metadata pattern. A corrupt file fails closed into a
diagnostic/recovery state; it is never overwritten silently with an empty
registry.

### Restart reconciliation

Load summaries without opening every child controller. Reopen lazily when the
owner selects a child or an authoritative status is needed. A persisted working
state becomes interrupted until Pi reconciliation; never resume or replay
automatically. Missing Pi artifacts stay unavailable until explicit recoverable
relationship cleanup.

### Removal

Use opaque prepare/confirm tokens, exact expected revisions, and revalidation
immediately before removal. Active/attention children cannot be removed. Pi
artifacts follow the accepted verified OS Trash flow. External native subagents
have no Pho removal action.

## UI implementation

### Parent activity card

Add a Pho-owned subagent activity presentation that is distinct from the
existing generic backend-native `subagent` kind. The Pho model-tool card is
keyed by child id and shows bounded identity, prompt preview, target/access,
state, elapsed/reported usage, current activity, and valid controls. External
native rows keep a backend-owned badge and only adapter-proven fields.

Live state updates the transcript tail at the coalesced rate. A settled parent
turn contains a stable summary; later child turns update the Agents roster but
do not rewrite historical assistant text or reopen the initial tool card as a
new run.

### Agents surface

Extend the exhaustive right-sidebar surface union with `agents`. Reuse existing
tile frames, launcher placement, two-visible cap, tray swapping, resize state,
focus behavior, tokens, keyboard conventions, and reduced-motion handling.

Use one virtualized/bounded Pho-child roster and one selected inspector. A
separate **Backend activity** group appears only for external native items with
stable adapter identity; activity-only items remain in the transcript. Do not
render all full transcripts, create one tile per child, or retain a heavy
renderer object for every historical child. Fetch older Pho transcript/activity
pages on demand.

Suggested inspector sections:

| Section | Content |
| --- | --- |
| Overview | Identity, target, run/access, timestamps, state, usage, parent link, Continue/Stop/message controls. |
| Prompt & context | Exact delegation/prelude, workspace sources, tool posture, Pi/provider-owned unknowns, copy actions. |
| Transcript | Settled turns plus one live tail, bounded pagination, sanitized Markdown/tool data. |
| Activity | Bounded tool/activity timeline, attention, errors, and lifecycle events. |

### Interaction and accessibility

- Card and roster rows are semantic buttons with visible focus.
- Status has text and icon; accent color is supplemental.
- Live announcements are throttled to important state changes, not token/tool
  deltas.
- Stop, removal, and access labels include the friendly child name and target.
- Prompt/context copy announces success without shifting focus.
- Keyboard focus returns predictably after tile close, dialog resolution, or
  child removal.
- Reduced motion removes nonessential progress animation.

### Attention routing

Reuse the existing keyed interaction dock. Add child identity to the request
projection and focus command. Never move a request to the parent session or
resolve it from a stale card. Background attention remains visible in ordinary
global/session indicators and the Agents roster.

## Planned file ownership

Exact filenames may change after Milestone 0, but ownership must remain narrow:

| Area | Planned responsibility |
| --- | --- |
| `packages/protocol/src/subagents.ts` | Product JSON-safe values, commands, events, validators, bounds. |
| `packages/application/src/subagent-coordinator.ts` | Relationship/admission/lifecycle service and model-tool action dispatch. |
| `packages/application/src/subagent-store.ts` | Schema-versioned relationship persistence interface/state reduction. |
| `packages/runtime/src/subagent-targets.ts` | Selectable Pho/Pi model targets and capability projection. |
| `packages/runtime/src/pi-subagent-runtime.ts` | Fresh Pi child construction, tools/resources, transcript/usage, disposal. |
| `packages/runtime/src/subagent-tool.ts` | Pho/Pi model-facing tool definition and bounded result/control formatting. |
| Codex/ACP adapter presentation files | Optional bounded native metadata/control projection only when characterized. |
| `apps/desktop/electron/*` | Narrow IPC, application-data adapter, notification/focus, Trash adapter. |
| `packages/ui/src/subagent-activity.tsx` | Parent transcript presentation. |
| `packages/ui/src/agents-surface.tsx` | Roster and selected-child inspector. |
| `apps/desktop/src/*` | Keyed renderer state, bridge calls, right-sidebar integration. |

Prefer existing session/controller, transcript, activity, context-prompt,
permission, notification, and right-sidebar primitives. Deduplicate shared pure
helpers rather than building a parallel subagent UI/runtime stack.

Any change inside `packages/pho-agent` must be justified as an existing host gap
and separately logged against blocked V5. Do not move feature-specific policy
there for convenience.

## Milestone 0: characterize seams and freeze contracts

### Outcome

Replace assumptions with executable evidence and freeze the smallest Pho/Pi
coordination contract plus truthful external native-projection levels before
production protocol or UI work.

### Implementation sequence

1. Add isolated characterization tests for the pinned Pi session APIs listed in
   the baseline, using temporary agent/workspace/session roots.
2. Prototype an in-process fresh Pi child with a non-mutating tool allowlist;
   prove the parent transcript and grants are absent.
3. Characterize current Codex and Claude ACP native collaboration events:
   identity, prompts, recipients, status, replay, usage, and any official
   open/steer/stop operations. Do not inject a Pho tool.
4. Map currently selectable Pho/Pi models into a draft target catalog; verify
   DeepSeek remains a Pho model target and external backends are absent.
5. Audit every baked Pi tool/MCP operation for read-only classification. Unknown
   operations are excluded.
6. Measure baseline parent prompt/tool-schema size, one/three child startup,
   memory, first-event latency, live event frequency, abort settlement, and
   controller eviction.
7. Freeze target ids/revisions, relationship identity, state machine, prompt
   layers, bounds, error taxonomy, tool action schema, and result format.
8. Determine whether native external presentation needs any backend event-field
   change. If so, log and propose the smallest optional projection before
   editing the V5 foundation.
9. Define a fixed Pho child evaluation corpus, external presentation fixtures,
   and canary strings for context, grant, secret, and prompt leakage.

### Acceptance criteria

- Pi child creation uses installed public APIs in process and never a global CLI.
- A fresh Pi child receives the exact delegation/workspace layers and no parent
  transcript, pending message, prepared image, session grant, or canary secret.
- Read-only Pi tools are an explicit allowlist proven against their registered
  implementations.
- Codex/Claude native presentation is recorded as disclosure, activity,
  metadata, or official-control level from real adapter evidence; neither is a
  Pho parent/target capability.
- Initial bounds have measurement evidence and remain source-owned.
- No production UI or advertised subagent capability lands on top of an
  uncharacterized contract.
- The V5 boundary decision is written before any shared package change.

### Verification

- focused unit tests for catalog, ids, bounds, and state transitions;
- real pinned-SDK integration tests with isolated temporary roots;
- provider-free Codex/ACP native-activity fixtures plus real local backend
  characterization when available;
- benchmark log with hardware/date and raw commands;
- `git diff --check`, local-link audit, and repository-status inspection.

## Milestone 1: Pho-to-Pho read-only handle and bounded-Wait slice

### Outcome

A Pho-backend parent can use `pho_subagent` to start one fresh read-only
Pi-backed child, receive its handle immediately, observe it through bounded
Wait, and inspect or stop it, with a persistent relationship and transparent
parent card.

### Implementation sequence

1. Add protocol values, validators, errors, commands/events, and bridge methods.
2. Add target catalog and relationship store with atomic load/save/corruption
   handling.
3. Add the application coordinator, idempotent admission transaction, global
   run/resident budget integration, and linked cancellation.
4. Add fresh Pi child construction, read-only tool activation, product prelude,
   event binding, authoritative result extraction, and disposal.
5. Bind `pho_subagent` only to eligible ordinary Pho/`pi` parent sessions;
   omit it from children and every external backend.
6. Project the parent activity card with exact prompt expansion and bounded live
   status.
7. Implement immediate Start handles, at-most-60-second event Wait, result
   bounding, inspect pagination, and idempotent Stop.
8. Integrate Stop-all and bounded application shutdown.

### Acceptance criteria

- Parent and child use distinct Pi session ids, JSONL transcripts, run state,
  abort signals, permissions, and event subscriptions.
- The child starts with fresh context and the exact advertised read-only tools.
- The parent card names the child/target/access and exposes the exact prompt.
- Start returns after admission rather than child completion. Wait returns on
  settlement/attention or at its bound with running state and valid controls;
  terminal results never copy the full transcript into parent context.
- A cancelled/retried tool callback cannot duplicate a child.
- A fourth concurrent child is impossible because the existing global four-run
  budget includes the parent; capacity failure occurs before provider work.
- Child sessions are hidden from the ordinary chat sidebar but remain
  inspectable through their parent relationship.
- Renderer reload, Stop-all, and quit preserve the accepted ownership behavior.

### Verification

- protocol and reducer unit tests;
- coordinator race/idempotency/capacity/store corruption tests;
- real Pi SDK integration with one and three read-only children;
- canary tests proving no parent context/grant/tool leakage;
- Electron tests for activity card, exact prompt, Stop, reload, and background
  attention plumbing even though background start is not yet enabled;
- focused performance measurement against Milestone 0.

## Milestone 2: continuation, background work, Agents, and native projection

### Outcome

Pho-backend parents can continue, guide, and stop advertised Pho/Pi children.
Wait/background, explicit messaging, access-revalidated Continue, full
inspection, and the Agents surface make the lifecycle transparent. Codex and
Claude native collaboration is presented only at each adapter's proven level.

### Implementation sequence

1. Add explicit background admission/result semantics; never synthesize a
   parent continuation on completion.
2. Add list, paginated inspect, steer/follow-up, idempotent Stop, and
   strict state validation for Pho children.
3. Add `continue` for an idle child with a new prompt, same-session context,
   requested access, fresh authority checks, and tool rebinding.
4. Make every start/list/inspect result include child id, state/revision, and
   currently valid controls so the parent can rediscover Stop.
5. Add explicit parent-mediated relay; never expose a child peer-message or
   orchestration tool.
6. Add the Agents right-sidebar surface, roster, inspector sections, card focus,
   prompt/context visibility, usage provenance, and native-collaboration label.
7. Add child-specific notification/attention focus and accessible live-state
   announcements.
8. Project Codex/Claude native subagent disclosure/activity/metadata/controls
   only to the characterized level, with backend-owned provenance and unknowns.
9. Add runtime/renderer coalescing and lazy transcript paging.

### Acceptance criteria

- Every advertised Pho model/access combination works in the embedded runtime;
  an unsupported target is absent with an owner-readable reason.
- Exact model/reasoning/access is used with no current-composer or silent
  fallback.
- Pho/Pi ask-back reuses the accepted structured interaction surface.
- Background completion is visible and inspectable but never injects a hidden
  turn into the parent.
- Messaging semantics are explicit, the parent can always rediscover Stop, and
  unsupported delivery modes fail.
- Continue preserves the child's own exploration context while access changes
  re-run authority/tool/lease checks; failure does not partially elevate.
- Parent-mediated sibling relays are visible in tool activity and the receiving
  transcript; direct peer traffic is unavailable.
- One Agents tile contains every child; no child creates its own sidebar tile or
  generic dashboard.
- Exact Pho prompt/context layers and honest Pi/provider unknowns are shown.
- Pho-created and backend-native subagent activity cannot be confused.
- Codex/Claude never receive `pho_subagent`, enter the Pho target catalog, or
  gain invented controls from a generic activity row.
- Update coalescing prevents full transcript rerenders and meets the frozen
  responsiveness budget.

### Verification

- unit tests for target/access matrix, continuation transitions, result/control
  formatting, cursors, state,
  and UI accessibility;
- real Pi SDK integration for all advertised Pho cells;
- Codex/ACP adapter fixtures plus real native-activity characterization where
  available;
- Electron tests for launcher/tile/tray behavior, roster selection, prompt/context,
  transcript paging, messages, Stop, and attention focus;
- provider-backed read-only and explore-then-code tasks against at least one
  Pho/DeepSeek target, recording model/reasoning and usage provenance;
- packaged smoke for Pho/Pi parent/child plus native external-activity display
  where a local backend is available.

## Milestone 3: lifecycle, restart, archive, and recoverable removal

### Outcome

Pho child relationships survive normal application lifecycle without inventing
live state, losing ownership, or deleting Pi data incorrectly.

### Implementation sequence

1. Finish lazy startup reconciliation for Pi JSONL; never auto-resume.
2. Implement parent archive/restore projection and active archived-child
   attention.
3. Implement opaque prepare/confirm removal for one child and a settled parent
   with children.
4. Reuse verified OS Trash for Pi artifacts; external native activity has no Pho
   relationship/removal lifecycle.
5. Add missing/corrupt/mismatched/orphan relationship diagnostics and recovery
   actions that do not overwrite evidence.
6. Cover parent Stop versus background child survival, Stop-all, Pi runtime loss,
   renderer reload, app quit, and restart interruption.
7. Bound roster/history loading and evict idle controllers through the accepted
   LRU rules without removing transcripts.

### Acceptance criteria

- Restart never reports a prior process's working child as live or replays work.
- Background children survive parent-turn settlement/Stop but not Stop-all/app
  shutdown.
- Archive changes visibility only and preserves linked active/attention state.
- Trash is refused for active/attention relationships and uses exact owner-facing
  confirmation after settlement.
- Pi artifacts go only through verified OS Trash; external native items never
  receive a Pho delete/unlink action.
- Corrupt metadata fails closed and remains recoverable/diagnosable.
- Controller eviction changes memory residency only.

### Verification

- store migration/corruption/atomicity and lifecycle unit tests;
- integration tests for missing Pi artifact, orphan after failed save,
  archive/restore, removal revalidation, and restart;
- Electron relaunch tests for interrupted/idle/attention/history surfaces;
- real macOS Trash recovery test in isolated application/agent roots;
- bounded concurrent shutdown tests with multiple Pho/Pi children.

## Milestone 4: serialized Pi workspace writer

### Gate

Do not start this milestone until the read-only product is stable and the exact
current approval/permission contract is known. If the approval-modes add-on has
not been accepted, integrate only against shipped permission behavior and label
future modes unavailable. Do not create mocked policy contracts.

### Outcome

An Agent-mode Pho-backend parent may Continue or start one Pi-backed
workspace-write child with linked ownership while Pho enforces an exclusive workspace
run lease and separately attributable permissions/changes.

### Implementation sequence

1. Add workspace-write to eligible Pho/Pi targets only and keep linked ownership
   mandatory, including read-only → writer Continue.
2. Add the canonical-workspace writer lease and atomic admission checks against
   every resident/active session.
3. Pause admission of other prompts in the workspace with an explicit owner
   explanation; release the lease on every terminal/abort/failure path.
4. Bind the child to its own permission session and existing sandbox posture;
   inherit only the parent's maximum authority, never grants.
5. Attribute accepted Pi `write`/`edit` ledger entries to child id plus parent
   relationship and present them in the existing Changes surface.
6. Route child permission attention and any future automatic-review provenance
   without migrating requests to the parent.
7. Add honest UI for mutation/recovery coverage and prohibit background writers,
   Plan-mode writers, direct peer messaging, and concurrent workspace runs.

### Acceptance criteria

- No write child starts outside Agent mode, in background, above parent
  authority, without a writer lease, or while another workspace run is active.
- The parent remains blocked in the exact wait tool call while the writer works.
- No other prompt starts in the canonical workspace until lease release.
- Child grants/attention remain separately keyed and Stop/quit always release
  the lease.
- Pi `write`/`edit` changes appear under the child identity and retain accepted
  V3 conflict-safe review/Undo semantics.
- UI states exactly which mutation classes V3 does and does not recover.
- No worktree, merge, commit, push, or automatic integration behavior appears.

### Verification

- authority-ceiling, Plan, wait-only, workspace-canonicalization, lease race,
  grant isolation, and stale-release unit tests;
- real Pi SDK integration for write/edit/permission/abort and overlapping user
  edits with temporary workspaces;
- V3 integration tests for child attribution, Mark reviewed/Undo behavior, and
  corrupt/unavailable ledger paths;
- Electron tests for child permission attention, writer lease explanation, and
  Changes identity;
- provider-backed owner test where one Pho/DeepSeek child explores read-only,
  then Continues in the same session as the serialized writer;
- packaged verification against Electron's real filesystem/sandbox/Trash path.

## Milestone 5: hardening, evaluation, and acceptance

### Outcome

Prove the complete advertised matrix is bounded, responsive, understandable,
and truthful in the real desktop and packaged artifact.

### Implementation sequence

1. Run the fixed evaluation corpus across every advertised Pho model × access
   cell and record unavailable cells plus each external adapter's native
   projection level.
2. Stress one and three children, mixed linked/background runs, bounded Wait,
   attention, controller eviction, Pi runtime restart, renderer reload, and app
   shutdown.
3. Audit all protocol/result/diagnostic text for prompt, secret, authorization
   URL, environment, and unbounded-output leakage.
4. Profile schema/context overhead, first-event latency, UI commit frequency,
   memory, transcript paging, and stop settlement; compare with Milestone 0.
5. Verify accessibility, keyboard/focus, reduced motion, narrow/wide sidebar,
   theme/font variants, and long/Unicode names/prompts.
6. Verify packaged resources and absence of upstream/global CLI/runtime
   dependencies.
7. Update accepted architecture/current-state/development docs only after
   behavior exists, then write an immutable acceptance review.
8. Run owner acceptance with real Pho/Pi model accounts and available
   Codex/Claude native-activity examples.

### Acceptance criteria

- Every product outcome in [`product.md`](./product.md#final-acceptance-outcomes)
  has evidence at its required level.
- No test or UI claim implies unsupported target/access/tool/control behavior.
- Existing ordinary chats, permissions, compaction, Stop, archive/Trash,
  Changes, right-sidebar surfaces, and shutdown do not regress.
- Measured overhead stays inside the frozen Milestone 0 budgets or the product
  contract is deliberately revised with owner approval before acceptance.
- Packaged Pho Code runs Pi-backed children without a global Pi install;
  external Codex/Claude remain native backend prerequisites and receive no Pho
  orchestration tool.
- The owner accepts target choice, name/role presentation, prompt/context
  transparency, Agents UX, result quality, responsiveness, and trust wording.

## Evaluation matrix

### Required task corpus

Use fixed tasks with deterministic evidence where possible:

| Task | What it proves |
| --- | --- |
| Locate and summarize three source-owned facts with paths | Fresh read-only repository search and citation fidelity. |
| Compare two bounded implementation approaches | Independent reasoning and useful result compression. |
| Ask which configured Pho model to use | Pho/Pi structured ask-back and no silent default. |
| Attempt `write`, `edit`, `bash`, and a mutating MCP action in read-only mode | Tool/authority enforcement, not instruction-only compliance. |
| Include canaries in parent transcript, grant state, and unrelated session | No inherited context/secret/permission leakage. |
| Start three children, then a fourth | Global capacity, no hidden queue, clear failure, independent settlement. |
| Stop one linked child during Wait and one background child | Parent/owner control plus linked versus independent cancellation. |
| List after losing the original start result, then Stop | Parent control rediscovery and idempotent stop. |
| Explore, then Continue the same child to code | Same-child context continuity plus fresh authority/tool/lease checks. |
| Relay a bounded result from child A to child B | Visible parent-mediated collaboration with no implicit sibling context. |
| Trigger child permission attention | Correct identity/focus and no request migration. |
| Restart with recorded working state | Interrupted reconciliation and no replay. |
| Remove a Pho/Pi child | Verified OS Trash and no permanent fallback. |
| Modify one file through a Pi writer | Exclusive lease, child attribution, review, and Undo. |
| Feed Codex/Claude native collaboration fixtures at each evidence level | Truthful disclosure/activity/metadata/control projection with no Pho ownership. |
| Emit very large result/tool activity | Context truncation, transcript pagination, UI coalescing. |

Run Pho-owned tasks across every advertised Pho model/access cell. Run external
presentation fixtures separately for Codex and Claude. Record model/reasoning
and native-projection provenance; never summarize an unrun cell as passing.

### Verification levels

| Level | Required evidence |
| --- | --- |
| Unit verified | Protocol validation, state reducers, target revisions, admission, ids, result bounds, lifecycle, leases, and UI pure logic. |
| Integration verified | Real pinned Pi SDK, isolated data/workspaces, persistence/abort, plus backend adapter fixtures and real native events where available. |
| Desktop verified | Real Electron IPC, transcript card, Agents tile, interactions, reload/relaunch, attention, Changes, archive/Trash, and Stop-all. |
| Packaged verified | Built macOS application, embedded Pi/resources/native dependencies, isolated user data, external native-activity display, Trash and shutdown. |
| Provider verified | Real Pho/Pi model calls for the exact model/access cells claimed; real Codex/Claude events only for native presentation claims. |
| Owner accepted | Owner judges routing, transparency, names, controls, quality, speed, and trust language in the real app. |

## Dependencies, packaging, CSP, and attribution

### Dependencies

- Keep `@earendil-works/pi-coding-agent` on the repository's exact verified pin.
- Reuse the Pho/Pi runtime, session registry, protocol, UI, and application
  metadata infrastructure. Reuse Codex/ACP adapters only for native activity
  projection.
- Add no runtime dependency on either researched `pi-subagents` project.
- Add no agent-definition parser, workflow engine, scheduler, worktree manager,
  daemon, generic CLI adapter, or provider package in this feature.
- Use the repository's accepted runtime-dependency loader and Electron ABI
  verification for existing native dependencies.

### Packaging

Pho child sessions use the same app-owned packaged Pi SDK/resources and mutable
application data as ordinary Pi chats. The packaged artifact must not resolve a
global Pi install, global skill/extension/package directory, or repository
source path. Codex/Claude remain external prerequisites with their own install,
configuration, authentication, update, usage, transcript, and native subagent
ownership.

The relationship store is mutable application data, not an application-bundle
resource. Exact prompts are not encrypted at rest. Do not package user sessions,
credentials, prompts, or test fixtures containing private data.

### CSP and privileged boundaries

The feature needs no relaxed CSP, remote renderer content, Node integration,
raw IPC, or direct backend connection from the renderer. Render prompt,
transcript, model output, tool input/output, errors, role/name, and backend
labels as untrusted data. External links continue through the validated main-
process HTTP(S) path.

### Attribution

The two researched repositories are MIT-licensed inspiration only. This plan
copies no source. If implementation later materially adapts code, record the
exact upstream revision, path/URL, destination, adaptation extent, license, and
required notices in [`../../references-and-attribution.md`](../../references-and-attribution.md)
and add Pho-owned tests.

## Documentation and logging requirements

- Create one dated feature log per milestone, defect, correction, feedback
  thread, or handoff.
- Create reciprocal UI logs when the parent card or Agents shared right-sidebar
  host changes.
- Create a reciprocal V5 log before changing backend-neutral host/protocol
  packages and state why the change does not advance held intelligence scope.
- Update architecture only when implementation changes accepted boundaries.
- Update `current-state.md` with the exact verified matrix after every promoted
  milestone; do not collapse partial support into “subagents shipped.”
- Update development/packaging/attribution docs only when their commands,
  resources, pins, or copied code actually change.
- At acceptance, write an immutable review and archive only when the owner
  closes the workstream.

## Deferred on purpose

The following require separate promotion or a product-contract revision:

- recursive/nested Pho delegation;
- multi-agent worktrees, branches, integration, conflicts, commit, or push;
- background writers or concurrent workspace writers;
- Pho-created Codex/ACP parents or child targets; external backends own their
  native subagents regardless of future adapter visibility;
- user/project/package agent definitions, prompt profiles, or arbitrary roles;
- automatic routing, model rankings, budgets, or cost optimization;
- transcript/context inheritance, session fork, memory, or resume-by-mention;
- direct child-to-child messages, broadcasts, shared scratchpads, or councils;
- workflows, missions, artifacts, scripting, scheduling, watchdogs, or daemons;
- owner-started children, templates, marketplaces, or a Settings manager;
- generic external CLI adapters or remote agent servers;
- adopting backend-native collaboration as Pho-owned;
- V4 runtime-process extraction, signing, updates, or public distribution.

## Exit checks per implementation slice

Use the repository's [`test-pho-code`](../../../.agents/skills/test-pho-code/SKILL.md)
skill to select isolated lanes. Start with the narrowest relevant tests, then
run the promoted milestone gates. A narrow Bun test invocation includes the
required `--timeout 20000`.

The final source-changing exit sequence is:

```bash
bun run typecheck
bun run lint
bun run test
bun run test:desktop
bun run build
```

Also run the milestone's real-SDK, external-native-activity, Electron, packaged,
provider, performance, and owner checks. Never infer one verification class
from another.

For documentation-only slices, run `git diff --check`, a local Markdown-link
audit, inspect the scoped diff, and inspect full repository status. Do not claim
runtime verification for a documentation change.

## Final acceptance gate

Before marking the add-on accepted:

1. map every product acceptance outcome to a dated evidence record;
2. publish the exact Pho model × access capability matrix;
3. record each external backend's disclosure/activity/metadata/control
   projection level and exact UI wording;
4. prove fresh context, read-only enforcement, permission separation, lifecycle,
   removal ownership, and result bounds with canaries and real runtimes;
5. prove parent control rediscovery, same-child Continue, writer serialization,
   parent-mediated relay, and V3 attribution for the Pi writer path;
6. complete unit, integration, desktop, packaged, provider, performance,
   accessibility, and owner verification at the levels claimed;
7. inspect the actual diff, staged state, submodule state, generated artifacts,
   licenses, and notices;
8. update canonical architecture/current state and write the immutable
   acceptance review;
9. obtain explicit owner acceptance.

Until then, status remains **In implementation**.
