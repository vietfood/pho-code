# Product definition: subagent orchestration

## Status

**In implementation.** The owner promoted this standalone add-on on
2026-09-01. This document defines planned behavior. No Pho-owned subagent
coordinator, child-session roster, or Agents surface exists in source yet.

Current Pho Code already supports its Pho backend plus independently owned
Codex and Claude ACP backends. In source, the Pho backend is the app-owned Pi
wrapper and still uses the legacy backend id `pi`; this feature uses “Pho
backend” and “Pi-backed” for that same implementation, not two different
backends. Codex/Claude-native collaboration remains owned by those backends.
Pho currently flattens Codex native collaboration into ordinary activity.

This feature may proceed independently of numbered V5, but it must not smuggle
held V5 intelligence milestones or pending V4 process extraction into an
add-on. Shared foundation work must remain the smallest contract needed for
delegation and must be logged against both owners.

## Owner outcome

Pho Code should let the active agent delegate a bounded task to another
configured agent without turning the application into an orchestration
dashboard.

The owner can always answer five questions:

1. Who is working?
2. Which backend, model, and reasoning level are they using?
3. What exact task did the parent give them?
4. What context, tools, and authority do they have?
5. What are they doing now, and how can the owner inspect, guide, or stop them?

Delegation should be useful without configuration. The parent chooses among
targets already available in Pho Code, may ask the owner when the choice is
materially ambiguous, gives the child a memorable name, and receives a bounded
result. The owner never has to install an agent package, write a profile file,
or manage a workflow language.

## Product thesis

The useful primitive is not an “agent persona.” It is a real child session with
a narrow relationship to a parent task.

Pho Code owns that relationship only inside its Pho backend. The embedded Pi
runtime continues to own the child's agent loop, transcript, model calls, and
native tools. Configured Pho-backend models such as DeepSeek are selectable
targets for the parent.

Codex and Claude ACP are deliberately different: their native backends decide
whether and how to create subagents. Pho does not inject its orchestration tool,
create their child sessions, route their peer work, or claim lifecycle control.
It renders backend-native activity and controls only to the fidelity their
official adapter events expose; otherwise it tells the owner what is unknown.

The first release favors explicit state over automation:

- fresh child context instead of copying the parent conversation;
- one model-facing orchestration tool instead of a family of workflow tools;
- immediate child handles plus bounded waits, with explicit linked/background
  cancellation ownership;
- a fixed source-owned concurrency budget instead of settings;
- depth one instead of recursive delegation;
- read-only children first, then separately accepted write authority;
- one Agents surface instead of one window per child.

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Pho backend** | Pho Code's main app-owned backend, implemented as a wrapper around embedded Pi and currently identified as `pi` in source protocol. |
| **parent** | The Pho-backend session whose active turn requests delegation. |
| **child** | A separate Pho/Pi session created through Pho's coordinator for one parent. |
| **target** | A currently selectable Pho-backend model and optional reasoning combination identified by an opaque product id. |
| **delegation prompt** | The exact self-contained task text supplied by the parent to the child. |
| **access** | The child's product authority: initially `read-only`, later optionally `workspace-write`. |
| **linked run** | Default child ownership: parent-turn settlement or Stop aborts a still-running child. Start still returns its id immediately. |
| **background run** | Explicit detached-from-parent-turn-Stop ownership; app Stop-all/quit still aborts it. |
| **bounded wait** | A control call that returns on settlement or after at most 60 seconds with current state and controls. |
| **Pho child** | A child registered and controlled by this feature. It is distinct from backend-native collaboration activity. |
| **native subagent activity** | Codex- or Claude-owned collaboration that Pho may project but does not orchestrate. |

“Agent,” “model,” and “role” are not synonyms. A target selects execution. A
role such as Scout or Reviewer is only an owner-facing label and prompt hint; it
does not load an ambient profile or grant authority.

## Selected product decisions

1. **Pho owns coordination only for the Pho backend.** Every Pho child is
   created through the accepted embedded Pi runtime. Pho does not reproduce
   Pi's loop and does not coordinate Codex/Claude-native children.
2. **Every child is a separate session.** It has its own transcript, run state,
   abort signal, interaction queue, model selection, and permission state.
3. **Parents and children stay in the Pho backend.** The target catalog contains
   only models already selectable through that backend. Codex and Claude ACP do
   not receive `pho_subagent` and are never Pho child targets.
