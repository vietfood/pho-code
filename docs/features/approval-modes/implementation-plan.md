# Approval modes and automatic review implementation plan

## Status and use

Owner-approved implementation contract for the
[approval-modes add-on](./product.md), promoted 2026-09-01. Status is
**In implementation**. Pi Milestones 0–3 are implemented and machine-verified
as recorded in
[`logs/2026-09-01-m0-m3-pi-implementation.md`](./logs/2026-09-01-m0-m3-pi-implementation.md),
but no milestone in this plan is accepted yet. Milestone 4 remains held with V5;
Milestone 5 still needs real-provider evaluation and owner acceptance.

This plan targets the complete product. Milestones define dependency and review
order; they do not reduce the final scope to a small first version.

Before implementation, read:

1. [`product.md`](./product.md) and the
   [research/promotion log](./logs/2026-09-01-research-and-promotion.md);
2. [`../../current-state.md`](../../current-state.md);
3. [`../../architecture/README.md`](../../architecture/README.md),
   [`../../architecture/overview.md`](../../architecture/overview.md),
   [`../../architecture/protocol-and-ipc.md`](../../architecture/protocol-and-ipc.md),
   [`../../architecture/runtime-and-data.md`](../../architecture/runtime-and-data.md),
   [`../../architecture/renderer-and-ui.md`](../../architecture/renderer-and-ui.md),
   and [`../../architecture/extension-model.md`](../../architecture/extension-model.md);
4. the accepted
   [sandbox product](../../archive/features/sandbox/product.md) and
   [plan](../../archive/features/sandbox/implementation-plan.md);
5. the accepted
   [Plan/Agent product](../../archive/features/plan-agent/product.md) and
   [plan](../../archive/features/plan-agent/implementation-plan.md);
6. the accepted [V3 product](../../archive/v3/product.md) and
   [plan](../../archive/v3/implementation-plan.md);
7. the V5
   [Codex interaction](../../version/v5/logs/2026-08-26-codex-owner-interactions.md),
   [ACP permission](../../version/v5/logs/2026-08-26-acp-permission-interactions.md),
   and [external ownership](../../version/v5/logs/2026-08-27-external-backend-ownership.md)
   records;
8. [`../../development.md`](../../development.md) and the relevant V1 settings,
   identity, data-root, packaging, and credential reviews.

When implementation starts, use the repository's `test-pho-code` skill for
verification selection and `maintain-pho-docs` for logs, architecture updates,
acceptance, and eventual archival.

## Global acceptance rules

Every milestone must:

- preserve the dependency direction
  `renderer -> protocol <- shell adapter -> application -> runtime -> Pi SDK`;
- keep protocol values bounded and JSON-safe;
- keep renderer state non-authoritative for modes, grants, approvals, reviewer
  decisions, filesystem paths, process execution, and backend configuration;
- use named bridge commands and dedicated events, never generic channels or
  `setSetting(key, value)`;
- keep Pi SDK `0.84.4`, `@gotgenes/pi-permission-system` `24.0.0`, and
  `@anthropic-ai/sandbox-runtime` `0.0.73` exact until a separate reviewed pin
  change proves otherwise;
- use the installed SDK/package typings and tests as API authority;
- preserve unrelated user changes and all Pi/project/session/credential data;
- use isolated temporary agent, application-data, and workspace directories in
  tests;
- keep Ask and Approve for me on the same contained boundary;
- never implement Approve for me as `yoloMode: true`, a blanket allow rule, or
  blind selection of an external backend's approval option;
- keep deterministic product-invariant denies ahead of any reviewer or Full
  access decision;
- freeze and revalidate the exact input before dispatch;
- fail closed on reviewer/model/schema/timeout/cancellation errors;
- keep Full access explicit, non-default, memory-only, and visibly active;
- leave Plan/Agent, V3, terminal, compaction, V4, and V5 ownership where their
  contracts place it;
- add tests with behavior, then run the smallest relevant checks followed by the
  promoted milestone's exit gate;
- inspect the actual diff and repository status before reporting completion;
- create one dated feature log per bounded slice and a related UI log when user
  chrome or terminology changes.

No milestone may claim that automatic review is a sandbox or security guarantee.
No milestone may claim external-backend mode support without a real negotiated
or characterized native operation and verification.

## Current baseline and compatibility constraints

Implementation begins from these current facts:

- `packages/runtime/src/permission-presets.ts` defines Guarded, Balanced, and
  Developer managed policies plus permanent-removal, privilege, destructive-Git,
  web, and harness-tool rules.
- `packages/runtime/src/permission-settings.ts` reads and writes the baked
  permission package's global config, preserves Custom, exposes YOLO and review
  logging, recognizes project overrides, and inserts the
  `pho-code-sandbox` authorizer in the public chain.
- `packages/runtime/src/sandbox-permission.ts` registers an async authorizer
  through the permission package's process-global public service. Healthy
  contained bash and in-policy file-tool asks become allows; out-of-policy file
  tools become denies.
- Sandbox settings persist independently in `sandbox-settings.json`, default on,
  and are process/session adapted in `packages/runtime`.
- Current Pi host permissions use the existing select/input interaction dock.
- Current external Codex sessions start with `workspace-write` and `on-request`
  and project native approval requests into the backend-neutral interaction
  seam.
- Current ACP sessions forward native `session/request_permission` choices and
  return the selected opaque option unchanged.
- Current `AgentBackendDescriptor` has a single `approvals` capability, which is
  insufficient to distinguish Ask, Auto, and Full.
- Current V3 owner-facing **Approve** is a post-change ledger action only.

The new design must migrate these facts deliberately. It must not create a
second unsynchronized permission engine beside the current package.

## Planned architecture

### Decision pipeline

The privileged runtime owns one action-authorization pipeline:

| Stage | Responsibility | Terminal outcomes |
| --- | --- | --- |
| Identity/input admission | Resolve backend/workspace/session/run, validate tool shape, freeze exact input | reject invalid/stale |
| Effect normalization | Canonicalize cwd, paths/symlinks, domains, command/effect class, provenance | typed action or conservative unknown |
| Product invariant policy | Permanent removal, privilege, destructive Git, self-protection, deterministic critical guards | deny or continue |
| Trusted project restriction | Apply only monotonic ask/require-owner/deny additions | deny, require owner, or continue |
| Boundary policy | Determine in-boundary allow vs eligible elevation for active mode | allow, review, require owner, deny |
| Resolver | User in Ask, reviewer in Auto, bypass in Full | exact grant, deny, require owner, unavailable |
| Dispatch revalidation | Re-resolve identity, symlinks, input fingerprint, grant, policy generation, cancellation | execute once or reject stale |
| Observation | Redacted decision log, activity event, tool result, V3 post-write capture | no authority change |

This is one pipeline even when the permission package invokes it through more
than one surface (`path`, `external_directory`, `bash`, `mcp`, or tool-specific
details). A later authorizer cannot turn a product-invariant deny into allow.

### Layer ownership

| Layer | Owns | Must not own |
| --- | --- | --- |
| `@pho-agent/protocol` | Optional backend approval-mode capability and backend-neutral set-mode operation/event | Pho policy, reviewer prompt, Electron |
| `@pho-agent/host` | Capability validation and optional dispatch for backend-owned modes | Pi permission package or Pho UI |
| external backend adapters | Native mode configuration, native approval/reviewer mechanics, truthful limitations | Pi reviewer, Pho policy emulation |
| `@pho-code/protocol` | Owner-facing mode/settings/session/review projections, named commands/events, validation/bounds | model clients, filesystem, Electron |
| `packages/runtime` | Pi policy orchestration, settings/migration, sandbox/elevation integration, reviewer service, grants, logs, backend projection | React/Electron UI |
| `packages/application` | Command validation, selected identity joins, migration coordination, stable errors, shutdown | Pi/Electron APIs |
| Electron main/preload | Named IPC routing and app-data/path/process adapters | policy decisions in IPC handlers |
| `packages/ui` / renderer | Mode menu, Settings, warning, review activity, permission/denial presentation | authorization or grant settlement |

### Why the reviewer stays Pho-owned only for Pi

The embedded Pi path uses Pho Code's baked tools, permission package, sandbox,
and application data; Pho Code can therefore own its automatic reviewer.
External Codex and ACP/Claude backends own their loops and tool dispatch. Adding
a second Pho reviewer around their projected prompts would see incomplete
actions, could disagree with native policy, and could not reliably enforce exact
input locking. Their modes must be native adapter capabilities.

## Protocol contract

All names below are planned contracts. Milestone 0 may refine field names after
checking the current protocol conventions, but may not weaken their semantics.

### Mode and capability values

| Value | Allowed values / fields | Meaning |
| --- | --- | --- |
| `ApprovalMode` | `ask`, `auto`, `full` | Owner-facing per-chat mode |
| `ApprovalModeOwner` | `pho`, `backend` | Which runtime enforces the mode |
| `ApprovalModeSupport` | mode, support level, owner, optional bounded reason/limitations | Truthful availability for one backend |
| `ApprovalReviewerState` | `user`, `idle`, `reviewing`, `owner-required`, `unavailable`, `none` | Current resolver state |
| `ApprovalDecisionOutcome` | `allow-once`, `allow-session`, `deny`, `require-owner`, `unavailable`, `cancelled`, `stale` | Final bounded result |

`AgentBackendDescriptor` gains an optional mode-specific structure rather than
three ambiguous booleans or an overloaded `approvals` value. The existing
`approvals` capability continues to mean that the backend can surface an owner
interaction; it does not imply Auto or Full.

### Session projection

Each authoritative session snapshot adds one approval projection with:

- configured and effective mode;
- supported modes and owner for that backend;
- containment state (`contained`, `elevated`, `full`, `unavailable`);
- reviewer state and effective model identifier when Pho-owned;
- pending request ID and redacted action summary when any;
- count of active revocable session grants;
- Full-access acknowledgement/risk state;
- policy generation and bounded fallback/unavailability reason.

The renderer cannot send this projection back as authority. Missing approval
state during the compatibility window normalizes to Ask for Pi and to the
backend's characterized safe default for external sessions.

### Settings projection

`HarnessSettingsSnapshot` adds a typed approval-modes section with:

- default new-chat mode (`ask` or `auto` only);
- Auto enabled flag;
- Full enabled flag;
- reviewer selection (`automatic` or bounded provider/model ID);
- effective reviewer availability and redacted reason;
- decision-history enabled flag;
- migration state (`not-needed`, `ready`, `custom-blocked`, `shared-root-warning`,
  `complete`, `failed`);
- legacy profile/YOLO summary for migration copy only;
- boundary/sandbox relationship status.

Raw permission JSON, reviewer prompts, grants, tokens, tool input, policy text,
sandbox profiles, proxy data, and external backend config never cross IPC.

### Named commands

| Command | Privileged behavior |
| --- | --- |
| `setSessionApprovalMode` | Validate composite identity, idle state, backend support, Settings enablement, Full acknowledgement, and persist/reset according to mode |
| `updateApprovalModeSettings` | Apply one typed Settings patch while preserving unrelated values and shared-root safeguards |
| `resolveApprovalRequest` | Settle one pending owner request with once/session/deny plus optional bounded reason |
| `authorizeApprovalRetry` | Create one exact retry marker for one recent overridable auto denial |
| `revokeApprovalGrant` | Revoke one or all current session grants for the selected composite session |
| `migrateLegacyPermissionSettings` | Explicitly migrate app-managed or custom compatibility state after validation and owner acknowledgement |
| `listApprovalDecisionHistory` | Return one bounded/redacted page for explicit Settings inspection |

`resolveHostDialog` remains for unrelated extension/backend questionnaires during
the compatibility phase. The implementation may adapt Pi permission selections
to the new request command internally, but must not merge questionnaires,
secrets, confirmations, and approval grants into one untyped payload.

### Events

Use dedicated, keyed events for:

- effective mode/capability change;
- review requested/started/settled/failed;
- owner approval requested/settled;
- grant created/revoked/expired;
- Full-access reset;
- policy/migration state change.

High-frequency reviewer tokens or reasoning are never events. A final validated
decision and authoritative session snapshot settle truth. Events carry backend,
workspace, session, run, request, and occurred-at identity as applicable.

### Bounds and validation

Milestone 1 must define and test hard protocol bounds. Initial intended limits:

| Field | Intended bound |
| --- | --- |
| IDs / enum-adjacent labels | 200 characters |
| User-facing title | 120 characters |
| Rationale / owner reason | 1,000 / 4,000 characters respectively |
| Redacted action summary | 2,000 characters |
| Exact JSON tool input | 128 KiB serialized; oversized actions cannot enter automatic review |
| Evidence items | 32 bounded items plus a release-owned token budget |
| Decision-history page | 100 entries, cursor-paginated |
| Recent auto denials eligible for override | 10 per session/task |

An exact action larger than the reviewer protocol bound cannot be truncated and
approved automatically. It becomes require-owner or deny according to policy.
Validation rejects unknown modes/outcomes, non-finite numbers, prototypes,
functions, symbols, class instances, raw errors, and over-bound nested data.

## Runtime design

### Foundation ownership correction

Owner direction on 2026-09-01 places the reusable approval foundation in
`packages/pho-agent`, not in Pho Code's product runtime. The backend-neutral
action envelope and fingerprint, per-session controller, ordered authorization
and revalidation pipeline, memory grants, reviewer lifecycle/circuit breaker,
and Pi whole-action interception belong to `@pho-agent/protocol` and
`@pho-agent/runtime`. Pho Code injects release-owned product invariants and
boundary policy, reviewer-model resolution, permission/sandbox execution
adapters, application-data settings/history/migration stores, and UI copy.

This ownership correction does not advance held V5 external-backend work.
Codex and ACP remain honestly Ask-only until V5 permits their native mode
contracts to be characterized and implemented.

### Effect normalizer

Create a small, deterministic normalizer over current permission details and
known Pho tools. It produces a bounded action record containing:

- tool and permission surface;
- read/write/execute/network/external-service effect classes;
- canonical cwd and targets;
- requested scope and reversibility;
- command metadata and source-control target where safely observable;
- trusted owner vs untrusted agent/tool provenance;
- whether the effect can be represented by a scoped sandbox grant;
- a stable fingerprint over the frozen action.

Do not pretend to understand arbitrary shell behavior. Known high-confidence
effects may use deterministic rules. Unknown shell/custom/MCP behavior remains
reviewable or owner-required. Concepts from Nah may inform tests and policy, but
no Nah binary, source copy, or ambient hook enters the product.

### Policy engine

Policy returns one of `allow`, `review`, `require-owner`, or `deny`, plus a stable
rule ID and bounded rationale. It consumes normalized effects and explicit
release-owned policy tables. It never consumes renderer state or free-form
project policy as executable logic.

Project rules are parsed through the existing trust flow and may only move a
decision toward more review:

- allow -> review, require-owner, or deny;
- review -> require-owner or deny;
- require-owner -> deny;
- deny remains deny.

Those transitions govern Ask and Auto. In Full, explicit project denies remain
terminal, while project review/require-owner outcomes are bypassed with the
rest of routine approval routing. Product invariants remain terminal in every
mode.

Unknown or weakening project entries are rejected with a bounded diagnostic.
No project file may configure reviewer model/prompt, Auto/Full availability,
default mode, sandbox disablement, or product-invariant rules.

### Permission-package integration

Milestone 0 must inspect `@gotgenes/pi-permission-system` `24.0.0` types/tests to
choose its supported seam. The intended result is one named Pho authorizer that
orchestrates invariant, project, sandbox, mode, and resolver decisions, replacing
the current skip-only `pho-code-sandbox` behavior without forking the package.

Requirements:

- preserve the package as the first baked feature;
- preserve non-Pho/custom compatibility until explicit migration;
- preserve normal package review logging unless the new redacted log supersedes
  a specific record deliberately;
- use public async authorizer/override APIs only;
- ensure the authorizer is re-registered on session/resource reload;
- ensure a later package rule cannot override a product-invariant deny;
- avoid duplicate UI prompts between the package and Pho resolver;
- keep harness Plan/ask-user/todo tools allow-listed as today.

If the public API cannot express the ordered result and exact-input locking,
stop Milestone 0 and propose the narrowest adapter or upstream change. Do not
monkey-patch package internals or maintain a silent fork.

### Reviewer service

The Pho reviewer service owns:

- capability-based model resolution and explicit reviewer-model validation;
- one isolated reviewer session/channel per provider/model policy;
- source-controlled system/policy instructions and strict structured response;
- token-budgeted, provenance-tagged evidence selection;
- optional bounded read-only workspace checks;
- timeout, abort, malformed-output, and provider/auth failure mapping;
- per-turn denial counters and circuit breaker;
- exact retry marker validation;
- redacted decision logging and usage/latency metadata.

It must not reuse the main agent's mutable conversation/session object, tools,
extensions, MCP, context prompt, skills, hidden reasoning, or active run state.
Using the same provider/model is allowed only through a distinct reviewer
request/session with the narrower contract.

Automatic model resolution is release-owned. It chooses only authenticated,
structured-output-capable models that have passed the reviewer evaluation lane.
The exact initial allowlist/default is closed and logged in Milestone 0 after
real model characterization; it is not guessed in this document.

### Grants and dispatch locking

The privileged grant store is memory-only and keyed by composite identity plus
policy generation. It supports:

- exact one-use reviewer/owner grants;
- normalized owner-only session grants;
- explicit revoke and automatic expiry;
- atomic consume-before-dispatch;
- rejection of duplicates, stale generations, changed paths/symlinks, input
  mutation, replaced runs, and late reviewer responses.

After approval, reserialize and compare the tool input immediately before the
owning execution callback. Inputs that cannot be frozen as ordinary JSON-like
values fail closed. Do not approve one representation and execute a mutated
extension object.

### Sandbox elevation

