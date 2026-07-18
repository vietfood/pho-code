# Native workbench lifecycle

- Status: Normative native architecture; V1 released in 0.1.0, qualification deferred to V2 Phase 6B, chat-first presentation amended for Phase 6C
- Governing decisions: [ADR 0004](../decisions/0004-native-workbench-phase-6.md) and [ADR 0006](../decisions/0006-chat-first-native-workbench.md)
- Presentation: [GPUI workbench](gpui-workbench.md)
- Shared runtime: [Native harness system](native-harness-system.md)
- Delivery: [Phase 6](../implementation/v1/phase-6/README.md)
- Presentation delivery: [Phase 6C](../implementation/v2/phase-6c-chat-first-ui-polish.md)

## Document role

This document owns the macOS workbench entry point, startup and shutdown states, non-secret preferences, window layout, focus routing, accessibility, theme/assets, and native verification boundary. It does not own canonical agent execution, credentials, sessions, workspace containment, terminal emulation, or pane content. Those contracts are linked rather than repeated.

## Native entry and process boundary

Phase 6 preserves the existing `pho` binary and command parsing unchanged. The macOS application bundle receives a dedicated internal executable target whose only public behavior is to open the native workbench. It does not accept prompt text, API keys, approvals, arbitrary provider endpoints, or hidden command-mode fallbacks through argv or environment. A future public native command requires an explicit command-surface design; Phase 6 does not disguise one as an undocumented flag.

The native target and `pho` construct the same headless actors, reducer, coordinator, backend, tool runtime, and session store through a shared application-services factory. The native executable owns GPUI application/window initialization and projects typed state; it cannot spawn `pho` or create a probe-only runtime.

V1 `0.1.0` provides the dedicated `pho-native` target, one GPUI window over the shared headless service factory, startup/lock/credential/shutdown projections, bounded preferences, workspace/session selection, chat, file/Git inspection, and the user-terminal surface. The [V1 release record](../implementation/evidence/phase-6-release-candidate-2026-07-17.md) separates exercised behavior from the broader accessibility, parity, terminal-tab, and supported-macOS scenarios deferred by [ADR 0005](../decisions/0005-release-v1-and-defer-phase-6b.md) to [V2 Phase 6B](../implementation/v2/phase-6b-native-completion.md).

## Startup state machine

The native shell projects this GPUI-neutral lifecycle:

```text
Booting
  -> LockUnavailable
  -> LoadingPreferences
  -> ScanningSessions
  -> InspectingCredentials
  -> RestoringSelection
  -> ReadyOffline | NeedsCredential | CredentialUnavailable | Ready
  -> ShuttingDown
  -> Terminated

Any non-recoverable local failure -> Failed
```

These are application states, not a sequence of blocking calls in a render method. Each asynchronous transition carries a startup generation; a late result from a superseded attempt is discarded. `ReadyOffline`, `NeedsCredential`, and `CredentialUnavailable` retain workspace, file, Git, and session inspection when their underlying local services are healthy, but sending is disabled. Network absence after a previously accepted credential is a backend/request failure or temporary credential-validation state; it does not erase local history.

Startup order is fixed:

1. Parse the native target's bounded non-secret launch context and initialize safe diagnostics.
2. Resolve the Application Support root and acquire the process-wide `InstanceGuard` before Keychain or writable session actors exist.
3. Load and validate non-secret workbench preferences with restrictive permissions.
4. Construct `SessionManager`, scan the bounded catalog, and recover or mark damaged sessions through the session contract.
5. Construct the credential store and actor, then inspect its typed state without exposing the record.
6. Restore or choose a registered workspace through the workspace-opening service; restore a compatible session only after workspace validation.
7. Construct the shared coordinator and workbench services, open the GPUI window, and bind projections.
8. Enable send only when startup, credential, workspace, and selected-session states all satisfy the existing reducer preconditions.

A lock conflict is recoverable and touches neither Keychain nor sessions. The app shows that another Pho Code process owns local state and offers only exit/retry. Phase 6 adds no IPC takeover and never breaks the lock.

## Credential interaction

The credential dialog is a native adapter over `Intent::InstallCredential { candidate: SecretText }`, `InspectCredentialStatus`, and `RemoveCredential`. The masked input's bytes exist only in the controlled secret field and the move-only `SecretText` submitted to the coordinator. They never enter workbench preferences, projection rows, clipboard history, diagnostics, accessibility values, screenshots produced by automated evidence, or ordinary application logs.

Submission clears the local field and projects the canonical `Validating` state. A failed candidate does not overwrite a previously usable record, matching the credential actor. Missing, malformed, invalid, temporarily unavailable, validating, ready, and removal-failed states have distinct actions and messages. A dialog cannot call Keychain or the validator directly, and dismissal never implies credential installation.

Offline inspection remains available when the credential is missing or remote validation is unavailable. Operations that need a credential state why they are disabled and route to the same dialog; the shell does not manufacture a temporary in-memory backend credential.