4. **External native subagents remain native.** Pho uses an adapter capability
   ladder: disclose possible native use, render activity, render stable child
   metadata, or expose an official control only when that exact level is
   supported. Missing information stays visibly unknown.
5. **One strict tool controls the lifecycle.** Its actions start, list, wait,
   inspect, message, continue, and stop children. Message is explicit
   steer/follow-up; Continue starts a new idle-child phase. Every result reminds
   the parent of the child id and available control actions.
6. **Fresh context is the default and only first-release context mode.** The
   parent must write a self-contained delegation prompt. Parent transcript,
   hidden chain of thought, pending queues, and session grants are not copied.
7. **Read-only is the default and first accepted authority.** Write-capable
   children are a later milestone with explicit permission, attribution, review,
   and recovery gates.
8. **Start never traps the parent behind an unbounded wait.** Start/Continue
   returns the child id immediately. The parent normally calls bounded Wait,
   regains control at least every 60 seconds, and can then inspect, guide, wait
   again, or Stop. Background cancellation ownership is explicit.
9. **No silent fallback.** An unavailable target, lost backend, exhausted
   capacity, or unsupported authority fails with a visible reason. Pho never
   swaps providers or models behind the owner's back.
10. **No Pho-created nesting or direct peer messaging.** A child has no
    orchestration tool. The parent explicitly relays relevant results or context
    between sibling children, keeping communication visible and bounded.
11. **Names are delightful, identities are strict.** The parent supplies a short
    friendly name and optional role. Pho owns an immutable child id and resolves
    duplicate display names without using names for authorization.
12. **No new Settings page in the first release.** Targets come from existing
    account/model availability, and bounds remain source-owned.

## Target selection and ask-back

The target catalog contains only model/reasoning combinations the Pho backend
can start now. A target summary exposes:

- stable opaque id and owner-facing label;
- Pho backend and model;
- available reasoning levels;
- supported access levels;
- tool visibility level;
- availability and, when unavailable, a bounded reason;
- whether usage and cost are reported by that model/provider.

The parent may choose a target when the request itself makes the tradeoff clear.
For example, it can select a fast DeepSeek model for broad repository search or
another configured Pho-backend model for a stronger review. It should ask the
owner when the choice materially changes authority, provider usage, cost, or
expected quality and the request does not establish a preference.

The Pho parent reuses accepted `ask_user_question`; the subagent feature does
not add another chooser dialog or let an unresolved choice silently pick a
default. Codex and Claude make any native target/role choice inside their own
backend behavior.

Targets are runtime-derived but product-bounded. Pho accepts no arbitrary
provider id, executable path, package, agent file, backend server, Codex thread,
or ACP session from the tool call.

## Child identity and personality

The parent names every child. A good name is short, pronounceable, and distinct
in the current task: for example, “Mochi,” “Copper Finch,” or “Patch Owl.” Emoji
is allowed, but control characters and deceptive whitespace are not. The
initial bound is 48 visible characters. `start` rejects a missing or invalid
name; duplicates gain a visible numeric suffix without changing the immutable
child id.

The parent also provides:

- an optional concise role label such as Scout, Builder, or Reviewer;
- a required one-sentence reason for choosing the target.

The friendly name and role appear in the exact visible product prelude; the
target reason stays parent-facing. These fields do not load a profile or alter
tools and permissions. Pho derives a stable color/accent from the immutable
child id and reuses existing backend marks and design tokens. It does not add
avatar generation, uploaded personas, or another asset system.

The compact identity line is:

`<friendly name> · <role> · <backend/model>`

Accessibility labels include the full name, role, backend, model, and state;
color is never the only status signal.

## Prompt and context transparency

The Agents inspector presents context as named layers instead of claiming that
one text box is the whole prompt:

| Layer | First-release disclosure |
| --- | --- |
| Delegation | Exact Pho-supplied task text, unmodified, with copy action. |
| Product prelude | Exact Pho instructions added specifically for a child, including result and authority expectations. |
| Workspace context | Loaded instruction sources, paths, trust state, and exact text when Pho can project it through the existing Context prompt contract. |
| Tools and access | Active product tools, disabled mutation classes, permission mode, and sandbox posture. |
| Pi/provider base | Exact text when the embedded runtime exposes it; otherwise an honest “runtime/provider managed; not available to Pho Code” disclosure. |
| Parent context | “Fresh context; parent transcript not inherited” in the first release. |

