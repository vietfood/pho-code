# Runtime and data ownership

## Status

Accepted architecture for personal v1, v2, and v3. The immutable V3 recovery contract and evidence live in [`../archive/v3/`](../archive/v3/README.md). Plan/Agent is accepted; its immutable contract lives in [`../archive/features/plan-agent/`](../archive/features/plan-agent/README.md).

Current source also contains the implemented, still-unaccepted V5 candidate extraction and Task intelligence described below. This records truthful package ownership without promoting the version.

## Service ownership

The application coordinates use cases. Privileged runtime packages are the only product layers that import Pi; under V5 M0, the reusable imports live in `@pho-agent/runtime` and Pho Code composes them through its product runtime.

`packages/application` owns:

- command validation beyond protocol shape;
- active workspace/session selection;
- joining Pi session truth with application metadata;
- recent-workspace, archive, settings, and credential use cases;
- session catalog joins across Pi session lists, metadata lifecycle, and live runtime activity;
- V3 review-scope/input validation before delegating to runtime;
- stable error mapping and shutdown coordination.

`packages/pho-agent/packages/runtime` currently owns under the unaccepted V5 candidate:

- Pi service construction behind the feature API and opaque scope adapter;
- the bounded session-controller registry algorithm;
- the shared feature model/loader flattening and context-prompt hook;
- branch-aware Task Brief/evidence/verification/completion projection plus the reusable Pi feature and provider interface;
- Plan/Agent, ask-user, session todo, skill source/invocation, path containment, and the reviewed GitHub MCP lifecycle;
- the implemented-but-unaccepted reusable approval action/decision contracts, exact-input controller, ordered policy/revalidation pipeline, memory grants, reviewer lifecycle/circuit breaker, process review pool, and Pi whole-action interception.

`packages/runtime` owns or adapts:

- production session/run/model routing through the Pho Agent backend registry; Pi is the default registration while Codex and Claude ACP are lazy/experimental and public `workspaceId` remains the product scope;
- compatibility projection from backend-neutral snapshots into the existing Pho Code session snapshot, model/reasoning/Fast controls, transcript row, keyed live-work deltas, activity, and catalog shapes;
- backend-neutral interaction request/settlement routing into the existing host-dialog surface, with pending request ownership retained in privileged runtime state;
- product-owned Codex developer instructions plus the scoped read-only workspace-reference dynamic tool; Pi's compiled prompt/tool registry remains owned by the Pi path, and ACP client-tool parity is not implied;
- shared Pi model/settings/credential services where supported;
- Pho Code composite identity over the shared bounded registry;
- Pi session construction, subscription, replacement, prompt, queue, abort, and disposal;
- Pho Code feature-manifest selection, resources, and diagnostics over the shared feature model;
- permission host-UI binding and feature-specific settings adapters;
- prepared images, local retrieval, public web tools, curated skill resources, and Pho Code GitHub MCP enablement/credential/artifact policy;
- context-prompt compilation/reinjection and assistant display overlays through Pi custom entries;
- accepted V3 write/edit capture, ledger, diff, Approve, and per-file recovery;
- the Pho Code Task adapter, reviewed command-result verification, initial local evidence provider, and authoritative product snapshot projection over reusable branch state;
- the Pho Code Plan/Agent context-policy adapter; shared `ask_user_question`, Plan write-tool policy, session `todo`, Plan document + Execute live in `@pho-agent/runtime`; `custom`/`editor` still throw;
- normalized protocol projections;
- approval-mode product invariants, contained/sandbox/elevated/Full execution adapters, reviewer-model/evidence selection, settings/migration/history, and authoritative Pho Code projections over the shared Pho Agent controller.

Application code does not know Electron APIs. Neither runtime package knows Electron or React, and `@pho-agent/runtime` cannot import `@pho-code/*`.

## Session lifecycle

State is keyed by composite `{workspaceId, sessionId}` identity. Today `workspaceId` is the canonical absolute workspace path. The registry admits at most eight resident controllers and four concurrent runs. Every resident session controller owns its:

- `AgentSessionRuntime` and Pi event subscription;
- run, queue, prepared-attachment, extension, and host-dialog state;
- transcript/activity projection;
- workspace-scoped resources required by that session;
- approval controller, pending exact request/review activity, memory-only grants, and current per-chat mode. These revoke/reset on the feature's documented generation, replacement, archive, and process boundaries.

Selecting another chat does not transfer or dispose the previous controller. Background work remains attributed to its owner.

The application session catalog joins Pi's workspace session list, persisted archive/view/outcome metadata, and `listSessionActivity()` without opening every session. `getSessionSnapshot` retrieves one cached/resident authoritative snapshot without making renderer selection the source of ownership.

When Pi replaces the active session inside one controller:

1. stop accepting new work for the old binding;
2. cancel stale host interactions and unsubscribe;
3. bind extensions and subscribe to the replacement;
4. publish an authoritative snapshot;
5. dispose resources whose ownership ended.

