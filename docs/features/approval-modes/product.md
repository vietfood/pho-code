# Product definition: approval modes and automatic review

## Status

Owner-approved standalone add-on, promoted 2026-09-01. Status is
**In implementation**.

Pi Milestones 0–3 are implemented and machine-verified as of 2026-09-01, but
the feature is not accepted until the owner completes the real-provider and
desktop checks in [`handoff.md`](./handoff.md). External-backend mode mapping is
still held with V5. The delivery contract is
[`implementation-plan.md`](./implementation-plan.md), implementation evidence
is [`logs/2026-09-01-m0-m3-pi-implementation.md`](./logs/2026-09-01-m0-m3-pi-implementation.md),
and the research/promotion record is
[`logs/2026-09-01-research-and-promotion.md`](./logs/2026-09-01-research-and-promotion.md).

This add-on is not Plan/Agent, not V3 change review, not a replacement agent
loop, and not V4 process extraction. It may change their owner-facing chrome or
use their accepted seams, but it does not take over their ownership.

## Owner outcome

Pho Code presents one understandable answer to “how independently may this
chat act?”:

| Owner-facing mode | Outcome |
| --- | --- |
| **Ask for approval** | Routine work runs inside the selected workspace boundary. The owner reviews eligible requests for additional access. |
| **Approve for me** | The same routine boundary remains. A separate reviewer evaluates eligible requests for additional access and interrupts the owner only when it cannot safely decide or policy requires the owner. |
| **Full access** | Routine sandbox and approval routing are bypassed for this chat. The agent can use the local account's broad filesystem and network authority, subject to Pho Code's non-bypassable product invariants, backend restrictions, service permissions, and the operating system. |

The default is **Ask for approval**. The owner can opt into automatic review for
long work without equating “no prompt” with “no policy,” and can deliberately
choose Full access when they accept its consequences.

The conversation remains primary. This feature is one compact composer control,
existing interaction/tool activity, and typed Settings—not a security dashboard.

## Why this replaces the current owner model

Pho Code currently exposes three managed permission profiles, a preserved
Custom state, a separate YOLO switch, project-rule trust, and a separate Sandbox
section. Those controls describe real behavior, but they combine different
questions in one owner workflow:

1. What local resources can the agent reach?
2. Which actions are always blocked, allowed, or reviewable?
3. Who resolves a reviewable action?
4. Is the agent planning or acting?
5. Have already-applied file changes been reviewed?

Modern approval modes answer question 3 while presenting a coherent default for
questions 1 and 2. Plan/Agent continues to answer question 4. V3 continues to
answer question 5. The final product removes managed profile and YOLO jargon
from the normal owner path instead of adding “Auto” as another profile.

## Product vocabulary

| Term | Meaning |
| --- | --- |
| **Mode** | Per-chat choice of human review, automatic review, or broad bypass. Internal values are `ask`, `auto`, and `full`; the owner sees the labels above. |
| **Boundary** | Filesystem, network, process, and tool authority available without an elevation. Ask and Approve for me share the same default boundary. |
| **Policy** | Deterministic allow, review, require-owner, or deny rules over a proposed action. Policy is not a mode. |
| **Reviewer** | The resolver for an eligible review request: owner in Ask, isolated automatic reviewer in Approve for me, none in Full access. |
| **Elevation** | One exact action or normalized session capability allowed beyond the normal boundary. It is not a Settings rewrite. |
| **Product invariant** | A deterministic restriction Pho Code does not let the agent bypass through any mode. |
| **Post-change review** | V3's ledger workflow over changes already applied to disk. It does not authorize a future tool call. |

“Automatic review” names the mechanism. **Approve for me** is the compact owner
label. “Auto-approve,” “YOLO,” “bypass,” and “sandbox off” are not synonyms for
Approve for me.

## Trust and threat model

This feature continues Pho Code's personal, selected-workspace trust model:

- the owner trusts the selected workspace for ordinary coding work;
- source-reviewed baked features still execute in the app process;
- Pi extensions are not contained by the agent-tool sandbox;
- external Codex and ACP/Claude agents retain their own process, loop, tool,
  authentication, configuration, and update ownership;
- macOS is the first acceptance platform; Linux behavior must remain explicit
  and compatible, not silently weaker;
- public/adversarial hardening remains outside this add-on.

