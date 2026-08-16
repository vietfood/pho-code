# Runtime and data ownership

## Status

Accepted architecture for personal v1, v2, and v3. The immutable V3 recovery contract and evidence live in [`../archive/v3/`](../archive/v3/README.md).

## Service ownership

The application coordinates use cases. The runtime is the only product layer that imports Pi.

`packages/application` owns:

- command validation beyond protocol shape;
- active workspace/session selection;
- joining Pi session truth with application metadata;
- recent-workspace, archive, settings, and credential use cases;
- session catalog joins across Pi session lists, metadata lifecycle, and live runtime activity;
- V3 review-scope/input validation before delegating to runtime;
- stable error mapping and shutdown coordination.

`packages/runtime` owns:

- shared Pi model/settings/credential services where supported;
- the bounded session-controller registry;
- Pi session construction, subscription, replacement, prompt, queue, abort, and disposal;
- explicit feature-manifest composition and diagnostics;
- permission host-UI binding and feature-specific settings adapters;
- prepared images, local retrieval, public web tools, text-only skill sources, and the fixed GitHub MCP adapter;
- context-prompt compilation/reinjection and assistant display overlays through Pi custom entries;
- accepted V3 write/edit capture, ledger, diff, Approve, and per-file recovery;
- normalized protocol projections.

Application code does not know Electron APIs. Runtime code does not know Electron or React.

## Session lifecycle

State is keyed by composite `{workspaceId, sessionId}` identity. Today `workspaceId` is the canonical absolute workspace path. The registry admits at most eight resident controllers and four concurrent runs. Every resident session controller owns its:

- `AgentSessionRuntime` and Pi event subscription;
- run, queue, prepared-attachment, extension, and host-dialog state;
- transcript/activity projection;
- workspace-scoped resources required by that session.

Selecting another chat does not transfer or dispose the previous controller. Background work remains attributed to its owner.

The application session catalog joins Pi's workspace session list, persisted archive/view/outcome metadata, and `listSessionActivity()` without opening every session. `getSessionSnapshot` retrieves one cached/resident authoritative snapshot without making renderer selection the source of ownership.

When Pi replaces the active session inside one controller:

1. stop accepting new work for the old binding;
2. cancel stale host interactions and unsubscribe;
3. bind extensions and subscribe to the replacement;
4. publish an authoritative snapshot;
5. dispose resources whose ownership ended.

Application shutdown stops admission, aborts or settles active work according to policy, disposes all controllers, then shared services, under one bounded deadline.

## Sources of truth

### Pi-owned

- JSONL session tree, transcript entries, compaction entries, and model context;
- model/provider behavior and compatible credentials;
- agent loop, built-in tools, extension execution, and final message state.

Pi JSONL is not copied into application metadata. Assistant rewrites are explicit display overlays stored as Pi custom entries; context-prompt customization is another Pi custom entry whose compiled prompt is looked up from the live session and re-injected on `before_agent_start`. Neither mutates original assistant messages or workspace context files.

### Application-owned

- recent workspace order and selected identities;
- archive/restore metadata and UI preferences;
- metadata schema v6 lifecycle/view/outcome records, project permission trust, typed appearance, enabled skill sources, and GitHub MCP enabled state;
- opaque credential-flow handles;
- workspace retrieval indexes under application data;
- accepted feature-specific operational state.

### Renderer-owned transient state

- drafts before durable persistence;
- focus, hover, expansion, scroll, and optimistic interaction state;
- keyed live streaming projections that can be replaced by authoritative snapshots.

Renderer state never authorizes filesystem, session, credential, or process behavior.

## Storage roots

Normal production state is rooted under Electron `userData`:

```text
userData/
├── app-metadata.json
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