Pho never presents an inferred system prompt as exact. It never exposes hidden
model reasoning. Runtime/provider-owned instructions that cannot be inspected
remain explicitly unknown.

The parent transcript stores a bounded delegation activity card. The child
session stores its ordinary conversation. The application relationship record
stores the exact delegation prompt so the owner can inspect it after restart.

## Child tool and authority contract

### Read-only

Read-only is the default and the first shippable vertical slice.

For a Pho/Pi child, Pho activates a source-owned allowlist of non-mutating tools,
such as bounded workspace read/search and enabled read-only web operations. It
does not expose `write`, `edit`, `bash`, mutating MCP operations, or the
subagent tool. Skills may be visible only when their resulting tool surface
still satisfies the same allowlist.

Read-only means Pho intentionally withholds mutation authority. It is not a
claim that model output, remote content, extensions, or an external backend are
safe or isolated.

### Workspace-write

Workspace-write is a later accepted milestone, not an automatic consequence of
starting a child.

- The child may never exceed the parent's effective workspace and product
  authority.
- Plan mode cannot create a workspace-write child.
- Session grants and pending interactions are never inherited.
- The child receives its own permission decisions and attention state.
- Approval-mode behavior, when accepted, is evaluated for the child session;
  no parent approval is replayed as a child grant.
- Pi `write` and `edit` changes must be attributed to the child and associated
  with the parent in the accepted V3 review ledger.
- Shell, MCP, external-backend, and other mutations remain honestly outside
  V3 recovery unless a later accepted contract adds them.

Pho does not call renderer sandboxing, permission prompts, process separation,
or the accepted agent-tool sandbox a sandbox for the full child runtime.

## Execution and result contract

### Start and bounded Wait

Start and Continue return immediately after admission with:

- child id, current revision/state, and linked/background ownership;
- target, access, and elapsed time;
- currently valid Wait, inspect, message, Continue, or Stop actions.

The parent normally calls **Wait** with that child id. One Wait blocks for at
most 60 seconds and returns as soon as the child settles or needs attention. If
the child is still running at the bound, Wait returns current activity and the
same control reminder. The parent can wait again, inspect, steer/follow up, or
Stop. This is a server-side event wait, not renderer polling.

A terminal Wait also returns the bounded final result, reported usage/cost, and
an explicit truncation marker/inspector cursor when more detail exists. The
complete transcript stays in the child session; it is never copied wholesale
into parent model context.

No completion creates an automatic hidden prompt, synthetic user message, or
unsolicited parent turn. The explicit pull model keeps control with the parent.

### Linked and background ownership

Linked is the default: normal parent-turn settlement or Stop aborts a child that
is still running, so the parent must keep using bounded Wait until it settles or
choose Stop. Background is explicit: the child survives parent-turn settlement
or Stop, while remaining visible to the owner and still covered by child Stop,
Stop-all, the run deadline, and application shutdown. Both modes return the
child id immediately and use the same bounded Wait/inspect controls.

### Guidance and continuation

A child remains a real multi-turn session. The tool schema and every successful
`start` result name the immutable child id and remind the parent of its controls.
The owner or parent may send one of two active-run delivery modes:

- **Steer:** affect the current run through Pi steering;
- **Follow up:** queue a message for after the current run;

Unsupported delivery modes are absent or fail visibly. Pho never guesses which
kind of message the caller intended.

An idle child can also receive **Continue**, a new explicit phase with its own
prompt, linked/background ownership, and access request. Continue returns the
new run state/control handle immediately. This is the intended
explore-then-code path:

1. start the child read-only and use bounded Wait for exploration;
2. inspect its result/transcript;
3. call Continue on the same child with “implement this” context;
4. if `workspace-write` is requested, re-check the parent's current authority,
   permission policy, Agent mode, and exclusive writer lease before rebinding
   tools and admitting the turn.

Continue preserves the child's own transcript/context but does not copy new
parent turns implicitly. Access never elevates merely because the parent sends
more text. The child keeps its original model/reasoning target; changing target
creates a new child with a new identity rather than silently replacing the
session underneath the name.

### Stop

- The parent never needs to remember a hidden command: `list` returns active
  children and control availability, while each start/inspect result includes
  the exact `stop` action and child id.
- The Agents surface shows Stop beside every working/attention Pho child.
- The parent can call Stop between bounded Wait calls; the owner can click Stop
  at any time, including while the parent is inside a Wait call.