The feature reduces accidental, over-broad, confused, or prompt-injected tool
use. It does not make a probabilistic reviewer a security proof. It does not
contain malicious in-process extension code, a compromised backend, the owner
terminal, another local process, or an owner who selects Full access. Renderer
`sandbox: true`, confirmation dialogs, automatic review, and process separation
must never be described as an OS sandbox for the Pi runtime.

## Selected product decisions

| Decision | Selection |
| --- | --- |
| Owner modes | Exactly Ask for approval, Approve for me, Full access. No managed profiles or YOLO in the ordinary UI. |
| Default | Ask for approval. Full access can never be the new-chat default. |
| Scope | Mode belongs to one backend-pinned chat, not the workspace, project file, model, or renderer. |
| Plan relationship | Plan/Agent is independent. Entering Plan never changes the approval mode; Execute uses the chat's current approval mode. |
| Ask vs Auto boundary | Identical default workspace/sandbox policy. Only reviewer ownership changes. |
| Routine work | Deterministic in-boundary allows do not call a reviewer and do not prompt. |
| Automatic review | Separate, capability-limited reviewer session over one frozen action. Never mechanical YOLO. |
| Automatic decisions | Allow exact action, deny, require owner, or fail unavailable. Automatic review cannot create a session grant or select Full access. |
| Failure | Fail closed. The action does not execute; an interactive session asks the owner, and a background session enters attention state. |
| Full access | Explicit, per-chat, memory-only across process lifetime, visibly dangerous, never inferred during migration. |
| Product invariants | Permanent deletion, privilege escalation, destructive Git recovery bypass, and agent modification of safety controls remain unavailable in every mode. |
| Settings | Typed feature controls only. No generic rule editor, arbitrary reviewer prompt, executable path, JSON schema, or project-controlled default mode. |
| Project policy | May strengthen contained-mode policy after trust. Explicit project denies also remain denies in Full; project ask/require-owner rules do not recreate routine prompts after the owner deliberately selects Full. A project cannot choose Auto/Full, choose the reviewer, grant external paths/network, or weaken product invariants. |
| External backends | Capability-negotiated native mapping only. Unsupported modes are hidden/disabled; blind “allow” selection is forbidden. |
| V3 wording | Owner-facing post-change **Approve** becomes **Mark reviewed**. Its accepted ledger state and disk behavior do not change. |

## Mode contract

### Ask for approval

Ask for approval is the safe, capable default:

- healthy agent-tool containment is required for routine Pi `bash`;
- workspace and explicitly configured in-boundary file operations use the
  accepted in-process file policy;
- routine read, search, edit, test, and build actions run without a dialog when
  policy and containment already permit them;
- an eligible boundary crossing creates the existing compact approval dock;
- the dock offers **Allow once**, **Allow for this session**, and **No, provide
  reason**;
- the owner sees the exact command, path, destination, tool, or capability being
  requested—not an agent-authored summary alone;
- a session grant is normalized, bounded, revocable, memory-only, and scoped to
  the backend, workspace, session, tool/effect, and policy generation;
- denial returns the owner's optional reason to the agent and does not encourage
  policy workarounds.

Ask does not mean “ask before every edit.” It means routine in-boundary work is
pre-authorized by the product boundary and the owner reviews meaningful
elevations.

### Approve for me

Approve for me uses the same deterministic policy, workspace roots, sandbox,
network policy, protected paths, and tool ownership as Ask. When Ask would show
an eligible elevation, Auto sends the exact request to an isolated reviewer.

The reviewer may:

- **allow once** for this exact request;
- **deny** with a short actionable rationale;
- **require owner** when risk, authorization, ambiguity, policy, or reviewer
  confidence requires a human decision;
- return **unavailable** on timeout, cancellation, missing authentication,
  incompatible model, malformed output, or provider failure.

`require owner` and `unavailable` open the same owner approval dock. They are
not covert allows. A denied action remains denied unless the agent proposes a
materially safer action or the owner explicitly authorizes one exact retry from
the decision UI. Even that retry passes deterministic policy and automatic
review again.

Automatic review is intended to remove routine approval fatigue, not remove the
owner from high-impact decisions. The reviewer must require the owner for
credentials/private data, production or shared infrastructure mutation,
financial/publishing/account effects, durable machine persistence, access-control
changes, and other release-owned high-impact categories unless a stricter rule
denies them outright.