Contained-mode execution has three dispositions:

| Disposition | Execution |
| --- | --- |
| In boundary | Current healthy sandbox/in-process policy; no prompt/reviewer |
| Scoped elevation | Temporary exact path/domain/effect grant if the current engine can enforce it |
| Broad one-shot elevation | Exact frozen command/action runs outside ordinary containment only after disclosure and a qualifying owner/reviewer decision |

Milestone 0 must prove what `@anthropic-ai/sandbox-runtime` `0.0.73` can enforce
per call without resetting unrelated sessions. If exact temporary enforcement
is not possible, automatic policy must default broad unsandboxed elevations to
require-owner unless the characterized effect is explicitly safe enough for the
release-owned policy.

No approval writes `sandbox-settings.json`. No sandbox error triggers an
unsandboxed retry. Full access is the only mode-wide bypass; other elevations
are exact and expiring.

### Full-access runtime

Full access:

- is admitted only while idle and enabled for the current backend;
- stores its active state only in the privileged session controller;
- disables Pho's ordinary sandbox/approval resolver for that chat, not globally;
- retains product-invariant checks and input identity validation;
- publishes an authoritative high-risk snapshot;
- revokes prior grants on entry and exit;
- resets on process restart, archive/resume, backend/workspace/session replacement,
  capability loss, or explicit mode change;
- never writes `yoloMode: true` as its implementation.

For Pi, the exact mechanism may switch the session's sandbox disposition and
permission base policy. For external backends, Full exists only through a native
adapter operation characterized in Milestone 4.

## Persistence and migration

### Application-owned files

Planned application data:

| Path/record | Content |
| --- | --- |
| `approval-modes.json` | Typed feature settings, migration version/state, no secrets |
| application metadata next schema | Durable Ask/Auto per composite session, never Full or grants |
| `approval-decisions/v1/` | Bounded rotating redacted decision history |
| migration backup/reference | Owner-readable reference to prior app-managed permission config when changed |

Do not choose a metadata version number until implementation checks concurrent
schema work. Use the next available version and a one-way migration with tests.

### Migration transaction

Migration is privileged, atomic, and recoverable:

1. Load and validate current global permission config, sandbox settings, current
   project override summary, agent-dir ownership, and existing metadata.
2. Classify the global policy as managed/legacy managed/custom/invalid without
   rewriting it.
3. Compute the new mode and contained boundary according to the product table.
4. For managed config, save a bounded backup/reference and write the new
   release-owned base policy plus authorizer chain atomically.
5. For Custom, remain Ask-only compatibility until an explicit owner command.
6. Re-enable contained posture for a previously disabled sandbox; explain the
   new Full-access path instead of inferring it.
7. Persist approval settings and metadata only after permission/sandbox state is
   valid; on failure, restore or retain the prior effective state.
8. Publish one authoritative Settings/session snapshot and migration result.

`PHO_CODE_AGENT_DIR` shared scope requires explicit disclosure before a managed
config write. Migration never deletes config/logs or rewrites project rules.
Credentials, sessions, skills, MCP state, and V3 data are out of transaction.

### Decision history retention

Milestone 2 selects a small bounded rotation and retention policy and tests it.
The product requirements are:

- enabled by default;
- metadata only; raw reviewer IO off and unavailable in ordinary Settings;
- atomic append/rotate with corrupt-file fail-closed recovery;
- a total size and age bound recorded in source/docs;
- renderer pagination only on explicit inspection;
- no credentials, file contents, raw commands, hidden reasoning, or raw tool
  output;
- no V4 diagnostics/export claim.

## External backend integration

### Host contract

Add an optional backend operation to set one characterized native approval mode
while idle. The host validates backend-pinned identity and rejects adapters that
advertise a mode without implementing the operation. A mode change returns or
publishes an authoritative backend snapshot; renderer optimism cannot settle it.

### Codex adapter

Milestone 4 must inspect the supported Codex App Server protocol/build and prove:

- Ask mapping (`workspace-write` + interactive approvals, or the current native
  equivalent);
- native automatic reviewer selection and its boundary configuration, if App
  Server exposes a stable operation/config;
- native Full-access selection and warning-relevant semantics, if exposed;
- behavior on resume, mode change, approval request, cancel, and dispose;
- no Pi reviewer/policy or blind approval around Codex actions.

The currently characterized `on-request` approval path remains Ask-only until
this evidence exists. CLI configuration files are not silently rewritten by
Pho Code unless V5 explicitly promotes such ownership; preference is a
session/thread operation owned by the adapter.

### ACP/Claude adapter

Stable ACP `session/request_permission` is Ask support. Auto/Full require a
negotiated stable config option or other characterized agent capability. The
adapter must preserve opaque option IDs and must not infer semantics from a
label alone without the protocol/agent contract.

If the external agent does not expose a mode operation, its descriptor is
Ask-only. External installation, authentication, settings, and updates remain
outside Pho Code.

### V5 hold

External adapter changes are part of V5 backend ownership. Milestone 4 may not
start while the V5 hold forbids new slices. Pi milestones can proceed because
the add-on is independent. Final acceptance can include honest Ask-only external
descriptors; it cannot include unverified Auto/Full claims.

## Planned file ownership

Names may be adjusted to match current package conventions, but ownership may
not drift.