- Stopping or normally settling the parent turn aborts linked children; Stop
  also cancels the current Wait call.
- An explicitly background child survives parent-turn settlement or Stop.
- Accepted Stop-all includes every active child.
- Application quit aborts parent and child controllers concurrently under the
  accepted bounded shutdown contract.
- The 30-minute run deadline is a final backstop, not the primary stuck-run
  control; owner or parent Stop remains available immediately and is idempotent.

### Sibling communication

Direct child-to-child messaging is not in the first product. It would require
new child authority, addressing, rate/budget limits, loop prevention, message
ordering, stop propagation, and a visible audit trail.

The first product supports **parent-mediated relay** instead. The parent
inspects child A, selects the relevant bounded result or transcript excerpt,
and sends it explicitly to child B through Steer, Follow up, or Continue. The
relay text appears in B's transcript and in the parent's tool activity. This
achieves collaboration without invisible peer traffic.

## Concurrency and performance

Subagents share the accepted application budget rather than creating a second
process-manager policy:

- at most four product-active runs globally;
- a parent occupies one slot, so it can have at most three active children when
  no other chat is active;
- at most one active run per child session;
- child controllers count toward the existing eight-resident-controller bound;
- no hidden queue and no user-facing concurrency slider in the first release.

Capacity is reserved atomically before child creation. A start beyond the
available budget fails before provider work begins and reports current capacity.
The parent may retry after another run settles. This is simpler and more
transparent than an unbounded background queue.

Initial implementation bounds are 32 KiB of UTF-8 delegation text, a 24 KiB
model-visible result, 16 KiB paginated transcript inspection, and a 30-minute
child-run deadline. Milestone 0 must measure and may tighten these source-owned
bounds before protocol freeze. Renderer activity is coalesced to at most ten
updates per second per child; authoritative final snapshots still settle every
run.

The feature adds no polling loop per child. Event subscriptions exist only for
resident sessions and are released on eviction/disposal.

## User-visible contract

### Parent transcript

Starting a child creates one compact, persistent activity card in the parent's
narrative flow. The card shows:

- friendly name, role, backend/model, and access;
- prompt preview with exact-prompt expansion;
- linked/background ownership and bounded-Wait state;
- admitting/running/attention/completed/failed/stopped status as
  applicable;
- current activity and latest tool title, bounded and sanitized;
- elapsed time and reported usage;
- Open in Agents and Stop actions when relevant.

Status deltas update the live tail rather than rebuilding the transcript. The
settled card is a historical record, not a live embedded child conversation.

### Agents right-sidebar surface

Pho adds one **Agents** surface to the accepted floating right-sidebar host. It
uses the existing launcher, two-visible-tile cap, parked tray, resize behavior,
and visual tokens. Pho never opens one tile per child.

The surface contains a compact roster and one selected-child inspector:

- roster rows show identity, target, state, elapsed time, and attention;
- the inspector has Overview, Prompt & context, Transcript, and Activity views;
- owner controls provide exact message delivery, Stop, and transcript copy;
- selecting a child does not replace the main parent chat;
- clicking a parent card opens/focuses Agents and selects that child.

The surface is a task inspector, not a generic dashboard. The conversation
remains primary.

### Attention

A child's permission or user-input request belongs to that child. Switching
chats or tiles does not auto-approve, auto-deny, migrate, or dismiss it. The
existing global and per-session attention indicators include the friendly child
name. Opening the notification focuses the correct inspector/request.

### External backend-native collaboration

Pho-created children use the full identity, prompt, transcript, and control
contract above only in the Pho backend. Codex and Claude ACP keep their own
subagent implementation. Pho follows a strict projection ladder for each
external adapter:

| Backend evidence | Pho presentation |
| --- | --- |
| No native event/capability | Inform the owner that the backend may manage subagents but Pho cannot observe them. |
| Bounded activity only | Render **Backend-native subagent activity** in the parent transcript with no invented child identity or controls. |
| Stable child id/status/prompt metadata | Add a read-only native-activity row/inspector with exactly those fields and explicit unknowns. |
| Official open/steer/stop operation | Expose only the characterized control and label it backend-owned; never translate it into a Pho child command. |