## Preference ownership and schema

Workbench preferences are a versioned, non-secret local document under `Application Support/Pho Code/preferences/workbench-v1.json`. They are not session records, do not enter model context, and cannot alter tool or backend authority. The released V1 schema contains only:

```text
WorkbenchPreferencesV1
  schema_version = 1
  clean_shutdown: bool
  theme: System | Light | Dark | HighContrast
  window_frame: optional bounded logical rectangle
  layout: WorkbenchLayoutV1
  registered_workspaces: at most 64 WorkspaceRegistrationPreference
  selected_workspace_registration_id?
  selected_session_id?
  open_session_tabs: at most 16 SessionId
  open_file_tabs: at most 32 WorkspaceRelativePath
  terminal_tab_descriptors: at most 8 TerminalRestoreDescriptor
  per_session_drafts: at most 16 bounded DraftPreference
  transcript_view_preferences: bounded collapsed/anchor values
```

The registry may store canonical absolute workspace paths because local restoration requires them, but diagnostics and ordinary UI use display names or workspace-relative paths. It stores no API key, prompt history, provider reasoning, file body, terminal input/output/scrollback, shell environment, approval, command, effect digest, or process identifier.

Writes use a sibling temporary file, file flush, atomic rename, directory flush, and user-only permissions independent of umask. The writer caps the encoded document at 1 MiB and rejects values outside schema bounds before touching the current file. An unknown newer schema or corrupt file produces safe defaults plus a visible local recovery diagnostic; the intact candidate is retained for manual recovery and is never silently overwritten during the same startup. Migration is explicit per schema version and cannot mutate session journals.

`clean_shutdown` is set false only after the shell owns the guard and is set true only after owned services and terminal children have reached the shutdown boundary. It is a diagnostic hint, not proof that a prior effect or process completed. Terminal processes are never reattached after restart.

Phase 6C introduces an explicit bounded `WorkbenchPreferencesV2` migration. V2 retains the V1 fields and adds a layout-profile revision, explicit visibility for navigation/inspection/files/terminal, last valid bounded pane fractions, and bounded transcript disclosure keys. Chat remains structural rather than optional. Focus history is process-local and is not persisted.

Migration preserves valid V1 navigation and file-tree collapse choices, starts inspection and terminal hidden when no compatible explicit state exists, clamps retained geometry to the current display/profile, and leaves sessions and terminal process state untouched. New, corrupt, or safely reset preferences use `ChatFirstV1` with only chat expanded. Migration failure retains the intact candidate, uses safe defaults for the run, and produces a local recovery diagnostic; it never silently overwrites the source candidate.

## Window and layout contract

The application opens one native macOS window with system traffic-light controls, drag behavior, and labeled pane-toggle affordances. The content is a fixed composition of nested horizontal and vertical resizable groups; the workbench does not expose arbitrary docking, detachable windows, or user-authored panel registries.

The `ChatFirstV1` default profile expands only chat and uses the dark theme. When revealed, navigation begins near 220 logical pixels, the file tree near 250, and chat/inspection use a bounded restored or roughly even split. The user terminal docks under the chat column and is revealable independently of inspection. Qualifying implementation defines constants for every preferred, minimum, and maximum fraction and tests them at the supported display sizes. Restored sizes are clamped to the current visible screen and profile revision before use.

Navigation, inspection, files, and terminal are explicitly revealable/hideable; hiding changes presentation only and cancels no service operation. When horizontal space is insufficient, the shell hides the file tree first, navigation second, and inspection third according to deterministic pressure rules while retaining labeled reveal affordances. It never permits panes to overlap, lets a fixed sidebar starve the composer/viewer, or makes any region unreachable. Below the qualified minimum window size, resize is constrained rather than producing an undefined layout. Vertical pressure preserves the composer and, when terminal is visible, a reachable terminal tab bar before optional header detail.

Pane geometry, collapse state, selected presentation tabs, local drafts, and transcript expansion state are preferences. Canonical selection, active turn, approval, tool, session, file, Git, and process truth remain application state.

## Focus, keyboard, and accessibility

The stable traversal order is navigation, chat tabs/header/transcript/composer, viewer tabs/content, terminal tabs/content, then file tree. Tab bars and tree rows use roving focus so thousands of rows do not become independent tab stops. Modal approvals and credential dialogs trap focus only while open and return it to the invoking control on dismissal.

Phase 6 reserves these application bindings after conflict and IME qualification:

| Binding | Action |
| --- | --- |
| `Command-1` through `Command-4` | Reveal if needed and focus navigation, chat, inspection, or file tree |
| `Control-backtick` | Toggle terminal visibility under chat (lazy first create) |
| `Command-Shift-[` / `Command-Shift-]` | Previous/next tab in the focused tab strip |
| `Command-W` | Close the focused presentation tab; never delete a session or file |
| `Command-Shift-W` | Request window shutdown |
| `Enter` | Send from the composer when composition is inactive and send is enabled |
| `Shift-Enter` | Insert a composer newline |
| `Escape` | Close a transient surface, or request explicit turn cancellation only when the cancel control owns focus |