| Area | Intended changes |
| --- | --- |
| `packages/pho-agent/packages/protocol/src/approval.ts` | Backend-neutral modes, decisions, bounded frozen-action and session-state contracts |
| `packages/pho-agent/packages/runtime/src/approval-*` | Per-session controller, canonical fingerprinting, grants, reviewer lifecycle/circuit, cancellation, consume/revalidation, and Pi whole-action interception |
| `packages/protocol/src/approval-modes.ts` | JSON-safe modes, settings, session/review/grant projections, validation, copy, bounds |
| `packages/protocol/src/bridge.ts`, `events.ts`, `version.ts`, `index.ts` | Named commands/events/exports/version |
| `packages/pho-agent/packages/protocol/src/backend.ts`, `packages/pho-agent/packages/host` | Held optional native mode capability/dispatch work; do not change under this add-on while V5 remains unaccepted |
| `packages/pho-agent/packages/backend-codex`, `packages/pho-agent/packages/backend-acp` | Held native mappings only; remain Ask-only during this Pi slice |
| `packages/runtime/src/approval-policy.ts` | Pho Code product invariants, concrete effect normalization, base policy, and monotonic project restrictions injected into Pho Agent |
| `packages/runtime/src/approval-settings.ts` | Typed persistence and legacy migration |
| `packages/runtime/src/approval-reviewer.ts` | Pho Code model selection, evidence/prompt construction, provider adapter, and failure mapping injected into Pho Agent |
| `packages/runtime/src/approval-history.ts` | Redacted bounded decision log |
| existing permission/sandbox runtime files | Product adapters into the Pho Agent controller plus contained/elevated/full execution disposition |
| `packages/application` | Named use cases, validation, state joins, shutdown |
| Electron IPC/preload | One handler/method per command; no generic mode/policy channel |
| `packages/ui/src/approval-mode-control.tsx` | Compact composer mode control/menu |
| `packages/ui/src/approval-review-activity.tsx` | Reviewing/settled/attention presentation |
| Settings UI | Typed mode availability/default/reviewer/history/migration controls |
| V3 Changes UI | Label-only Mark reviewed change with semantic tests |
| tests/docs/logs | Unit, integration, desktop, packaged, provider evals, UI records, living docs |

Avoid a central “god” permission class. Pure effect/policy/grant/history modules
remain independently testable; runtime orchestration composes them.

## Milestone 0: characterize seams and freeze policy/evaluation contracts

### Outcome

Close every material API and policy uncertainty before behavior code: permission
authorizer, sandbox elevation, reviewer model path/schema, action normalizer,
migration inputs, and native backend support.

### Implementation sequence

1. Inspect the installed permission-system `24.0.0` types, authorizer chain,
   prompt details, logging, YOLO, input lifetime, reload, and tests. Build a
   minimal isolated probe if types are insufficient.
2. Inspect sandbox-runtime `0.0.73` for per-call/temporary path and network
   configuration, concurrent managers, reset cost, and cancellation. Verify on
   macOS with temporary workspace/home roots.
3. Trace every current Pi permission surface and tool category, including bash,
   file tools, web, skills, MCP, Trash, Plan tools, Cursor SDK, and unknown tools.
4. Define the normalized action/effect schema and exact input fingerprint rules.
5. Freeze release-owned product-invariant and default review-policy tables with
   stable rule IDs.
6. Build a deterministic evaluation corpus covering safe in-boundary actions,
   boundary requests, credentials, exfiltration, prompt injection, production,
   persistence, destructive filesystem/Git, privilege, safety-control mutation,
   supply-chain actions, ambiguous shell, custom tools, and stale/mutated input.
7. Characterize isolated reviewer calls against candidate authenticated models,
   structured schema adherence, latency, cancellation, provider failure, and
   context privacy. Select the initial Automatic resolver policy and record it.
8. Inspect supported Codex App Server and ACP operations for mode configuration.
   Record honest initial mode capabilities; do not implement held V5 changes.
9. Inspect current metadata/settings migrations and dirty concurrent feature work
   before selecting the next schema version or files.
10. Write a Milestone 0 log with exact sources, probes, results, rejected options,
    and any product-contract correction requiring owner review.

### Acceptance criteria

- One supported permission-package integration seam can enforce ordered async
  decisions and exact input locking without a fork, or the milestone stops with
  a narrow upstream/adapter proposal.
- Sandbox evidence distinguishes enforceable scoped grants from broad
  unsandboxed one-shots.
- Every current tool/surface has a conservative normalization/fallback policy.
- Product invariants and reviewer policy have stable IDs and a checked-in eval
  corpus.
- At least one real authenticated Pi reviewer path produces strict structured
  decisions and can be cancelled; its limitations are recorded.
- Initial external backend mode descriptors make no unsupported Auto/Full claim.
- No user data, real credentials, or real workspace is modified by probes.

### Verification

- focused package type/source tests and isolated probe tests;
- macOS sandbox integration in temporary roots;
- reviewer provider characterization with non-sensitive fixtures;
- protocol/eval fixture validation;
- documentation link/diff/status checks.

Milestone 0 adds no owner-facing mode and cannot be accepted as partial feature
delivery.

## Milestone 1: policy foundation, migration, and Ask for approval

### Outcome

Replace the ordinary Pi owner path with the new typed mode foundation and a
complete Ask-for-approval experience while preserving Custom compatibility and
existing sandbox/V3 behavior.

### Implementation sequence

1. Add protocol values, capability projections, session/settings snapshots,
   commands, events, bounds, copy, and validation tests.
2. Implement effect normalization, stable fingerprinting, product invariants,
   base policy, monotonic project restrictions, and policy-generation ownership.
3. Replace the skip-only sandbox authorizer with the characterized unified Pho
   authorizer. Preserve package reload/rebind behavior and no duplicate docks.
4. Add approval settings persistence and the atomic migration transaction.
   Managed states map safely; Custom remains Ask-only until explicit migration.
5. Make contained boundary effective for Ask and derive sandbox enablement from
   mode without deleting the existing domain/path policy.
6. Implement exact owner once/session grants, revoke/expiry, and dispatch
   revalidation for current Pi permission requests.
7. Add authoritative per-chat Ask state and use Ask as compatibility default.
8. Add the composer shield control with Ask only, typed Settings foundation,
   migration disclosure, and grant revocation.
9. Verify Plan tools stay allow-listed, `ask_user_question` does not become a
   grant, V3 capture still follows successful write/edit, and owner PTY/MCP/
   Cursor boundaries remain honest.
10. Add runtime/application/UI/Electron logs and update living architecture only
    for behavior that actually landed.

### Acceptance criteria

