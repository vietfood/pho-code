# ADR 0004: Expand Phase 6 into a native coding workbench

- Status: Accepted
- Decision date: 2026-07-17
- Scope: Pho Code V1 GPUI product surface and Phase 6 delivery boundary
- Decision owners: Pho Code maintainers
- Supersedes: [ADR 0003](0003-deepseek-api-first-backend.md) only where it deferred the GPUI visual language or excluded workbench panes from Phase 6
- Superseded by: [ADR 0005](0005-release-v1-and-defer-phase-6b.md) only for the original all-or-nothing Phase 6 release gate, and [ADR 0006](0006-chat-first-native-workbench.md) only for default pane visibility, transcript disclosure, terminal reveal behavior, and visual hierarchy

## Document role

This ADR owns the decision to make the Phase 6 native application a four-pane personal coding workbench while retaining ADR 0003's backend, execution, safety, and shared-runtime boundaries. It changes the accepted GPUI product scope; it does not generalize the backend, introduce parallel agent work, or replace the proven command-mode harness.

[The GPUI workbench architecture](../architecture/gpui-workbench.md) owns current behavior. [The Phase 6 directory](../implementation/v1/phase-6/README.md) owns delivery order, work packages, evidence, and gates. Source and dependency findings live under [research](../research/).

## Context

Phase 5 proved durable sessions, recovery, approvals, tools, and the command/runtime boundary. The former Phase 6 plan intentionally limited the first GPUI release to the execution trace, composer, approvals, and account/session controls. Before Phase 6 began, the desired personal product surface was clarified through a reference layout: workspaces and chats at the left, chat in the primary pane, a read-only code/diff viewer above a first-class terminal, and a file tree at the right.

Treating that shell as visual decoration would be incorrect. Workspace switching, recent-session projection, Git metadata, file discovery, read-only file snapshots, uncommitted diffs, and interactive PTYs require new application operations and actors below the presentation boundary. They also require lifecycle, cancellation, bounds, recovery, and native interaction evidence. The change therefore needs an explicit decision and architecture rather than additions hidden inside GPUI views.

The reference layout also showed multiple provider-branded chats running concurrently. That capability is not required for Phase 6. The existing DeepSeek backend remains the only supported real backend, and the coordinator retains the one-active-agent-turn rule.

## Decision

### Product surface

Phase 6 delivers one native macOS window with four functional regions:

1. A collapsible navigation sidebar for registered workspaces and their recent sessions.
2. A primary chat pane with open-session tabs, a qualified DeepSeek profile header, a virtualized execution trace, semantic activity status, composer, send/cancel controls, and session/workspace footer.
3. A read-only file and uncommitted-diff viewer above a tabbed interactive user terminal.
4. A collapsible file tree for the selected workspace.

The regions may resize and collapse within documented minimums. The initial layout is stable and recoverable; arbitrary extension panels and a public docking/plugin API are not V1 requirements.

### Execution boundary

V1 retains one concrete `DeepSeekBackend`, one selected workspace/session for agent work, one active root agent turn globally, one backend stream, one active agent tool, and sequential tool execution. Session tabs are presentation state over durable sessions. They do not grant background execution, and inactive tabs cannot own a model stream, approval, or tool.

The application may retain several registered workspaces and several open session projections, but only one workspace/session pair is selected for agent operations. A workspace or session switch that would detach the user from an active turn, approval, or tool must be refused or explicitly sequence cancellation and terminal confirmation before the switch. A clicked row never silently retargets an in-flight operation.

Provider branding in V1 is derived from the qualified DeepSeek session profile. Phase 6 does not introduce a provider registry, external `claude` or `codex` process adapter, second credential system, or generalized provider configuration.

### Read-only workspace surfaces

The file tree, file viewer, Git branch/diff projection, and uncommitted-diff tab are read-only application features. GPUI views dispatch typed operations and render bounded results; they do not call filesystem or Git APIs directly.

The viewer supports stable line numbers, text selection, bounded search, and syntax highlighting for a deliberately qualified language set. It has no save, autosave, unsaved buffer, formatting, LSP, completion, rename, or refactoring path. Agent mutations continue through the existing exact-effect patch and shell contracts. A file changed on disk is reloaded through an explicit snapshot-generation transition rather than merged into a view-owned buffer.