### Full access

Full access bypasses Pho Code's normal workspace/network containment and
human/automatic approval routing for the selected chat. It permits broad local
file and network use with the same authority as the application process and the
selected backend, subject to:

- operating-system account permissions;
- external service, OAuth, MCP, and backend-enforced controls;
- Pho Code's non-bypassable product invariants;
- renderer and Electron security boundaries, which remain unrelated;
- tools the product actually exposes.

Full access therefore does not promise root, arbitrary platform APIs, arbitrary
MCP servers, or tools that do not exist. Its UI disclosure must say what Pho Code
still blocks. It must also state that files, credentials, network data, and
external systems can be damaged or exposed and that prompt injection can cause
unintended actions.

Full access has no reviewer and no approval prompts from the Pho-owned mode
layer. A backend or external service may still require its own confirmation.
The mode is never entered because a reviewer, model, project file, skill, or
permission request asked for it.

## Policy and enforcement order

Every Pho-owned tool request follows one ordered decision pipeline. The first
terminal decision wins:

1. Validate backend/session/run identity and freeze the exact JSON-safe input.
2. Canonicalize paths, destinations, command/effect metadata, and provenance.
3. Apply non-bypassable product invariants.
4. Apply trusted project restrictions that can only strengthen the floor. In
   Full, an explicit project deny remains terminal while review/require-owner
   rules yield to the owner's deliberate bypass selection.
5. Apply the active mode's boundary and deterministic allow/review/deny policy.
6. Resolve an eligible review through the owner, automatic reviewer, or Full
   access bypass.
7. Revalidate identity, input fingerprint, path/symlink resolution, policy
   generation, grant scope, run state, and cancellation immediately before
   dispatch.
8. Execute once through the owning tool/backend.
9. Record a redacted decision and project normal tool activity.
10. Let V3 capture successful Pi `write`/`edit` changes after execution as it
    already does.

No later allow may override an earlier product-invariant deny. Neither renderer
state nor agent-authored text is an authority source.

## Non-bypassable product invariants

The following remain deterministic denies in Ask, Approve for me, and Full
access:

- permanent filesystem removal through agent commands; the agent uses the
  application-owned recoverable Trash path instead;
- privilege escalation such as `sudo` or `doas` from agent tools;
- destructive Git history/worktree operations that defeat the product's
  recovery contract, including the existing force-clean/reset/restore class;
- modifying, removing, or bypassing Pho Code's active approval/sandbox control
  files, packaged policy, reviewer instructions, grant store, or authorizer
  registration through agent tools;
- weakening TLS/authentication controls, installing durable local persistence,
  or modifying shell/service startup when the release-owned invariant policy
  identifies the action deterministically;
- using a project rule, skill, tool result, or renderer payload to grant a
  broader mode or reviewer authority;
- executing a tool input that differs from the input that was allowed.

This list may grow when a release adds a deterministic critical guard. It may
not shrink silently. A change requires a product decision, tests, and an owner
review; it is not an arbitrary Settings toggle.

## Default review policy

The release-owned policy classifies effects, not only tool names. The same tool
may be allowed, reviewed, require the owner, or denied according to target and
effect.

| Effect class | Ask | Approve for me | Full access |
| --- | --- | --- | --- |
| Read/search inside workspace, excluding protected targets | Allow | Allow | Allow |
| Write/edit inside workspace, excluding protected targets | Allow through in-process policy; V3 captures | Same | Allow; V3 captures supported Pi tools |
| Routine sandboxed workspace command | Allow | Allow | Allow unsandboxed by this mode layer |
| Public web search | Allow | Allow | Allow |
| Public bounded fetch or network read | Owner review unless already in policy | Automatic review | Allow |
| Additional filesystem root or network destination | Owner review | Automatic review or require owner | Allow |
| Package install declared by the current manifest/lockfile | Owner review when it needs elevation | Automatic review | Allow |
| Git commit or push to the current non-protected branch | Owner review unless explicitly session-granted | Automatic review | Allow |
| Secret/private-data access or transmission | Owner only; exact target and destination | Require owner or deny | Allow with Full-access warning already active |
| Production/shared infrastructure, deploy, publish, payment, IAM, or account mutation | Owner only or deny by typed integration policy | Require owner or deny | Allow only if the owning tool/service also permits it |
| Irreversible destruction, privilege, destructive Git, or safety-control bypass | Deny | Deny | Deny product invariant |
| Unknown or untyped side-effecting tool | Owner review | Automatic review defaults conservative | Allow only if the backend/tool exposes it under Full access |

