# Product definition: personal v1

## Current implementation status

Milestones 0 through 5 are accepted, and this document describes the completed personal v1. The application opens a workspace, runs a persistent Pi session, streams multi-turn conversation/tool UI, aborts, reopens Pi JSONL history, composes only source-controlled features, exposes typed appearance/permission settings, imports supported provider API keys, and runs from a self-contained unsigned macOS bundle. See the [Milestone 5 code review](./reviews/milestone-5-code-review.md).

## Outcome

The first version is a usable personal desktop harness for Pi. It should let its owner work in a local repository through a responsive graphical conversation without requiring the Pi terminal UI.

The v1 goal is not “Pi with every possible integration.” It is the smallest coherent product that proves Pi can be embedded behind a well-structured desktop UI and extended later without rewriting the core.

The mature product is standalone. Pi is an embedded engine, not an external application the user must prepare. Installing Pho Code must install the pinned Pi runtime and the complete source-selected feature bundle. No baked feature may depend on the user separately installing a Pi package, copying a skill, adding an `npm:` entry to Pi settings, or configuring an MCP adapter in another Pi installation.

## Audience and assumptions

The only intended user is the owner/developer of the application.

v1 assumes:

- the user understands that an agent can edit files and run commands;
- selected workspaces and the source-reviewed baked feature set are trusted by the owner;
- model credentials are configured through Pi-compatible mechanisms;
- macOS is the primary development and verification platform;
- Linux compatibility is maintained where it does not delay the first usable macOS build;
- public distribution, adversarial multi-user operation, and unattended untrusted execution are future concerns.

These assumptions reduce scope. They do not permit the UI or documentation to imply that Pi extensions or tools are sandboxed.

## Core user journey

1. Launch the application.
2. Choose a local workspace.
3. See available authenticated models or a clear setup error.
4. Start a new session or open a recent session for that workspace.
5. Enter a text prompt.
6. Watch assistant text, thinking state, and tool activity update incrementally.
7. Stop the run when needed.
8. Review the completed response and tool results.
9. Quit and later resume the persisted Pi session.
10. Use the built-in permission dialog when a gated tool requires approval.

## Functional scope

### Workspace

- Select a local directory through the native directory picker.
- Remember a small list of recently opened workspaces in application metadata.
- Canonicalize workspace paths in the privileged layer.
- Display missing/inaccessible workspace errors without silently creating replacements.

Worktrees, remote workspaces, multiple simultaneous workspace windows, and repository management are deferred.

### Models and credentials

- Ask Pi's model runtime for configured and available models.
- Select a model and supported thinking level for a session.
- Explain when no authenticated model is available.
- Never send raw stored credentials to the renderer.

Settings provides a compact in-app API-key import through Pi `ModelRuntime.login`. A comprehensive credential editor, OAuth onboarding, and provider-specific setup wizards remain out of scope. The renderer lists configured provider names only and never receives stored secrets.

### Sessions

- Create a persistent session with Pi's `SessionManager`.
- List recent sessions belonging to the selected workspace.
- Resume a session without rewriting its history.
- Use Pi JSONL as the authoritative transcript.
- Support one active run per session.
- Abort an active run.
- Dispose sessions cleanly on application shutdown.

Branching, forking, tree navigation, compaction controls, parallel sessions, and multi-agent orchestration are later milestones.

### Conversation

- Render user and assistant messages.
- Append streaming text and thinking deltas efficiently.
- Render tool start, update, completion, failure, and cancellation states.
- Display agent/runtime errors without losing the preceding transcript.
- Disable or adapt submission while the current session cannot accept a prompt.
- Support Pi steering/follow-up queueing only after the base non-streaming admission path is reliable.

Markdown uses a sanitized renderer (`react-markdown` + GFM + math + `rehype-sanitize` + KaTeX; no raw HTML, no MDX). Settled messages highlight fenced code with Shiki and auto-render fenced Mermaid diagrams (`securityLevel: "strict"`). While streaming, code and Mermaid stay plain source. Document previews and arbitrary extension renderers remain deferred.

### Built-in features

- Use Pi's standard resource loader internally with ordinary extension, skill, and prompt discovery disabled.
- Compose only extension factories/paths, skill paths, prompt paths, and later MCP adapters named in a source-controlled feature manifest.
- Pin and ship every third-party feature dependency; do not depend on an `npm:` entry in the owner's Pi settings or a project `.pi/extensions` directory.
- Surface baked feature load/compatibility failures through internal diagnostics without presenting install, enable, disable, reload, search, update, or marketplace behavior.
- Preserve repository context files such as `AGENTS.md`; workspace instructions are not installable harness features.
- Ship `@gotgenes/pi-permission-system` `24.0.0` as the first feature and adapt its normal RPC permission flow to native confirm/select/input dialogs.

Selecting a directory authorizes the harness to work in that directory. It does not activate project extensions, skills, prompts, or packages. Project feature discovery is disabled, so remembered-workspace state cannot silently expand the executable feature set.

“Ship” means the installed application contains the feature implementation and runtime dependencies at app-controlled resource paths. Development and tests may resolve the permission package from the workspace dependency graph; packaged builds use `createPackagedResourceLocator` under Electron `Resources/features` and fail closed instead of falling back to global Pi packages. Baked MCP features must likewise include or deliberately declare every server/runtime dependency rather than asking the user to run an unpinned global `npx` command.