Pho does not inject `pho_subagent` into Codex or Claude, persist a Pho
parent-child relationship for their native work, choose their subagent model,
or promise that Stop-all reaches native children unless the backend explicitly
supports and verifies it. A backend-native activity can appear in the same
Agents surface only when it has a stable adapter identity; otherwise it remains
a transcript row plus an information disclosure.

## Lifecycle and persistence

### Creation

Child creation is transactional:

1. validate the parent run and workspace;
2. resolve one exact available target;
3. reserve capacity;
4. create the fresh Pi-backed session;
5. persist the parent-child relationship;
6. bind events and permissions;
7. admit the prompt.

Failure before admission releases capacity and removes only incomplete
application metadata. It never permanently deletes a Pi transcript.

### Authority and source of truth

- Pi JSONL remains authoritative for a Pho child's transcript.
- Pho application metadata owns the relationship: immutable child id, parent
  key, Pi session key, friendly name, role, exact delegation prompt,
  target, access, timestamps, and last known outcome.
- Live working state is never trusted across application restart.

The relationship file lives under application data, is bounded and
schema-versioned, and is not encrypted at rest. It stores no provider secret,
authorization URL, hidden reasoning, or arbitrary raw backend event stream.

### Restart

On restart, Pho lazily restores relationship records and child summaries. A
previous `running` state becomes interrupted until reconciled with an
authoritative Pi session state. Pho never automatically resumes a model turn,
replays a prompt, or recreates a missing child.

### Archive and Trash

Archiving a parent hides it from the ordinary chat list but preserves its child
links. A background child may continue and remains visible through Archived and
Agents with the same activity state.

Moving a parent to Trash is refused while any linked child is active or needs
attention. For a settled parent, the confirmation names linked children and the
ownership boundary:

- Pho-owned relationship data and verified Pi child artifacts use the accepted
  recoverable OS Trash path;
- no permanent deletion or broad recursive cleanup is added.

Removing an individual child follows the same ownership rule and is unavailable
while it is active or needs attention.

## Failure behavior

| Failure | Required outcome |
| --- | --- |
| Target unavailable or changed | Reject before admission; never substitute another target. |
| Capacity exhausted | Reject with the active/available count; create no Pi session. |
| Pi session created but metadata save fails | Do not prompt; mark the orphan in diagnostics and offer a recoverable reconciliation path. |
| Prompt admission fails | Settle the child as failed with bounded runtime detail; keep the inspectable session/link. |
| One of several children fails | Other children continue; each tool result remains independently authoritative. |
| Child requests attention | Pause only that child; keep the request attached to its identity. |
| Continue requests broader access | Re-evaluate current parent authority and leases; deny visibly without changing the child if any gate fails. |
| Stop does not settle promptly | Keep the child visibly stopping, escalate to the accepted bounded teardown path, and never report it stopped early. |
| Parent session closes | Wait children are aborted; explicit background children remain until stopped, settled, or app shutdown. |
| Renderer reloads | Runtime work continues; the roster and cards reconstruct from application state. |
| App exits or crashes | No run is claimed alive after restart; no automatic replay or resume. |
| Full result exceeds context bound | Return an explicit truncation marker and child id; keep the full Pi transcript. |
| External native activity lacks stable identity/control | Render only the bounded activity/disclosure actually supported; invent nothing. |

Child output is untrusted model content. It is delimited as a tool result,
sanitized for rendering, and never treated as a system instruction merely
because it came from another agent.

## Relationship to existing work

- [V2 Milestone 3](../../archive/v2/implementation-plan-v2.md) owns independent
  session controllers, global run/residency bounds, attention, archive/Trash,
  restart, and shutdown. Children must use those contracts.
- [Plan/Agent](../../archive/features/plan-agent/product.md) owns Plan policy and
  structured ask-back. Plan permits only read-only children.
- [Approval modes](../approval-modes/product.md) owns future automatic-review
  semantics. Child authority remains a separate session evaluation.
- [V3](../../archive/v3/product.md) owns attributable Pi `write`/`edit` review and
  recovery; it does not become generic multi-backend rollback.
- [Agent-tool sandbox](../../archive/features/sandbox/product.md) owns current
  Pi tool containment claims and limitations.
- [V5](../../version/v5/product.md) owns the broader backend-neutral host and
  remains blocked. This add-on consumes the existing seam without advancing
  Task Brief, evidence, or Pho Research milestones.
- [V4](../../version/v4/product.md) owns held process extraction and public-beta
  distribution. A child session is not a separate OS security boundary.