### Interactive terminal

The embedded terminal is a user-operated local PTY and a first-class pane. Its processes are owned by a coordinator-managed terminal actor, not by the GPUI view and not by the agent tool runtime. Terminal input is direct user authority and therefore does not pass through model tool approval. The interface must state that terminal commands run with the user's account permissions and are not sandboxed.

The PTY does not become a model tool, approval channel, provider context source, or substitute for the existing noninteractive `shell` tool. Agent shell requests remain exact, digest-bound, noninteractive, and durably paired with tool results. Terminal tabs, process exit, resize, close, shutdown, and uncertain process termination require their own bounded lifecycle contract before implementation.

### Chat content rendering

Assistant text is untrusted Markdown input. Phase 6 renders a reviewed Markdown subset with fenced code, tables, lists, links, and inline/block math while preserving an always-available plain-source fallback. Rendering is offline, bounded, and independent from provider or workspace network access. Raw HTML, MDX expressions, remote images, active content, and URI schemes outside the explicit allowlist are disabled.

LaTeX rendering is a presentation transformation only. It cannot run a workspace command, load a remote resource, read arbitrary files, or mutate the canonical session record. Parse/render failure shows the original delimited source with a bounded diagnostic; it never drops message content or fails the turn.

### Activity language

Canonical runtime states remain semantic and exhaustive. A presentation-owned activity lexicon may map those states to concise verbs such as `Reading…`, `Running…`, or a product-voice variant such as `Shimmying…`. The visible verb is not persisted as lifecycle truth and cannot replace approval, cancellation, failure, or terminal state. Accessibility text and diagnostics use the stable semantic activity name.

### Component reuse

Phase 6 may use the audited `gpui-component` source only after Pho Code resolves it to the same pinned GPUI source identity, qualifies the selected feature set, reviews licenses/advisories, and proves that component examples do not move files, processes, sessions, or orchestration into views. `refs/**` remains read-only evidence and is never an application extension point.

## Consequences

- Phase 6 is larger than a presentation-only adapter and needs new headless actors for workspace registry/projection, file snapshots, Git metadata/diffs, and PTY lifecycle.
- The current reducer and coordinator remain the authority for agent work. Workbench actors add typed state without introducing a second agent runtime.
- A dedicated Phase 6 directory is warranted because dependency qualification, representative UI design, pane-specific work packages, native evidence, and release work each need independent gates.
- The native application can support a complete personal coding workflow without claiming to be a general IDE or multi-provider agent host.
- GPUI/component version alignment and production-quality math rendering are explicit qualification gates, not implementation assumptions.

## Rejected alternatives

### Preserve the former minimal Phase 6 surface

Rejected because it would ship the proven harness in a transient chat shell rather than the selected personal product. It would also defer the file/terminal context needed to supervise coding work in one window.

### Implement concurrent provider-branded agent tabs now

Rejected for V1. Concurrent turns and additional backends would change credential custody, session identity, scheduling, approvals, recovery, and compatibility qualification. Open tabs remain useful without those semantics.

### Treat the terminal as the agent shell tool

Rejected. A user PTY is interactive and user-authorized; an agent shell call is noninteractive, approval-bound, bounded, journaled, and replay-sensitive. Conflating them would weaken both lifecycle and safety guarantees.

### Add a writable editor

Rejected for Phase 6. Unsaved buffers, save authority, merge/conflict policy, file watching, encoding preservation, and interaction with agent patches require a separate design and verification gate.

### Execute the upstream MathJax story unchanged

Rejected as an architecture assumption. The audited story launches an external Node process and depends on a development `mathjax-full` tree. Phase 6 must qualify a packaged, bounded, offline renderer or retain a source fallback.

## Reversal conditions

Revisit this decision if the component graph cannot be aligned to one qualified GPUI revision, a safe packaged math renderer cannot meet the fallback contract, a user PTY cannot be supervised without destabilizing agent-runtime shutdown, or native evidence shows the four-pane minimum layout is unusable on the supported display class. A reversal must preserve the proven command/runtime behavior and be recorded in a later ADR.
