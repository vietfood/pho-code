# Pho Code future-release roadmap

This roadmap begins after v2. It preserves the standalone-product philosophy, but it is not a continuation of the v2 acceptance plan and is not a promise that every item ships in one release. The former “Milestone 5: advanced features” is split below because browser control, a terminal, multi-agent worktrees, recovery tooling, and runtime isolation have different trust, lifecycle, and verification costs.

V2 consists only of Milestones 0 through 4 and is accepted under [`archive/v2`](../archive/v2/README.md). Interoperable Codex/Cursor/Claude/Pi user skills, three Pho Code-authored skills, and a Settings-controlled read-only GitHub MCP with a persistent PAT closed Milestone 4. This file is now the promotion queue for later releases.

UI polish, accessibility, performance work, defect fixes, and owner-reviewed additions or refinements to Pho Code's text-only skill bundle may ship as v2.x maintenance when they preserve the accepted boundaries. A new executable capability, MCP server, remote mutation path, browser profile, PTY, subagent runtime, or process-isolation boundary must be promoted from this roadmap into its own implementation plan. Promoted add-ons that are not a numbered product version live under [`features`](../features/README.md).

## Rules carried forward

- Pho Code remains a standalone harness built on an embedded, pinned Pi runtime.
- Extensions, skills, prompts, and MCP integrations are source-selected product features, not user-installable plugins.
- Every selected feature ships with its required code, dependencies, assets, notices, host adapters, and typed settings.
- Users may configure behavior deliberately exposed by Pho Code; they may not install, remove, enable, or replace executable feature composition.
- Packaged builds resolve immutable features only from application resources and fail closed when a feature is missing or mismatched.
- Mutable credentials, sessions, permission state, and application metadata remain outside the application bundle.

## Promotion rules

Each phase below is optional and independently promotable. Promotion must name the owner outcome, accepted platforms, trust model, permission categories, persisted state, recovery behavior, packaged dependencies, and verification gate. Completion of one phase does not imply approval of the next.

Do not group phases merely to label a major release complete. Prefer the smallest vertical slice that is useful in normal work and can fail or be disabled without destabilizing conversation, sessions, credentials, or accepted baked features.

## Phase A: change review and recovery — promoted as v3

The owner promoted this phase on 2026-08-15 as **V3 — Change Control and Recovery**. The selected product model applies Pi `write` and `edit` immediately, then presents exact tracked changes in a read-only workbench with Approve and conflict-safe Undo. Approve closes review state; it is not Git persistence. The first release tracks attributable `write`/`edit` changes and does not promise recovery for arbitrary shell or external mutations.

The active proposal is defined in [`v3/product.md`](./v3/product.md) and [`v3/implementation-plan.md`](./v3/implementation-plan.md). Those documents are implementation contracts, not acceptance evidence; v3 remains incomplete until its milestone gates pass.

Build the owner-facing control layer before adding more autonomous execution surfaces:

- a file-change summary grouped by workspace and active chat;
- a bounded diff/file workbench that reads only exact tracked changes and never becomes a second editor architecture by accident;
- explicit checkpoints with clear ownership, retention, and size limits;
- safe undo/revert operations that preview the exact effect and never rely on broad force reset or permanent deletion;
- recovery after interrupted runs, renderer reload, or application restart;
- truthful handling of user edits that overlap agent changes.

This phase should build on Milestone 3's composite session ownership. It must distinguish a Pi transcript from filesystem recovery state and must not claim that Git history alone can recover untracked or externally modified files.

## Phase B: session intelligence and richer input

Extend the accepted session lifecycle without introducing multi-agent execution:

- fork and tree navigation while leaving Pi JSONL authoritative;
- visible automatic compaction events, manual compact, and an explanation of context composition and token impact, developed from the proposed [compaction feature design](../features/compaction.md);
- richer selected-file, text, image, and bounded document attachments with explicit type/size controls;
- per-run/provider usage and optional soft budget warnings;
- integrated diagnostics and redacted log export for auth, baked features, indexes, MCP state, and interrupted runs.

This phase must define what is copied, shared, or referenced when a chat forks and how archive, Trash, restore, compaction, and crash restoration interact.

## Phase C: isolated browser automation

Add browser control only through an app-owned Pho Code profile first. Separate operations by remote effect:

- navigation, public search, and page reading;
- authenticated reading from the isolated profile;
- downloads with bounded destination and content handling;
- clicks that mutate remote state;
- uploads, form submission, messages, purchases, and other externally visible actions.