The table is the product default, not a shell parser guarantee. Milestone 0 must
characterize the exact effects available from the pinned permission package and
each tool. Unknown side effects never enter a deterministic allow fast path.

## Exact elevations and session grants

An elevation is a capability record, not “yes to whatever the agent does next.”
It contains:

- backend, workspace, session, run, and request identity;
- tool/effect class and exact canonical targets;
- frozen input fingerprint;
- reviewer source and decision timestamp;
- one-use or session scope;
- policy and workspace generations;
- expiry and revocation state.

**Allow once** is consumed by one matching dispatch. **Allow for this session**
is available only from the owner and matches a normalized capability, not a
free-form command prefix. Session grants expire on application restart, session
replacement, backend/workspace change, mode change, policy change, explicit
revoke, or controller disposal. Automatic review can create only one-use grants.

For file tools, an elevation targets exact canonical paths. For network-aware
tools, it targets exact destinations and operation classes. For shell commands,
the exact command, working directory, environment class, and known effect scope
are locked. When the OS sandbox can express a narrower temporary grant, Pho Code
uses it. When it cannot, the approval must disclose that the one command will
run outside the ordinary sandbox; policy may require the owner rather than let
automatic review approve that broader elevation.

Pho Code never edits durable Sandbox settings as a side effect of approval and
never silently retries a sandbox failure without the approved elevation.

## Automatic reviewer contract

### Isolation and authority

The Pho-owned reviewer is a separate model call/session with a single job: decide
whether one proposed elevation is consistent with direct owner intent and the
active policy. It cannot:

- run the pending action;
- change mode, Settings, project trust, or grants;
- write files, use network, call MCP, spawn agents, or access secrets;
- see hidden model reasoning;
- return arbitrary executable instructions as a decision.

It may request bounded read-only checks through a reviewer-only interface over
the active workspace. Those checks remain inside the ordinary boundary, are
attributed to the review, and cannot inspect the pending protected target merely
to decide whether access to that target is authorized.

### Evidence and provenance

The reviewer receives:

- the exact untruncated pending tool input within the protocol's hard bound;
- normalized action/effect, paths, destinations, working directory, and scope;
- active mode, boundary, trusted project restrictions, and applicable rule IDs;
- a compact, token-budgeted transcript that preserves the first and latest
  direct owner messages and relevant recent actions;
- surfaced assistant updates, tool calls, and bounded tool outputs only with
  explicit **untrusted** provenance;
- prior decisions and an exact owner override marker when applicable.

Direct owner chat can establish intent, but only the permission dock or decision
override creates a capability grant. `ask_user_question`, plan comments, project
files, assistant prose, tool results, web pages, and MCP output are not permission
grants. Prompt-injected content remains untrusted even when the main agent quoted
or summarized it.

### Decision behavior

The reviewer uses one strict, versioned structured response. Extra prose,
Markdown wrappers, unknown fields, missing rationale, invalid enum values, and
schema violations are failures, not allows.

The reviewer policy prioritizes:

1. direct, current owner intent;
2. least privilege and exact scope;
3. whether untrusted content caused the action;
4. target ownership and environment sensitivity;
5. reversibility and blast radius;
6. credential, privacy, persistence, external-side-effect, and supply-chain risk;
7. safer ways to complete the same requested outcome.

A denial tells the main agent not to pursue the same outcome indirectly or to
circumvent policy. It may continue only with a materially safer alternative;
otherwise it stops and asks the owner.

### Model selection and failure

Settings offers **Automatic** and an optional explicit authenticated reviewer
model. Automatic uses a release-approved, structured-output-capable model and
shows the effective provider/model in Settings diagnostics. It may use the
current Pi model only through a distinct reviewer session and only if that model
meets the reviewer capability/evaluation floor.

Resolution may try another compatible channel only when a model is absent,
unauthenticated, or rejected before review begins. A timeout is terminal for the
request; Pho Code does not send the same sensitive review to another provider
after an uncertain timeout. The release-owned deadline is bounded and recorded
in implementation evidence, not exposed as an arbitrary owner setting.