- [Conversation UI](../../ui/implementation/conversation-ui.md) owns the shared
  transcript and right-sidebar host chrome.
- [Future roadmap Phase E](../../version/roadmap-vnext.md) continues to own
  worktrees, branches, conflict reconciliation, and integration preview.

## What nesting and workflows mean

**Nesting** means a Pho child can call the orchestration tool and create its own
children, producing a parent → child → grandchild tree. It is excluded because
depth multiplies cost and concurrency while making authority ceilings, Stop,
attention, naming, and result ownership harder to understand. The first product
has exactly one Pho-owned level.

**Workflows** means predefined orchestration recipes or graphs such as “run
three scouts in parallel, feed their results to a planner, then send the plan to
a builder and reviewer,” with conditions, retries, handoffs, and stored steps.
Pho does not add a workflow file, DSL, template, or UI. The parent agent creates
and continues children dynamically through ordinary `pho_subagent` calls.

Parent-mediated relay is not a workflow engine: it is one explicit, visible
message chosen by the parent between existing child sessions.

## Non-goals and deferred work

- nested Pho subagents or recursive delegation;
- worktree creation, branch ownership, merging, conflict resolution, or push;
- user, project, or package-defined agent/persona files;
- ambient extension, skill, prompt, MCP, package, or executable discovery;
- generic provider, backend, or CLI-adapter configuration;
- automatic model routing, benchmarking, or cheapest-model selection;
- copied parent transcripts, context forks, memory, or hidden handoffs;
- workflow graphs, chains, councils, missions, artifacts, or scripting;
- scheduled, durable, daemonized, or post-quit work;
- direct child-to-child chat, mentions, broadcast, or shared scratchpads;
- automatic integration of child code changes;
- injecting Pho orchestration into Codex or Claude ACP, or treating their native
  collaboration as Pho-owned;
- a generic process manager, agent marketplace, or new Settings engine;
- moving Pi or external backends into a new process under this feature;
- remote publication, deployment, push, or other owner-external mutation.

## Final acceptance outcomes

The add-on is accepted only when:

1. a Pho-backend parent can start a fresh read-only Pho/Pi child against every
   advertised configured model/reasoning target;
2. the owner can inspect the exact delegation prompt, target, context layers,
   tool/access posture, live activity, full transcript, usage, and final result;
3. ask-back uses the accepted Pho/Pi interaction path and no unavailable target
   is selected silently;
4. fun names remain accessible labels while immutable ids own every command and
   event;
5. wait, background, steer, follow-up, Continue, Stop, Stop-all, renderer
   reload, restart, archive, and recoverable removal follow the lifecycle above;
6. the parent can always rediscover and stop a child by immutable id, and an
   explore-then-code continuation rechecks authority before tool rebinding;
7. read-only enforcement is proven for every advertised Pho target;
8. any workspace-write milestone proves separate permission state,
   parent-authority ceiling, child attribution, and honest recovery limits;
9. concurrent children stay inside the accepted global run/controller bounds
   and live updates do not regress transcript responsiveness;
10. parent-mediated sibling relay is visible and direct peer messaging is
    unavailable;
11. Codex/Claude native subagent behavior remains visibly backend-owned, with
    only adapter-proven metadata and controls rendered;
12. unit, real-SDK integration, Electron, packaged, provider-backed, and owner
    acceptance evidence is recorded at the level actually run.

Until all relevant milestones pass, partial delivery must be described by its
verified target/access matrix rather than as general “subagent support.”

## Research references

- [`tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents) informed
  isolated-session visibility, live child inspection, steering, and explicit
  concurrency. Pho does not adopt its workflows, scheduling, nesting,
  worktrees, ambient definitions, or TUI architecture.
- [`nicobailon/pi-subagents`](https://github.com/nicobailon/pi-subagents)
  informed role labels, a fleet inspector, focused child transcripts, and
  bounded delegation. Pho does not adopt its profiles, missions, workflow
  system, external CLI adapters, or discovery model.
- The installed pinned Pi SDK and its official subagent example remain the API
  source of truth for Pi session construction. Pho uses the embedded SDK rather
  than launching a globally installed `pi` CLI.

Research is inspiration only. No upstream code or dependency is copied by this
documentation slice. Any later material adaptation must record the exact
revision, license, destination, and extent in
[`references-and-attribution.md`](../../references-and-attribution.md).