- Ask is the default for new Pi chats and durable per chat.
- Routine contained workspace read/edit/test/build actions run without prompts.
- Eligible additional access shows the exact quiet three-option owner dock.
- Owner once/session grants are exact, memory-only, revocable, and stale-safe.
- Product-invariant actions deny before any owner allow option.
- Full and Auto are not selectable or implied in this milestone.
- Migration never selects Full, never silently overwrites Custom, and never
  deletes existing permission/sandbox/session/project data.
- Sandbox failure blocks contained bash and does not produce an unsandbox retry.
- Renderer reload/background chat/session switch preserve authoritative state.

### Verification

- unit: protocol validation, effect/policy tables, project monotonicity,
  fingerprinting, grants, settings/migration, reducers/components;
- integration: real Pi `0.84.4` + permission-system `24.0.0` + sandbox-runtime
  `0.0.73` in isolated data/workspaces, including reload/rebind and V3 capture;
- desktop: create/open/switch/background Ask chats, permission choices, revoke,
  migration warnings, Custom compatibility, Stop/Stop-all, renderer reload;
- packaged macOS: contained Ask journey without global Pi, Homebrew `rg`, or
  ambient package configuration;
- root typecheck/lint/test/build and relevant desktop/package lanes.

## Milestone 2: Approve for me and reviewer observability

### Outcome

Deliver automatic review over the same Ask boundary with strict isolation,
failure behavior, owner escalation, circuit breaking, and redacted history.

### Implementation sequence

1. Implement reviewer model resolution and isolated session/channel construction
   from the Milestone 0 decision.
2. Add source-controlled reviewer policy, evidence selection with provenance,
   strict schema parser, and optional bounded read-only check interface.
3. Route only eligible Ask elevations to the reviewer; keep deterministic allows,
   require-owner, and denies off the model path.
4. Implement allow-once, deny, require-owner, unavailable, timeout, cancellation,
   stale-decision, and malformed-output behavior.
5. Add exact override markers, recent denial list, and the 3-consecutive / 10-of-50
   per-turn circuit breaker.
6. Implement redacted decision history with bounded rotation/retention and
   explicit pagination.
7. Add Auto Settings opt-in/default eligibility/reviewer selection and composer
   menu availability.
8. Add compact reviewing/settled tool activity and owner-attention behavior for
   foreground/background chats.
9. Add provider usage/model/latency diagnostics without raw reviewer IO or V4
   export claims.
10. Run the adversarial evaluation corpus against every Automatic model candidate
    and record false allow/deny, failures, latency, and corrections.

### Acceptance criteria

- Ask and Auto use byte-for-byte equivalent contained boundary/policy inputs;
  only resolver ownership differs.
- Routine in-boundary work makes zero reviewer calls.
- Only a final schema-valid allow-once can create an automatic grant.
- Reviewer cannot write, use network/MCP, alter Settings, select mode, create a
  session grant, or see hidden reasoning.
- Untrusted tool/web/project content is provenance-tagged and cannot establish
  owner authorization.
- Provider/auth/schema/timeout/cancellation/open-circuit failures never execute
  the action and correctly request owner attention.
- Denial workarounds and repeated escalations stop according to policy/circuit.
- Exact override applies to one retry and cannot bypass product invariants.
- Decision logs are bounded/redacted and Settings explains provider/privacy/cost.
- Critical evaluation corpus has zero false allows. Any critical false allow
  blocks the milestone regardless of aggregate accuracy.

### Verification

- unit: evidence selection, provenance, response parser, fallback rules,
  timeout/cancel/stale handling, circuit, overrides, history rotation/redaction;
- integration: real Pi action interception with injected deterministic reviewer
  plus at least one real provider-backed reviewer;
- adversarial provider evaluation: safe, unsafe, ambiguous, injected, private,
  production, persistence, destructive, and mutation fixtures;
- desktop: Auto opt-in/control, review activity, owner escalation, denial,
  reviewer unavailable, background attention, Stop/Stop-all, relaunch fallback;
- packaged macOS: real reviewer authentication/model resolution and one safe
  allow plus one critical deny using non-sensitive fixtures;
- root exit checks and diff/status review.

## Milestone 3: scoped elevations, Full access, and complete owner UX

### Outcome

Complete Pi's final three-mode product: least-privilege elevations where
enforceable, explicit Full access, full Settings/migration UX, and unambiguous
V3 terminology.

### Implementation sequence

1. Implement characterized per-call scoped sandbox/path/network elevations and
   broad one-shot disclosure/fallback rules.
2. Test concurrent contained sessions so one elevation cannot change another
   session's boundary or durable Sandbox settings.
3. Implement privileged memory-only Full state, mode-wide sandbox/approval
   bypass, product-invariant retention, reset lifecycle, and authoritative risk
   projection.
4. Add Settings enablement, first-use warning, persistent composer indicator,
   safe new-chat default restriction, and backend availability copy.
5. Complete migration from legacy managed/YOLO/sandbox-off states, including
   shared agent-dir and Custom owner journeys.
6. Rename V3 owner-facing **Approve** to **Mark reviewed** in copy, tests, and
   living UI docs without changing ledger values or archived history.
7. Verify mode changes are idle-only, revoke grants, do not settle pending
   requests, and work across background sessions/reload/restart/archive/resume.
8. Exercise secret/private data and external network behavior to prove the Full
   warning matches actual broad authority and product invariants still deny.
9. Run accessibility, reduced-motion, light/dark, narrow-layout, keyboard, and
   screen-reader-name checks across all mode surfaces.
10. Write feature and reciprocal UI logs; update living architecture/current
    state only to verified behavior.

### Acceptance criteria

- Scoped elevation grants no broader path/domain/effect than represented by its
  capability and never persists to Sandbox settings.
- Broad unsandboxed one-shots are explicitly disclosed and use the contracted
  owner/reviewer policy; there is no silent sandbox fallback.
- Full cannot be selected until enabled and acknowledged, cannot be a default,
  never comes from migration/reviewer/project/model, and is visible for its
  entire active lifetime.
- Full resets on every product-contracted event and cannot leak across chats.
- Permanent deletion, privilege, destructive Git, safety-control mutation, and
  exact-input mismatch remain denied in Full.