Application shutdown stops admission, aborts or settles active work according to policy, disposes all controllers, then shared services, under one bounded deadline. `abortRun` is bounded (accepted 2026-08-19; archived [`agent-stop`](../archive/urgent/agent-stop/README.md)): it cancels pending host dialogs, signals Pi abort (`abortBash` when running, `abortRetry`, `abortCompaction`, then `abort()`), races idle against a 1 s deadline, publishes `cancelled` without awaiting `promptDone` on the IPC path, and recovers a still-busy session by reopening its controller from Pi JSONL. Controller disposal uses the same bound, and the UI can loop `abortRun` over all live activity rows through Stop-all.

## Sources of truth

### Pi-owned

- JSONL session tree, transcript entries, compaction entries, and model context;
- model/provider behavior and compatible credentials;
- agent loop, built-in tools, extension execution, and final message state;
- Plan/Agent session `todo` lists in Pi tool details (not a separate application store).
- unaccepted V5 Task candidate entries on the active Pi branch: `pho-agent.task-brief`, `pho-agent.evidence-pack`, `pho-agent.verification`, and `pho-agent.completion`.

Pi JSONL is not copied into application metadata. Assistant rewrites are explicit display overlays stored as Pi custom entries; context-prompt customization is another Pi custom entry whose compiled prompt is looked up from the live session and re-injected on `before_agent_start`. Task candidate entries are append-only and reconstructed from the active branch; reset/reopen append new revisions rather than mutating history. None of these entries mutates original assistant messages or workspace context files.

### Application-owned

- recent workspace order and selected identities;
- archive/restore metadata and UI preferences;
- metadata schema v8 lifecycle/view/outcome records, project permission trust, typed appearance, enabled skill sources, GitHub MCP enabled state, and per-chat durable Ask/Auto choice (never Full);
- typed approval settings in `approval-modes.json` and bounded redacted records in `approval-decisions/v1/history.json`;
- agent-tool sandbox policy in `sandbox-settings.json` (enable defaults on; network mode, domains, extra paths; extra paths also gate in-process `read`/`write`/`edit`; not Pi JSONL);
- opaque credential-flow handles;
- workspace retrieval indexes under application data;
- accepted feature-specific operational state.

### Renderer-owned transient state

- drafts before durable persistence;
- focus, hover, expansion, scroll, and optimistic interaction state;
- keyed live streaming projections that prefer newer cumulative snapshots, preserve current live content across empty same-run snapshots, and are replaced by authoritative terminal snapshots.

Renderer state never authorizes filesystem, session, credential, or process behavior.

## Storage roots

Normal production state is rooted under Electron `userData`:

```text
userData/
├── app-metadata.json
├── approval-modes.json
├── approval-decisions/v1/history.json
├── sandbox-settings.json
├── pi-agent/
│   ├── sessions/
│   ├── credentials and model state
│   └── permission operational data
├── retrieval/<workspace-hash>/
└── change-ledger/v1/
    ├── manifests/
    ├── blobs/
    └── tmp/
```

`PHO_CODE_USER_DATA_DIR` replaces the full application-data root for isolated development/tests. `PHO_CODE_AGENT_DIR` explicitly replaces only the Pi data root and is disclosed as external/shared.

Do not store mutable sessions, credentials, indexes, or settings in packaged resources. Do not use another Pi installation as a feature-composition source.

The V3 ledger lives under application data at `userData/change-ledger/v1/`, separate from `pi-agent/` and the workspace. Its accepted retention and recovery limits are recorded in the archived [`V3 product contract`](../archive/v3/product.md).

## Credentials and external services

Provider login and API-key import stay in privileged runtime services. The renderer receives provider metadata, bounded prompts/device codes, status, and opaque browser-link handles—not tokens, stored secrets, or authorization URLs.

The GitHub MCP PAT remains in OS-backed secret storage. One pinned, packaged, read-only GitHub server is application-owned and exposed through an allowlisted Pi tool adapter. No ambient `.mcp.json`, environment-token discovery, or generic MCP manager exists.

## Filesystem and process seams

Filesystem reads/writes, canonical path resolution, recoverable Trash, process launch, secrets, and packaged-resource lookup are injected interfaces. This keeps the runtime testable and permits later process extraction.

Recoverable removal uses the operating-system Trash facility and never falls back to permanent deletion. Tests use owned temporary directories and never target real user Pi/workspace state.

The proposed owner terminal follows the same rule but remains Electron-owned behind `TerminalHost`; it is not a Pi runtime or session-controller resource.

## Recovery and reconciliation

On renderer reload or missed events, request full snapshots. On process restart, reconstruct from validated Pi JSONL and application metadata; do not infer final state from streaming text or repair session files speculatively.

Unknown schema versions, corrupt optional indexes, and unavailable baked features fail closed with bounded diagnostics. Ordinary chat should continue when a nonessential add-on can degrade safely.