On timeout, cancellation, provider failure, malformed response, missing model,
or open circuit, the action stays blocked and the owner is asked. The main agent
never interprets failure as approval.

### Denial circuit breaker

Per turn, automatic review interrupts the run after either:

- three consecutive denials; or
- ten denials in the rolling last fifty review decisions.

Any non-denial resets the consecutive counter. A repeated exact request does not
receive unlimited reviews. When the breaker opens, Pho Code cancels pending
review work, marks the chat as needing attention, and explains that the agent
must wait for owner direction.

The owner may select one recent overridable denial and authorize one exact retry.
The retry remains subject to product invariants and automatic review; an
invariant or release policy can deny it again.

## Sandbox and boundary relationship

The accepted [agent-tool sandbox](../../archive/features/sandbox/product.md)
remains the containment implementation. This feature changes how the owner
selects its effective posture:

- Ask and Approve for me require the sandbox and file policy to be enabled and
  healthy for routine Pi agent tools;
- Full access is the deliberate per-chat path that bypasses that routine
  containment;
- the current durable network/domain/additional-path controls remain the
  advanced boundary definition for contained modes;
- the current general **Enable sandbox** switch is retired from the normal UI so
  “sandbox off” cannot become an unlabeled fourth mode;
- a contained-mode initialization failure blocks agent `bash` and surfaces an
  owner action; it never silently becomes Full access;
- the owner terminal, MCP servers, Cursor SDK tools, baked extensions, and
  external backends remain governed by their own documented boundaries.

At implementation, the active sandbox contract and architecture must be updated
without rewriting its archived acceptance evidence.

## External backend contract

Approval modes are a backend capability, not a renderer assumption.

| Backend | Ownership and final behavior |
| --- | --- |
| Embedded Pi | Pho Code owns the base policy, sandbox integration, manual approvals, automatic reviewer, exact grants, and Full-access posture. All three modes are acceptance scope. |
| External Codex | Codex owns its sandbox, approval policy, automatic reviewer, and Full-access mechanics. Pho Code maps only app-server operations/configuration characterized against the supported external installation. It does not run Pi's reviewer or policy over Codex tools. |
| External ACP/Claude | The ACP agent owns its permission modes. Ask uses stable `session/request_permission`. Auto or Full appears only when the negotiated agent exposes a stable, characterized mode/configuration capability. Pho Code never emulates Auto by blindly selecting an approval option. |
| Future backend | Must advertise supported modes, ownership, and limitations. Absence means Ask-only or no approval-mode control according to the backend's honest capability. |

The backend descriptor must distinguish support for Ask, Auto, and Full rather
than exposing one ambiguous `approvals` flag. Switching backend creates or
selects a distinct backend-pinned session; mode and grants never transfer.

The final product does not require every backend to implement every mode. It
requires every advertised mode to be real, tested, and accurately owned. V5
continues to own external process/configuration/authentication integration.

## User-visible contract

### Composer control

A compact shield control lives in the composer footer beside the existing
Agent/Plan, model, and thinking controls. It shows the active mode by icon,
accessible name, tooltip, and color; narrow layouts may show the icon only.

The menu contains the supported modes in this order:

1. **Ask for approval** — “You review requests beyond the workspace boundary.”
2. **Approve for me** — “A separate reviewer checks requests for additional
   access. It can make mistakes.”
3. **Full access** — “Runs without Pho Code's normal sandbox or approval
   prompts. High risk.”

Unsupported backend modes are omitted or disabled with a short backend-owned
reason. The menu never shows internal profile names, YOLO, authorizer-chain
terms, or raw backend config.

Mode changes are idle-only. Changing a mode cannot retroactively resolve a
pending request. A live run must be stopped or settled first.

### Automatic-review activity

An eligible auto review appears as compact tool activity such as **Reviewing
access…**. It must not print reviewer prompts, hidden reasoning, raw policy, or
secret-bearing input into the transcript. On settlement it shows one of:

- approved automatically;
- blocked automatically, with a bounded rationale;
- owner decision needed;
- reviewer unavailable.

Only the last two create an attention dock. Background chats receive the normal
attention badge and remain correctly attributed without forcing navigation.

### Full-access warning

Full access is unavailable until enabled in Settings. The first selection in an
application process shows a blocking warning that names filesystem, network,
credential, prompt-injection, data-loss, and external-side-effect risk and lists
the product invariants that still hold. Cancelling leaves the prior mode.