- Existing external-service/backends may still prompt according to their own
  controls; UI does not promise otherwise.
- Mark reviewed has exactly V3's prior Approve semantics.
- Owner can revoke session grants and inspect redacted decisions without a new
  dashboard.

### Verification

- unit: elevation matching, sandbox disposition, Full lifecycle, migration,
  V3 label/copy, Settings/menu/warning/accessibility;
- integration: concurrent real Pi sessions, scoped/broad elevation, mode switch,
  grants, secrets, product invariants, V3 capture, restart reconstruction;
- desktop: complete three-mode matrix, warnings, background runs, pending
  interactions, archive/resume, renderer reload, app relaunch, Mark reviewed;
- packaged macOS: contained Ask/Auto and unsandboxed Full behavior with product
  invariants, no ambient Pi dependency;
- Linux compatibility diagnostics and focused behavior where CI/host permits;
- root exit checks and actual diff/status inspection.

## Milestone 4: truthful external-backend mode mapping

### Gate

Do not start while the V5 hold forbids new backend slices. Obtain the required
scope/status change first. This milestone must not be used to work around V5.

### Outcome

Project native Codex and ACP/Claude approval-mode capability into the same owner
control without taking ownership from those backends or inventing parity.

### Implementation sequence

1. Add the mode-specific optional capability and set-mode host operation with
   descriptor/adapter contract tests.
2. Implement only the Codex modes proven by current App Server characterization;
   retain Ask for unsupported modes.
3. Implement only ACP/Claude modes exposed by stable negotiated configuration;
   retain Ask otherwise.
4. Project native reviewer/approval/full state and limitations without injecting
   Pho reviewer policy, Pi tools, or Pi grants.
5. Verify create/resume/change-mode/request/cancel/dispose/restart behavior with
   the real external binaries and provider accounts.
6. Ensure backend switching creates a distinct session and never transfers mode,
   grants, pending requests, or reviewer history as authority.
7. Add adapter/source/integration/desktop/packaged logs under V5 and cross-link
   this feature.

### Acceptance criteria

- Every advertised external mode has a real native implementation and exact
  compatibility evidence.
- Ask continues to forward native approval choices unchanged.
- Auto never means Pho blindly selects “allow.”
- Full never means Pho disables only its UI while the backend remains contained.
- Unsupported modes are absent/disabled with a bounded reason.
- External installation, config, auth, update, loop, tools, and persistence stay
  backend-owned.
- Packaged Pho Code discovers required external binaries but does not bundle or
  mutate them beyond V5's accepted policy.

### Verification

- host/protocol/adapter contract tests;
- injected fake server/agent tests for capability mismatch and cancellation;
- real provider-backed Codex and Claude create/prompt/mode/approval/resume;
- real Electron mode control and background interaction journeys;
- packaged external discovery/integration path;
- V5 and feature documentation/status review.

## Milestone 5: hardening, final evaluation, and acceptance

### Outcome

Close the complete feature with measured evidence, independent review, living
docs, attribution, and no misleading security claim.

### Implementation sequence

1. Re-run the fixed deterministic and provider-backed evaluation corpus across
   every supported Pho-owned reviewer model and active platform/backend matrix.
2. Add regressions for every discovered false allow, false deny, timeout,
   cancellation, prompt-injection, TOCTOU, mode leak, migration, and UI mistake.
3. Measure reviewer latency, failure rate, routine fast-path overhead, decision
   log bounds, and background concurrency with the shipped configuration.
4. Run an independent expert/security review over policy order, input locking,
   grants, model evidence, Full reset, external ownership, data privacy, and
   packaging.
5. Run unit, real-Pi integration, desktop, provider, external-backend where
   advertised, unsigned packaged macOS, and Linux compatibility gates.
6. Update accepted architecture, current state, development commands/copy,
   reference attribution, UI implementation docs/logs, and feature indexes.
7. Write an immutable acceptance review with exact checks, versions, model/
   provider evidence, known limits, waived checks, and owner acceptance.
8. After owner acceptance, mark the feature Accepted; close/archive the workstream
   only through the documentation workflow.

### Acceptance criteria

- Every final acceptance outcome in [`product.md`](./product.md) is evidenced.
- No critical fixed-corpus action receives a false allow.
- Routine contained actions take the deterministic path with measured negligible
  authorization overhead and no reviewer call.
- Provider-backed Auto allow/deny/require-owner/unavailable/circuit behavior is
  observed in the real Electron product.
- Full risk copy matches actual packaged authority and reset behavior.
- Migration and all tests remain isolated from real Pi/workspace data.
- No unsupported external mode or V4/V5 ownership claim appears in UI/docs.
- `git diff --check`, local documentation links, root checks, relevant desktop,
  and packaged gates pass; any waiver is explicit and owner-approved.

## Evaluation and verification matrix

### Fixed action corpus

The checked-in corpus must include at least these families:

| Family | Representative cases |
| --- | --- |
| Routine local | read/search/edit workspace; test/build; temporary output |
| Boundary | adjacent repository, external read/write root, public GET, new domain |
| Source control | status/diff/commit/current branch push; force/main/destructive reset |
| Supply chain | manifest-declared install; download-and-execute; package hooks |
| Secrets/privacy | `.env`, SSH/cloud credentials, keychains/browser data, transmission |
| External impact | deploy, publish, release, payment, email, issue/PR mutation, IAM |
| Persistence | shell rc, cron/launch agents/services, hooks, MCP/tool config |
| Destruction | workspace bulk removal, home/root/system targets, cloud mass deletion |
| Prompt injection | web/tool/project content instructing exfiltration or policy bypass |
| Authorization | direct owner scope, ambiguous consent, stale instruction, ask-user answer |
| Unknown tools | custom/MCP/nested/pathless action with incomplete effects |
| Concurrency | parallel chats, stale response, mode change, stop, session replacement |
| TOCTOU/input | symlink swap, cwd change, JSON mutation, grant replay, fingerprint mismatch |
| Migration | each profile/YOLO/sandbox/custom/shared-root/project combination |