Read operations may support scoped approval; mutation, upload, and submission require explicit contextual approval. The first slice must not attach to the owner's everyday Chrome profile, reuse unrelated browser cookies, or expose a generic renderer-to-browser command channel. Downloads and profile cleanup use recoverable lifecycle rules and never fall back to permanent deletion.

## Phase D: integrated terminal — promoted as a standalone add-on

The owner promoted this phase on 2026-08-16 as an **add-on**, not as v3. Product and plan live under [`features/terminal`](../features/terminal/README.md). Those documents are implementation contracts, not acceptance evidence; the add-on remains incomplete until its milestone gates pass.

Selected contract:

- one PTY per selected workspace; chat switch keeps the shell;
- host chrome on the existing right sidebar (Terminal surface beside Changes and Context prompt);
- renderer VT via pinned `ghostty-web`, not xterm.js; privileged PTY via pinned `node-pty` in Electron main behind `TerminalHost`;
- owner-typed commands are owner authority; agent `bash` stays a separate gated tool;
- hide/collapse does not SIGTERM; Restart and Close are explicit;
- no raw PTY, process handle, arbitrary IPC channel, or Node primitive in the renderer.

Closing a panel must not silently terminate a running process. Application quit must bound graceful shutdown and report what could not be preserved.

## Phase E: multi-agent and worktree workflows

Add orchestration only after single-agent review and recovery are dependable:

- explicit subtask ownership, bounded agent concurrency, cancellation, and status;
- separate session and permission state for every agent;
- worktree creation, branch naming, path ownership, conflict detection, integration preview, and recoverable cleanup;
- no concurrent writes to the same owned files without an explicit reconciliation path;
- a clear distinction between agent delegation, independent chats, and Pi session forks;
- owner review before remote mutation, push, publication, or deployment.

This phase must specify failure handling for partial worktree creation, child-process crashes, permission dialogs on background agents, application restart, and conflicting user edits. Worktree removal may use only a verified recoverable strategy; if Git itself requires irreversible cleanup, the operation must stop and explain the manual prerequisite rather than using `rm`.

## Phase F: runtime isolation and public distribution

Start this phase only if measured risk or distribution goals justify it:

- move the Pi runtime and executable feature hosts into an Electron utility or child process with a narrow typed broker;
- evaluate OS/container/VM execution isolation separately from renderer sandboxing;
- signed and notarized macOS artifacts, update channels, rollback, and release provenance;
- verified Linux artifacts, desktop integration, Secret Service behavior, and native dependency coverage;
- migrations, telemetry policy, public threat model, security-response process, and managed feature-update policy;
- a Tauri proof of concept only if measured Electron costs justify the additional Node-sidecar boundary.

Process separation is not called a sandbox unless its filesystem, network, credential, and child-process authority is actually constrained and tested.

## Additional baked MCP capabilities

Milestone 4 owns the first read-only GitHub capability. Begin another MCP capability only after the owner specifies the exact recurring task it solves. This remains source/build configuration, not an end-user server manager.

- Implement the internal `McpRuntime` boundary.
- Select, review, and exactly pin an adapter version.
- Add each server/adapter as a named manifest feature with fixed transport and tool exposure.
- Add lazy connection, status, bounded calls, abort, cleanup, error normalization, and secret redaction.
- Route mutating or high-cost calls through the baked permission feature where appropriate.
- Ship every required adapter/server dependency, or explicitly document a selected operating-system/service dependency.
- Test only the stdio or HTTP transports actually used by selected features.

Pho Code will not discover arbitrary `.mcp.json` files, expose server add/edit/remove controls, or use runtime unpinned `npx` for built-in features.

## Additional baked features

Milestone 4 owns the first three Pho Code-authored text-only skills and the fixed Codex/Cursor/Claude/Pi source adapters. Begin another extension-, skill-source, prompt-, or service-backed feature only after the owner names its behavior.

- Inventory license, dependency, Pi-version, host-UI, and packaging requirements.
- Use a pinned Pi package/path for portable features and named inline factories/services for desktop-dependent behavior.
- Add typed settings only for behavior Pho Code intentionally exposes.
- Prove the feature works from standalone application resources without a matching user-global Pi package.
- Preserve auth/model/session/context interoperability while continuing to ignore user/project executable feature overlays.
- Update attribution and third-party notices with the feature.

OAuth is not deferred work for the accepted GitHub MCP. A future MCP may use OAuth only if that specific service requires it and its promoted plan owns the complete flow. Remote access or server mode also requires a separate future phase because it changes the local-owner trust model.

Windows, mobile UI, a plugin marketplace, arbitrary renderer extensions, and user-managed MCP servers remain out of scope unless the product philosophy is deliberately changed.