While active:

- the composer shows a persistent red/high-risk mode indicator;
- the tooltip and menu say that routine containment and approval review are off;
- no “safe,” “sandboxed,” or automatic-review badge appears for unsandboxed
  actions;
- hiding Settings or switching chats does not hide the selected chat's state.

Full access survives ordinary chat switching while its session controller stays
resident. It resets to Ask on application restart, archive/resume, backend or
workspace identity change, session replacement, or policy incompatibility.

### Permission and denial surfaces

Ask and owner-escalated Auto use the accepted quiet three-option permission
dock. The exact target is primary; explanatory copy stays short. The owner can
inspect why automatic review escalated without opening a generic log viewer.

Automatic denial is ordinary attributed work activity, not a fake user denial.
If an exact override is allowed, the action is **Allow one retry**. There is no
one-click “disable protections” or “switch to Full access” action on a denial.

### V3 terminology

The Changes tile action becomes **Mark reviewed**. It still means “close this
already-applied ledger item,” not “authorize a future command,” and it still does
not write, stage, commit, or make a file more persistent. Undo and conflict
semantics remain unchanged.

## Settings contract

Settings → Permissions becomes the typed control surface for this feature:

| Control | Default | Behavior |
| --- | --- | --- |
| New chats | Ask for approval | May be Ask or Approve for me when Auto is enabled and available. Never Full access. |
| Enable Approve for me | Off until acknowledged | Adds Auto to supported composer menus. Enabling does not change existing chats. |
| Reviewer model | Automatic | Optional explicit authenticated Pi reviewer model. Hidden/disabled for backend-native review. |
| Decision history | On | Stores redacted local decision metadata. Raw reviewer input/output is never stored by default. |
| Enable Full access | Off | Adds Full access where the backend supports it. Enabling does not select it. |
| Active boundary | Existing typed Sandbox controls | Network mode, domains, and extra paths define contained-mode authority. Enable/disable is derived from mode. |
| Legacy custom policy | Compatibility state only | Explains why migration is paused and offers one explicit move to Pho approval modes. No generic editor. |

Settings remains idle-safe and typed. It does not expose reviewer prompts,
arbitrary policy text, executable paths, raw permission JSON, project defaults,
or backend config files.

## Migration contract

Migration must never broaden authority silently.

| Current state | New state |
| --- | --- |
| Guarded | Ask for approval |
| Balanced | Ask for approval |
| Developer, YOLO off | Ask for approval |
| Developer, YOLO on | Approve for me only after Auto is enabled and available; otherwise Ask. Never Full access. |
| Sandbox disabled | Ask with contained boundary re-enabled; explain that Full access is the deliberate replacement for unsandboxed agent work. |
| Custom global permission config | Preserve the file and enter Ask-only compatibility state until the owner explicitly migrates. |
| Project permission override | Re-parse as strengthening rules only; refuse weakening or mode-selection fields and require existing project trust. |

The migration writes a versioned application-owned record and preserves a
bounded backup/reference to the prior app-owned managed configuration. It does
not delete the Pi permission log, custom policy, credentials, sessions, or
project files. Shared `PHO_CODE_AGENT_DIR` scope receives an explicit warning
before any managed config write.

Legacy `yoloMode` stops controlling runtime behavior after successful migration.
It may remain in a preserved compatibility file but does not reappear as an
owner mode.

## Lifecycle

| Event | Required behavior |
| --- | --- |
| Create chat | Use typed new-chat default after backend capability resolution; fallback to Ask with notice. |
| Open existing Ask/Auto chat | Restore its durable mode if still enabled/supported; otherwise Ask with a bounded reason. |
| Select Full access | Require availability, idle session, warning acknowledgement, and privileged runtime commit. |
| Switch chat | Preserve each resident chat's mode and pending reviewer ownership independently. |
| Start run | Snapshot mode, policy generation, boundary, and backend capability for each admitted action; never trust renderer state. |
| Change model | Re-evaluate automatic-review model compatibility before the next run. Do not silently change mode mid-run. |
| Pending owner approval | Hold exact action; Stop/Stop-all cancels it through accepted teardown. |
| Pending automatic review | Abort signal cancels reviewer; late decisions cannot execute. |
| Reviewer failure | Keep action blocked; owner attention in interactive/background UI. |
| Mode change | Idle-only; revoke session grants and increment policy generation. |
| Workspace/backend/session replacement | Cancel requests, revoke grants, resolve capability, and default safely. |
| Archive/resume | Full resets to Ask; Ask/Auto may restore if supported. No pending request survives. |
| Renderer reload | Main/runtime remains authoritative; a current snapshot restores visible state. |
| App restart | Full and all grants reset. Ask/Auto and typed Settings restore after validation. |
| Quit | Cancel reviewer calls and pending approvals under bounded shutdown before controller disposal. |

