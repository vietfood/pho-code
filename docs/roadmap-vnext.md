# Pho Code next-version roadmap

This roadmap begins after the accepted personal v1. It preserves the v1 architecture and standalone-product philosophy, but it is not a promise that every item ships in one release. Choose a capability because it improves daily use, then give it a bounded milestone when its requirements are known.

The owner has accepted the autonomy foundation, retrieval, provider-account, and session-continuity milestones; and moved curated skills plus read-only GitHub MCP to draft Milestone 4 in [`product-v2.md`](./product-v2.md) and [`implementation-plan-v2.md`](./implementation-plan-v2.md). The items below remain candidates until explicitly promoted; this file no longer owns Milestones 0 through 4.

## Rules carried forward

- Pho Code remains a standalone harness built on an embedded, pinned Pi runtime.
- Extensions, skills, prompts, and MCP integrations are source-selected product features, not user-installable plugins.
- Every selected feature ships with its required code, dependencies, assets, notices, host adapters, and typed settings.
- Users may configure behavior deliberately exposed by Pho Code; they may not install, remove, enable, or replace executable feature composition.
- Packaged builds resolve immutable features only from application resources and fail closed when a feature is missing or mismatched.
- Mutable credentials, sessions, permission state, and application metadata remain outside the application bundle.

## Candidate milestone: additional baked MCP capabilities

Milestone 4 owns the first read-only GitHub capability. Begin another MCP capability only after the owner specifies the exact recurring task it solves. This remains source/build configuration, not an end-user server manager.

- Implement the internal `McpRuntime` boundary.
- Select, review, and exactly pin an adapter version.
- Add each server/adapter as a named manifest feature with fixed transport and tool exposure.
- Add lazy connection, status, bounded calls, abort, cleanup, error normalization, and secret redaction.
- Route mutating or high-cost calls through the baked permission feature where appropriate.
- Ship every required adapter/server dependency, or explicitly document a selected operating-system/service dependency.
- Test only the stdio or HTTP transports actually used by selected features.

Pho Code will not discover arbitrary `.mcp.json` files, expose server add/edit/remove controls, or use runtime unpinned `npx` for built-in features.

## Candidate milestone: additional baked features

Milestone 4 owns the first five text-only skills. Begin another extension-, skill-, prompt-, or service-backed feature only after the owner names its behavior.

- Inventory license, dependency, Pi-version, host-UI, and packaging requirements.
- Use a pinned Pi package/path for portable features and named inline factories/services for desktop-dependent behavior.
- Add typed settings only for behavior Pho Code intentionally exposes.
- Prove the feature works from standalone application resources without a matching user-global Pi package.
- Preserve auth/model/session/context interoperability while continuing to ignore user/project executable feature overlays.
- Update attribution and third-party notices with the feature.

## Candidate production/distribution track

Start this track only if Pho Code becomes more than a personal local application:

- signed/notarized macOS distribution and an update channel;
- verified Linux artifacts and desktop integration;
- richer project-trust UX and managed persistent decisions;
- Pi runtime isolation in an Electron utility/child process;
- OS/container/VM execution sandbox and a policy broker;
- package provenance, review, signing, allowlisting, and update policy;
- encrypted credential storage and MCP OAuth UX;
- crash recovery, migrations, rollback, telemetry policy, public threat model, and security-response process;
- a Tauri proof of concept only if measured Electron costs justify the additional Node-sidecar boundary.

## Optional product expansions

- multi-agent orchestration and worktree automation;
- integrated terminal and diff/file workbench;
- session fork/tree/compaction UI;
- arbitrary document/binary attachments and richer previews beyond v2 Milestone 1 images;
- remote access or server mode.

Windows, mobile UI, a plugin marketplace, arbitrary renderer extensions, and user-managed MCP servers remain out of scope unless the product philosophy is deliberately changed.