`Control-backtick` is a presentation toggle, not a terminal process command. Hiding terminal restores the most recent valid non-terminal focus target; revealing an existing terminal focuses it without restart; first reveal requests lazy creation only after valid dimensions exist. Repeated toggles while opening cannot create duplicate terminals.

The terminal receives ordinary key input only while its content owns focus; application shortcuts are intercepted before PTY encoding and visibly documented. No global approval shortcut is introduced. Approval requires focus on the live decision control and dispatches its complete typed identity.

Every icon-only control has a stable accessible name and tooltip. Workspace rows announce display name, selection, availability, branch, and change counts independently of color. Transcript rows announce semantic activity rather than only the playful verb. Tree rows expose level, expanded/collapsed state, loading/error/truncated state, and item kind. Terminal tabs announce running/exited state. Focus rings, selected rows, insertions/deletions, warnings, and errors remain distinguishable in monochrome and high contrast.

Streaming, session restoration, Git refresh, tree loading, and terminal output never steal focus. Reduced-motion mode replaces animated activity with a static semantic label. VoiceOver, full keyboard access, IME composition, Unicode grapheme movement, 1x/2x scale, and light/dark/high-contrast themes are release scenarios rather than visual polish follow-ups.

## Theme, fonts, and assets

The component/theme registry initializes exactly once before selected `gpui-component` controls render. All icons, fonts, and math assets are reviewed and packaged locally; no render or theme path downloads assets. The workbench registers packaged JetBrains Mono faces at native startup and applies that family to the whole native shell (chrome, chat, sidebars, viewer, and terminal), with system monospace fallback if registration fails. Syntax highlighting uses a Pho-owned tree-sitter path for a curated language set (Rust, JavaScript/TypeScript/TSX, JSON, Python, Bash, TOML, YAML) and a lexical fallback elsewhere. The dependency spike must establish one GPUI source family and record licenses for every packaged asset.

System, light, dark, and high-contrast profiles provide semantic colors for window, primary, raised, hover, selected, separator, text, muted text, focus, insertion, deletion, success, warning, error, link, code, and terminal ANSI mapping. Ordinary assistant text uses the primary surface; raised surfaces are reserved for user prompts, grouped tool activity, approvals/errors, and selected controls. One-pixel low-contrast separators replace repeated equal-weight pane/card outlines without weakening focus or status visibility. Syntax and Git colors cannot be the sole carrier of meaning. Missing optional fonts fall back to packaged/system-qualified fonts without invisible glyphs; a missing required math font triggers source fallback.

## Shutdown contract

Window close is a coordinated application shutdown, not immediate GPUI exit. The shell first enters `ShuttingDown`, rejects new sends, workspace/session switches, PTY starts, and credential mutations, then:

1. closes transient dialogs and invalidates live approval presentation;
2. requests cancellation of an active agent turn and waits for authoritative terminal/interrupted recording within the configured shutdown deadline;
3. cancels render, tree, Git, file, preference, and watcher generations;
4. asks the user-terminal service to close tabs and supervise each process group through its terminal contract;
5. flushes session terminal/recovery records and the last valid bounded preferences document;
6. stops owned actors and the Tokio runtime, releases window resources, drops the instance guard last, and asks GPUI to quit.

An active agent turn or live terminal child produces a confirmation that names the consequences without exposing content. Refusing leaves the app running. Confirming requests cancellation/termination but never labels either complete before the owning service reports it. If the deadline expires, durable agent state and safe terminal diagnostics record uncertainty where their contracts permit; the guard is not released while writable actors still run.

A crash can bypass this sequence. On next startup, sessions reconstruct interrupted or uncertain agent state from durable records, while terminal tabs show that prior processes were not reattached. `clean_shutdown = false` cannot be used to replay a command or assume that an orphaned process is dead.

## Verification

Pure tests cover startup transitions, generation rejection, send gating, preference bounds/migration/corruption, layout clamping/collapse, focus routing, shortcuts, and accessibility labels. Local component tests use fake credentials, temporary app-support roots, deterministic session catalogs, scripted backend events, and deterministic child processes; no screenshot is accepted as lifecycle evidence.

The native harness proves real window construction, traffic lights, first focus, resize minima, theme/scale changes, IME behavior, keyboard-only traversal, VoiceOver labels, lock contention, missing/invalid/unavailable credentials, offline inspection, clean and interrupted shutdown, and command/native canonical parity. Instrumentation asserts that GPUI render methods initiate no Keychain, network, journal, filesystem, Git, or process operation.

Clean-machine evidence uses an isolated HOME/Application Support root and records startup-to-window, restored-window, and shutdown timings; dependency sources/features/licenses/advisories; release-size delta; supported macOS version/architecture; and failures as failures. Signing, notarization, updates, and public distribution remain outside Phase 6.