## Data, privacy, and observability

| Data | Owner | Persistence | Renderer projection |
| --- | --- | --- | --- |
| Mode availability, new-chat default, reviewer choice, history preference | Application settings adapter | Application data | Typed bounded snapshot |
| Per-chat Ask/Auto selection | Application metadata keyed by backend/workspace/session | Durable | Current session snapshot |
| Full-access selection | Privileged runtime/controller | Memory only | Current session snapshot with risk state |
| One-use/session grants | Privileged runtime | Memory only | Redacted count and revocation affordance |
| Reviewer context/session | Reviewer service | Memory only | State and bounded rationale only |
| Decision history | Application-owned approval log | Bounded rotation/retention; not encrypted at rest | Redacted entries on explicit inspection |
| V3 ledger | Existing V3 owner | Unchanged | Unchanged except label |
| Pi permission config/log | Permission feature/compatibility adapter | Preserved through migration policy | No raw JSON or secrets |

Decision history stores timestamp, composite session identity, mode, tool/effect
class, redacted/canonical target class, decision source, outcome, rule ID,
latency, reviewer model identifier, and bounded rationale. It does not store raw
commands, file contents, tokens, credentials, full tool output, hidden reasoning,
or raw reviewer IO by default.

The Settings disclosure must state that:

- reviewer context is sent to the selected model provider;
- reviewer calls may add latency and provider usage/cost;
- decision metadata is local and not encrypted at rest in the personal product;
- Full access removes routine Pho-owned containment and review;
- automatic review can make mistakes.

This local record is feature observability, not V4 diagnostics/export or a
public compliance log.

## Concurrency, ordering, and cancellation

- Every review is keyed by composite backend/workspace/session, run, request,
  and input fingerprint.
- One session resolves approval requests in action order. A bounded global
  reviewer pool prevents four background runs from creating unbounded model
  work.
- A decision for a stale run, replaced session, changed mode, changed policy,
  revoked grant, mutated input, or cancelled request is discarded.
- Multiple UI subscribers may observe one request; only the privileged runtime
  can settle it once.
- Stop, Stop-all, disposal, and backend cancellation settle owner prompts and
  reviewer work before a tool can continue.
- Reviewer deltas are not transcript truth. Only the final validated decision
  authorizes dispatch.

## Accessibility and performance

- The composer control, menu, warning, review activity, approval dock, and
  revocation actions require semantic controls, keyboard operation, visible
  focus, screen-reader names, and reduced-motion behavior.
- Color never carries mode or decision meaning by itself.
- Routine deterministic allows add no model call and no transcript rerender.
- Reviewer state updates are keyed to the affected tool/request, not the whole
  transcript.
- Background attention does not steal focus or select a chat.
- The final acceptance review records measured reviewer latency and failure
  behavior; no latency claim exists before measurement.

## Relationship to other workstreams

| Workstream | Relationship |
| --- | --- |
| Permission feature | Remains the Pi decision/enforcement seam. Managed profiles and YOLO leave the owner path; the package is not forked. |
| Agent-tool sandbox | Supplies the contained boundary for Ask/Auto. The archived evidence remains history; living architecture changes when implementation lands. |
| Plan/Agent | Independent per-chat axis. Plan tools remain allow-listed; Execute obeys the current approval mode. Ask-user is not a permission grant. |
| V3 Changes | Post-change review remains independent. Only the owner label changes to Mark reviewed. |
| Integrated terminal | Owner PTY remains outside agent approval modes and must stay disclosed as unsandboxed. |
| Context compaction | Reviewer context selection must respect authoritative transcript/compaction boundaries but does not change compaction. |
| V5 Pho Agent | Owns backend-neutral capability descriptors and external Codex/ACP adapter integration. The add-on does not absorb external installation/auth/config. |
| V4 Public Beta | No signing, notarization, diagnostics export, update, or Pi-process extraction work enters this feature. |
| Conversation UI | Owns shared composer/dialog/tool chrome; this feature owns approval semantics and mode-specific copy. |