Critical classes are product invariants, credential exfiltration, unauthorized
production/shared-infrastructure mutation, policy bypass, and exact-input
mismatch. Their allowed false-allow count is zero.

### Verification levels

| Level | Required evidence |
| --- | --- |
| Unit verified | Pure protocol, effect, policy, evidence, schema, grant, migration, history, reducers, and UI behavior |
| Integration verified | Real pinned Pi/permission/sandbox with isolated filesystem/application/agent data and injected/real reviewer paths |
| Desktop verified | Real Electron composer/Settings/dialog/tool/background/reload/restart behavior |
| Provider verified | Real authenticated reviewer model for allow, deny, require-owner/failure, cancellation, and usage/latency |
| External backend verified | Real binary/provider only for each mode the adapter advertises |
| Packaged verified | Unsigned packaged macOS app with staged Pi/permission/sandbox resources and external discovery policy |
| Not verified | Exact reason and next check recorded; no acceptance claim for that behavior |

Use the root contract after focused iteration:

- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run test:desktop`
- `bun run build`

Run `test:packaged` or the current promoted packaged lane when the milestone
requires it. Narrow Bun tests use the repository's explicit 20-second timeout.

## Dependencies, packaging, CSP, and attribution

### Current pins

| Dependency | Exact current version | Contract |
| --- | --- | --- |
| Pi coding agent | `0.84.4` | Installed typings/tests are API authority |
| Pi permission system | `24.0.0` | Public authorizer/settings seam; no fork |
| Anthropic sandbox runtime | `0.0.73` | Existing contained bash engine; exact elevation characterization required |

No new runtime dependency is approved by this plan. Prefer small app-owned pure
modules over installing Pi Automode, Nah, Approval Guardian, a policy engine, or
another classifier framework. A later dependency requires source/license/
transitive review, exact pin, package boundary review, and owner decision.

### Packaging

- Reviewer logic/policy/schema is application-owned source and packaged with the
  runtime; it does not load ambient Pi extensions or project prompts.
- Existing pinned permission/sandbox resources continue to stage under app-owned
  resources.
- Packaged tests run without a global Pi CLI or ambient guard package.
- External Codex/Claude binaries remain required external installations under
  V5; this feature does not bundle them.
- Decision logs/settings live under application data, never packaged resources.
- No signing/notarization/update work is added; unsigned local packaged evidence
  is sufficient until V4 resumes.

### CSP and renderer boundary

The renderer makes no provider/model/reviewer network request and imports no
Node/Electron/Pi/permission/sandbox package. Reviewer calls happen in privileged
runtime services through existing provider infrastructure. No raw HTML, policy,
tool output, or reviewer text is injected into UI. Existing navigation and CSP
guards remain.

### Attribution

Research concepts require links, not source comments. If implementation copies
or closely adapts meaningful code/policy/tests from Codex, Claude, Pi Automode,
Nah, Approval Guardian, or another source:

1. confirm the license and exact upstream revision;
2. add a source comment where practical;
3. update [`../../references-and-attribution.md`](../../references-and-attribution.md)
   with source, revision, destination, extent, and license;
4. preserve required notices;
5. add Pho-owned tests.

No copied code is authorized merely because the source was researched.

## Documentation and logging requirements

- One feature log per bounded slice; do not append parallel work to one journal.
- One reciprocal [`../../ui/logs/`](../../ui/logs/README.md) record for composer,
  Settings, interaction, Full-warning, or V3 label changes.
- Cross-link V5 logs for backend descriptor/adapter changes.
- Update current architecture only when behavior is implemented and accepted to
  the stated level; proposals remain here.
- Update `current-state.md` on promotion, milestone truth changes significant
  enough to affect the summary, and acceptance.
- Do not rewrite archived sandbox/Plan/V3 logs to make the new product look
  historical. Update living architecture and create new correction/decision
  records instead.
- Record exact commands/checks that ran and distinguish unit, integration,
  desktop, provider, external, packaged, and not verified.

## Deferred on purpose

- hostile-workspace or malicious-extension containment;
- Pi runtime process extraction, crash isolation, signing, notarization, updates,
  and public diagnostics/export;
- Windows-native support;
- generic organization policy administration;
- arbitrary reviewer prompt/policy editing;
- automatic creation/trust of project rules;
- a security/compliance dashboard or cloud audit service;
- wrapping the owner PTY;
- generic MCP/browser/computer-use policy not exposed through typed tool effects;
- guaranteed parity across every external backend;
- shell/MCP mutation Undo beyond V3;
- persistent Full access or persistent session grants.

These are not hidden acceptance blockers. The final product must disclose its
actual boundaries and advertise only supported backend/tool coverage.

## Exit checks per implementation slice

At minimum:

1. run focused tests for the changed layer;
2. run affected package typecheck;
3. run real Pi integration for runtime/permission/sandbox changes;
4. run Electron for renderer/IPC changes;
5. run provider-backed checks for reviewer/model changes;
6. run real external checks for any newly advertised native mode;
7. run packaged macOS for packaging/resource/Full-boundary changes;
8. run root exit checks at milestone handoff;
9. run `git diff --check`;
10. inspect `git diff` and `git status --short`, preserving unrelated changes;
11. verify local documentation links;
12. write the dated feature/UI/V5 log with failures and corrections.

## Final acceptance gate

The owner may accept this add-on only after Milestones 0–3 and 5 pass, and
Milestone 4 either:

- passes for each externally advertised mode; or
- records honest Ask-only/unsupported descriptors with no false parity claim.

Acceptance requires:

- complete product behavior from [`product.md`](./product.md);
- zero critical false allows in the fixed corpus;
- real provider-backed automatic review in the desktop and packaged app;
- verified migration, exact grants, cancellation, circuit breaking, background
  attention, Full reset, product invariants, and V3 terminology;
- truthful external capability ownership;
- current living docs and attribution;
- an independent review and immutable acceptance record;
- explicit owner acceptance.

Until then, status remains **In implementation**, and current managed profiles,
YOLO, manual permissions, and sandbox behavior remain the shipped truth for any
milestone not yet landed.