Later skills and MCP integrations follow the same rule: they become named features in source after the owner specifies them. MCP configuration is feature-owned and fixed to the selected servers; there is no general `.mcp.json` manager or arbitrary server entry field.

### Settings and metadata

Application-owned metadata may include:

- recent workspace paths and display names;
- selected workspace/session identifiers;
- theme and UI preferences;
- sidebar or panel state;
- last selected model preference when it does not conflict with Pi session state.

Feature behavior settings are allowed only when the application defines a typed adapter and purpose-built UI for that baked feature. This is distinct from feature composition: settings cannot add/remove/enable/disable an extension, skill, prompt, or MCP server.

Application metadata must not duplicate complete transcripts, tool results, model credentials, or extension code.

Personal v1 keeps its Pi operational data under Electron `userData/pi-agent` by default. This app-owned root contains Pi-compatible provider credentials, model settings, sessions, permission configuration, and permission logs; application metadata remains beside it at `userData/app-metadata.json`. The resource loader still ignores ambient extension/skill/prompt/package composition and uses only the baked feature manifest. Tests inject isolated application-data directories and therefore remain isolated without requiring a separate agent-directory override.

`PHO_CODE_AGENT_DIR` deliberately replaces the default root for development or interoperability. Because an override may point at another Pi installation's data, Settings identifies it as shared. This override reuses operational data only; it never authorizes ambient feature discovery. Existing pre-release data is not migrated automatically. A future import/archive/delete workflow must operate through explicit application commands, preserve Pi JSONL validity, and route deletion through the operating system's recoverable Trash.

The standalone build does not require the Pi CLI to be installed. Settings offers in-app provider API-key import; `PHO_CODE_AGENT_DIR` remains an explicit development/interoperability override.

Milestone 5 is the standalone proof boundary: an unsigned local macOS artifact embeds Pi and the current feature bundle, launches outside the repository without global Pi packages, and offers a real-provider credential path that does not require Pi CLI. Signing, notarization, updates, public installer hardening, and verified Linux artifacts remain separate production/distribution work.

## Experience requirements

- The transcript and composer are the main visual hierarchy.
- Recent projects with collapsible session lists and the conversation remain reachable through a compact persistent shell; opening a conversation must not strand the user on that screen.
- The application owns the viewport. Transcript and active panels scroll internally while the composer stays anchored.
- Streaming remains responsive during long responses and frequent tool updates.
- Empty, loading, streaming, stopped, failed, and completed states are visually distinct.
- Keyboard focus returns to the composer after a completed submission when appropriate.
- Dialogs trap focus and support Escape cancellation.
- The feature host supports confirm, select, and input requests needed by the baked permission system; unsupported UI fails with a useful compatibility message rather than a stringified object.
- The UI respects light/dark mode and reduced-motion preferences.
- Tool input/output text wraps or scrolls without breaking the main layout.
- No remote webpage is rendered inside the privileged application surface.
- Protocol, milestone, embedded-Node, and SDK version strings belong in diagnostics/About rather than permanent product chrome.

Beautiful UI may provide patterns for the composer, streaming state, tool chips, approvals, and task rows. It is a source of components and interaction ideas, not the application architecture.

## Technical scope

- TypeScript throughout the product code.
- bun workspace.
- Electron main/preload/renderer process model.
- React renderer built with Vite.
- direct Pi SDK integration in the v1 runtime host.
- versioned, JSON-safe desktop command/event protocol.
- renderer sandbox enabled, context isolation enabled, Node integration disabled.
- tests for protocol, application state, runtime lifecycle, and one real Electron journey.

## Deferred production work

The following are intentionally deferred and must not inflate the first usable slice:

- running Pi or tools in containers, VMs, micro-VMs, or remote sandboxes;
- separating every session into its own operating-system process;
- auditing, signing, allowlisting, or automatically trusting packages;
- a permission policy engine for arbitrary extension code;
- public installer hardening, code signing, notarization, and automatic updates;
- crash reporting, telemetry, analytics, and support infrastructure;
- encrypted application-owned secret storage;
- enterprise policy, multi-user separation, and managed configuration;
- compatibility guarantees for arbitrary third-party extensions or terminal-only custom UIs outside the baked feature set.

The renderer boundary and runtime interfaces are v1 requirements because they are inexpensive now and prevent architectural dead ends. Actual isolation mechanisms are not.

## Success criteria

The first usable v1 satisfies the nine criteria in the root README and additionally:

- uses an exact pinned Pi SDK version;
- handles application shutdown without an active background prompt continuing unexpectedly;
- does not expose raw IPC or Node APIs to the renderer;
- persists Pi-compatible JSONL sessions that another Pi process can open when explicitly pointed at Pho Code's agent directory;
- presents baked-feature loading failures as diagnostics rather than crashing the application;
- has a documented, tested protocol version;
- has no runtime dependency on any reference submodule;
- records attribution for any copied or materially adapted reference code.

## Decisions deferred beyond v1

These do not block or reopen v1. They belong to the active [next-version roadmap](../../roadmap-vnext.md):

- exact visual identity and icon;
- richer provider login beyond the implemented API-key import;
- whether a later Linux release uses AppImage, deb, or remains development-only;
- which additional baked skills and MCP-backed features are eventually added;
- whether the mature runtime uses Electron utility processes, Pi RPC, or a Tauri sidecar.