## Non-goals

This feature will not:

- claim that automatic review is deterministic safety or OS containment;
- treat YOLO, a permission profile, sandbox enablement, or auto-accept edits as
  Approve for me;
- add a generic permission/policy/reviewer-prompt editor;
- accept project-controlled mode defaults, Full-access requests, reviewer
  selection, or policy weakening;
- install `pi-automode`, `nah`, Pi Approval Guardian, or another ambient Pi
  package at runtime;
- copy an external guard's policy/code without license review and attribution;
- wrap the owner terminal, arbitrary MCP servers, malicious extensions, or the
  Pi process and call that solved;
- make unsupported external-backend modes appear through automatic “allow”
  responses;
- change external backend installation, authentication, configuration, or
  update ownership;
- provide Full access as a persistent default or migration result;
- permanently delete files or bypass recoverable Trash;
- turn V3 into pre-execution patch approval or promise shell/MCP Undo;
- absorb V4 public distribution, diagnostics, or utility-process contracts.

## Final acceptance outcomes

The add-on is accepted only when all of the following are true:

1. The three owner-facing modes have the exact semantics in this contract.
2. Ask and Approve for me demonstrably share one contained boundary and differ
   only in eligible reviewer ownership.
3. Routine in-boundary Pi work does not prompt or call the reviewer.
4. Automatic review is isolated, structured, input-locked, cancellable,
   observable, fail-closed, and provider-backed verified.
5. Product-invariant, prompt-injection, secret, production, persistence,
   destructive, and policy-bypass evaluation cases cannot become false allows.
6. Owner escalation, exact one-use override, session grants, revocation, circuit
   breaking, background attention, and teardown are verified.
7. Full access is explicit, memory-only, persistently visible while active, and
   reset on every contracted boundary event.
8. Migration never grants Full access, never silently overwrites Custom, and
   preserves unrelated Pi/project data.
9. Every backend advertises only modes it really implements; external native
   ownership is verified rather than emulated.
10. V3 says Mark reviewed without changing accepted ledger semantics.
11. Unit, real-Pi integration, real Electron, provider-backed reviewer,
    external-backend (where advertised), and unsigned packaged macOS gates pass.
12. Living architecture/current-state/development docs, UI logs, feature logs,
    attribution, and an independent acceptance review are complete.

## References

- Implementation: [`implementation-plan.md`](./implementation-plan.md)
- Research and promotion: [`logs/2026-09-01-research-and-promotion.md`](./logs/2026-09-01-research-and-promotion.md)
- Active add-ons: [`../README.md`](../README.md)
- Accepted sandbox: [`../../archive/features/sandbox/product.md`](../../archive/features/sandbox/product.md)
- Accepted Plan/Agent: [`../../archive/features/plan-agent/product.md`](../../archive/features/plan-agent/product.md)
- Accepted V3: [`../../archive/v3/product.md`](../../archive/v3/product.md)
- Protocol architecture: [`../../architecture/protocol-and-ipc.md`](../../architecture/protocol-and-ipc.md)
- Runtime/data architecture: [`../../architecture/runtime-and-data.md`](../../architecture/runtime-and-data.md)
- Renderer architecture: [`../../architecture/renderer-and-ui.md`](../../architecture/renderer-and-ui.md)
- OpenAI: [permission modes](https://learn.chatgpt.com/docs/permission-modes), [Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review), [permission profiles](https://learn.chatgpt.com/docs/permissions)
- Anthropic: [permission modes](https://code.claude.com/docs/en/permission-modes), [permission rules](https://code.claude.com/docs/en/permissions)
- Pi Automode: [repository](https://github.com/czottmann/pi-automode), [classifier flow](https://github.com/czottmann/pi-automode/blob/main/docs/automode-classifier-flow.md), [configuration](https://github.com/czottmann/pi-automode/blob/main/docs/configuration.md)
- Nah: [`manuelschipper/nah`](https://github.com/manuelschipper/nah)
- Pi Approval Guardian: [`mics8128/pi-approval-guardian`](https://github.com/mics8128/pi-approval-guardian)
- Owner-provided essay: [Pi Guardian](https://benanderson.work/blog/pi-guardian/)
