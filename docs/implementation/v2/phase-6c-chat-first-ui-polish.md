# Phase 6C: Chat-first native workbench polish

- Status: Ready for implementation; completion requires Phase 6B qualification of the integrated surface
- Depends on: [V1 release evidence](../evidence/phase-6-release-candidate-2026-07-17.md)
- Qualification dependency: [Phase 6B native qualification](phase-6b-native-completion.md) runs after package 6C.6 and before Phase 6C closes
- Governing decision: [ADR 0006](../../decisions/0006-chat-first-native-workbench.md)
- Normative architecture: [GPUI workbench](../../architecture/gpui-workbench.md), [native lifecycle](../../architecture/native-workbench-lifecycle.md), and [user terminal](../../architecture/user-terminal.md)
- Reference workflow: [Chat-first workbench image](../../assets/ui/chat-first-workbench-workflow.jpg)
- Produces: A progressively disclosed, chat-first native GPUI workbench without changing Pho Code runtime authority

## Document role

This file is the execution handoff for implementation agents. It owns work-package order, source ownership suggestions, migration tasks, acceptance scenarios, and verification. It does not redefine canonical assistant phases, tool approval/effects, sessions, workspace containment, PTY process behavior, or preference durability. Those contracts remain in architecture.

An implementation agent must read this file and every document listed under **Required reading** before editing. If source behavior conflicts with architecture, stop and repair the owning document or decision rather than coding around the mismatch.

## Required reading

1. [Documentation index](../../README.md), especially authority and evidence vocabulary.
2. [ADR 0006](../../decisions/0006-chat-first-native-workbench.md).
3. [ADR 0004](../../decisions/0004-native-workbench-phase-6.md) and [ADR 0005](../../decisions/0005-release-v1-and-defer-phase-6b.md) for retained scope and ordering.
4. [GPUI workbench](../../architecture/gpui-workbench.md), especially shell composition and transcript projection.
5. [Native lifecycle](../../architecture/native-workbench-lifecycle.md), especially preferences, layout, focus, accessibility, and theme.
6. [User terminal](../../architecture/user-terminal.md), especially presentation, process ownership, and shutdown.
7. [`gpui-component` source study](../../research/gpui-component-source-study.md).
8. [Phase 6B](phase-6b-native-completion.md), whose full matrix must run against the integrated Phase 6C surface before completion.
9. `Cargo.toml`, `src/ui/startup.rs`, `src/ui/workbench_theme.rs`, `src/app/workbench_preferences.rs`, `src/native.rs`, and the relevant runtime/event/session types.

## Outcome

Opening a new or safely reset workbench shows one selected chat with a calm primary surface. The user can reveal navigation, inspection, files, and terminal through accessible controls and shortcuts. Tool activity reads as one coherent lifecycle rather than raw protocol output. Successful low-risk inspection activity stays compact; anything requiring a decision or explaining an effect, failure, truncation, interruption, or uncertainty is prominent.

`Control-backtick` reveals and lazily starts the terminal on first use, toggles visibility thereafter, and restores focus without conflating pane visibility with PTY termination. Explicitly revealed pane state and bounded geometry persist through the new preference profile.

The command adapter, backend, reducer, coordinator, tool runtime, sessions, workspace services, Git/file services, terminal actor, credentials, and safety policies retain their existing authority.

## Current baseline

The implementation must begin with a fresh source audit. At the time this plan was accepted, the relevant baseline was:

- `src/ui/startup.rs` combined workbench projection and most rendering in one large view, used a fixed four-region row, auto-collapsed side panes only at width thresholds, retained a fixed terminal area, and rendered raw tool results as separate transcript cards.
- `src/native.rs` bound `Control-backtick` to terminal focus rather than visibility.
- `src/app/workbench_preferences.rs` already contained layout fractions and navigation/file collapse values, but the view did not consume a complete interactive pane state.
- `src/ui/workbench_theme.rs` provided semantic colors, while the startup view used high-contrast borders and repeated outlined containers that created a strong grid.
- the canonical architecture already required assistant-phase grouping, paired calls/results, collapsed reasoning, stable row identities, virtualization, and scroll anchoring.

These observations are verified only for the reviewed revision. Agents must not assume file locations or incomplete behavior remain unchanged after concurrent work.

## Invariants and non-goals

### Invariants

- Completed canonical assistant phases and tool results remain authoritative over deltas or trace strings.
- A call, approval, result, artifact, and effect retain their distinct typed identities even when presented in one lifecycle row.
- No approval or uncertain effect is hidden behind a default-collapsed success treatment.
- Views dispatch typed intents; they do not perform backend, Keychain, filesystem, Git, journal, render-service, or process work.
- Pane visibility and disclosure are presentation state. They never enter provider context or canonical session records.
- Hidden terminal entries remain owned by the terminal actor and follow its existing bounds and shutdown contract.
- One DeepSeek backend, one selected workspace/session, one root agent turn, and sequential tools remain unchanged.
- Every retained queue, row, expansion preference, pane geometry, terminal snapshot, and rendered asset remains bounded.

### Non-goals

- TypeScript/Electron migration or a webview shell.
- A writable editor, LSP, completion, formatting, or unsaved buffers.
- Arbitrary docking, detachable windows, user-created panels, or a plugin API.
- Compaction, subagents, a second backend, concurrent agent turns, or provider-branded process adapters.
- Changes to agent shell approval, user-terminal authority, credential custody, or session format.
- Multi-terminal parity work already owned by Phase 6B.
- Signing, notarization, automatic updates, public distribution, or non-macOS portability.

## Target state model

Names below communicate responsibilities; agents may adjust spelling to existing conventions while retaining the boundaries.

```text
WorkbenchPresentation
  layout_profile: ChatFirstV1
  panes: PanePresentation
  transcript: TranscriptPresentation
  focus: FocusPresentation

PanePresentation
  navigation: Hidden | Visible { fraction }
  inspection: Hidden | Visible { fraction }
  files: Hidden | Visible { fraction }
  terminal: Hidden | Visible { fraction }

TranscriptPresentation
  expanded_reasoning: bounded set of canonical row identities
  expanded_tools: bounded set of canonical tool lifecycle identities
  anchor_by_session: bounded map of session identity to scroll anchor

FocusPresentation
  current_target
  last_valid_non_terminal_target
```

Chat is always visible and is not represented by an optional visibility flag. Fractions are valid only for visible resizable groups and are clamped before rendering or persistence. Focus history is process-local and need not survive restart.

The transcript projection uses one lifecycle row:

```text
ToolLifecycleProjection
  row_id
  assistant_phase_id
  tool_call_id
  approval_id?
  result_item_id?
  tool_kind
  state
  summary
  structured_preview
  effect_preview?
  output_preview?
  truncation?
  artifact_refs[]
  disclosure
```

Valid lifecycle states cover at least validated, awaiting approval, denied, queued, running, succeeded, failed, timed out, cancelled, interrupted, stale, and uncertain. The projection derives these states from canonical records/events; the view cannot manufacture them from display strings.

## Disclosure matrix

| Content/state | Default presentation | Required visible information |
| --- | --- | --- |
| Successful search/list | Collapsed lifecycle row | Tool kind, bounded query/scope summary, match/count summary, completion |
| Successful bounded read | Collapsed lifecycle row | Workspace-relative target, bounded range/size summary, completion, truncation/artifact indicator |
| Running read/search/list | Compact expanded status | Semantic running state and safe target summary |
| Patch awaiting approval | Expanded | Complete decision identity binding, canonical diff/effect preview, truncation and stale state |
| Patch completed | Expanded unless explicitly collapsed locally | Per-file outcome, effect/result state, truncation and artifacts |
| Shell awaiting approval | Expanded | Exact command/effect preview, contained working directory, timeout, unrestricted-account warning |
| Shell completed | Expanded unless explicitly collapsed locally | Exit state, duration, bounded output preview, truncation and artifacts |
| Denied/failed/timed out/cancelled/interrupted/stale/uncertain | Expanded | Terminal state, safe recovery context, omitted/truncated indicators |
| Provider-returned reasoning | Collapsed | Origin label, presence/size-independent summary, explicit reveal control |
| Usage/cost | Compact turn metadata | Owning turn, qualified profile/date context, unavailable state when unknown |

Raw JSON, provider DTO dumps, and unstructured debug traces are not primary transcript rows. Safe bounded raw/source detail may be reachable through an explicit detail affordance only when the owning contract permits it.

## Interaction transitions

### Pane reveal

```text
Hidden pane
  -> RevealPane(pane_id)
  -> validate current layout generation and available bounds
  -> Visible(clamped_restored_or_default_fraction)
  -> focus only when the invoking action promises focus
```

Revealing one pane does not silently hide another unless the current window cannot satisfy documented minima. In that case the reducer applies the deterministic pressure order from native lifecycle architecture and announces the resulting state accessibly.

### Pane hide

```text
Visible pane
  -> HidePane(pane_id)
  -> move focus to a valid visible target when needed
  -> retain bounded last valid fraction
  -> persist presentation preference
```

Hiding inspection or files cancels no service operation and changes no selected canonical context. Hiding terminal sends no terminal-actor command.

### Terminal toggle

```text
Hidden + no entry
  -> reveal with valid dimensions
  -> CreateTerminal
  -> Opening
  -> Ready and focused | Failed and visibly recoverable

Hidden + existing entry
  -> reveal selected entry
  -> focus without restart

Visible
  -> hide
  -> restore last valid non-terminal focus
```

Repeated shortcuts during `Opening` are idempotent presentation toggles. They must not create duplicate terminals. A stale create/focus response cannot target a newer workspace or terminal generation.

### Tool lifecycle

```text
Validated call
  -> optional live approval
  -> queued/running
  -> authoritative result or terminal failure state
```

Every transition retains the canonical identities needed for pairing and decision dispatch. Completion replaces provisional display data; it does not append a second unrelated raw-result card.

## Work packages

Packages execute in order. Read-only discovery and fixture preparation may overlap, but production writes must have non-overlapping ownership and the integration owner must review every diff.

### 6C.0 Baseline and fixtures

**Objective:** Freeze the post-6B behavior and create canonical fixtures before changing presentation.

**Work:**

1. Confirm the V1 release evidence exists, record every still-open Phase 6B gap, and treat those gaps as requirements for the integrated qualification rather than an implementation blocker.
2. Record the current GPUI/Zed dependency identities and whether direct GPUI or a qualified component path owns resizable groups and virtual rows.
3. Map canonical runtime/session events to current transcript output, including streaming reasoning/text, completed assistant phase, each tool kind, approval, denial, result, artifact, cancellation, interruption, and uncertainty.
4. Add or consolidate GPUI-neutral fixtures that reconstruct the same session from live events and journal records.
5. Capture sanitized before-state native images for visual comparison; screenshots are supplementary, not behavioral evidence.

**Gate:** The fixtures expose current duplicate/raw tool behavior and prove canonical identity inputs without changing production presentation.

### 6C.1 Typed transcript projection

**Objective:** Make canonical assistant phases and tool lifecycle groups the only source of completed transcript truth.

**Suggested ownership:** New or existing projection modules under `src/app/**` or a GPUI-neutral `src/ui/**` module; projection tests. Avoid editing visual theme or pane layout in this package.

**Work:**

1. Introduce stable row identities derived from existing `SessionId`, `TurnId`, `ItemId`, assistant phase identity, `ToolCallId`, and `ApprovalId`.
2. Project one `ToolLifecycleProjection` per canonical call, joining approval/result state without merging identities.
3. Keep streaming text/reasoning explicitly provisional and generation-bound.
4. Replace provisional children with the completed assistant phase atomically.
5. Bound retained rows, detail payloads, artifact references, expansion keys, and coalescing.
6. Produce safe structured summaries per tool kind. Do not parse diagnostic strings to recover domain truth.
7. Cover duplicate, reordered, stale-generation, restart, malformed optional input, and saturation cases without panic.

**Gate:** Identical canonical fixtures produce semantically identical live and reconstructed projections; no completed raw tool-result bubble remains.

### 6C.2 Transcript presentation and disclosure

**Objective:** Render the projection with progressive disclosure and accessible semantics.

**Suggested ownership:** Transcript row components, virtualization/scroll code, disclosure preference adapters, and focused component tests. Keep `src/ui/startup.rs` integration changes narrow and coordinated.

**Work:**

1. Render ordinary assistant text directly on the primary surface and user messages on a restrained raised surface.
2. Implement grouped lifecycle headers, semantic icons/badges, structured summaries, detail sections, and explicit expand/collapse controls.
3. Apply the disclosure matrix exactly. Approval and unsafe/error states cannot inherit a collapsed-success style.
4. Label provider-returned reasoning and collapse it by default without producing content summaries that could misrepresent it.
5. Preserve virtualization, stable measurements, user scroll-away, new-activity affordance, source copy, and renderer fallback.
6. Provide stable accessible names, expanded/collapsed states, semantic lifecycle announcements, and keyboard activation.
7. Ensure focus and scroll do not jump when provisional rows become canonical or details expand.

**Gate:** Component/native fixtures prove disclosure, identity, focus, scroll, source preservation, and screen-reader semantics for every matrix row.

### 6C.3 Chat-first pane state and preference migration

**Objective:** Replace incidental width-driven visibility with explicit presentation state and a versioned `ChatFirstV1` profile.

**Suggested ownership:** `src/app/workbench_preferences.rs`, a GPUI-neutral pane/layout reducer, migration tests, and preference documentation. Do not share write ownership with terminal or theme packages.

**Work:**

1. Add a bounded preference schema revision rather than silently changing `WorkbenchPreferencesV1`.
2. Persist layout profile revision, explicit navigation/inspection/files/terminal visibility, and last valid bounded fractions.
3. Migrate V1 navigation/file choices when valid, default inspection and terminal hidden, clamp geometry, retain the intact old candidate on failure, and never touch journals.
4. Add typed reveal/hide/toggle intents and deterministic width-pressure behavior.
5. Make chat structural and always reachable.
6. Bind toolbar/menu controls and `Command-1` through `Command-4` reveal/focus behavior.
7. Preserve selected workspace/session and open tabs independently from pane visibility.

**Gate:** Pure reducer and preference tests cover new, migrated, corrupt, oversized, unknown-newer, off-screen, minimum-size, rapid-toggle, and stale-generation cases.

### 6C.4 Terminal visibility and lazy first creation

**Objective:** Make `Control-backtick` a true visibility toggle without weakening terminal ownership.

**Suggested ownership:** Terminal presentation reducer/adapter, `src/native.rs` shortcut binding, the smallest required `src/ui/startup.rs` integration seam, and terminal UI tests. Do not modify PTY/process cleanup semantics except to fix a separately proven defect.

**Work:**

1. Split `ToggleTerminalSurface` from `FocusTerminal`, `CreateTerminal`, `CloseTerminal`, `RestartTerminal`, and `SendInterrupt`.
2. Record and restore a valid non-terminal focus target.
3. Lazily request the first terminal only after reveal yields valid dimensions.
4. Make repeated toggle/create actions idempotent across opening and workspace generations.
5. Keep opening/running/exited/error terminals alive while hidden.
6. Keep failure visible with retry/close controls and safe diagnostics.
7. Prove hiding sends no PTY input, signal, close, or lifecycle success event.

**Gate:** Pure and native tests cover first reveal, opening toggle races, hide/reveal of running and exited entries, creation failure, workspace switch, resize while hidden, focus restoration, and application shutdown.

### 6C.5 Semantic visual system

**Objective:** Apply the accepted quiet visual hierarchy through semantic tokens and reusable components.

**Suggested ownership:** `src/ui/workbench_theme.rs`, shared visual primitives, asset mapping, and theme/component tests. Avoid changing projection or preference semantics.

**Work:**

1. Expand semantic roles for window, primary, raised, hover, selected, separator, focus, muted text, code, success, warning, error, insertion, deletion, and terminal ANSI mapping.
2. Implement dark values from ADR 0006 and derive/qualify system, light, and high-contrast variants independently.
3. Replace repeated heavy borders/cards with semantic separators and purpose-specific raised surfaces.
4. Centralize spacing, radii, control heights, typography roles, and icon sizes; remove view-local magic values only when the new token owns them.
5. Use local reviewed assets only and retain fallback behavior.
6. Ensure status is never conveyed by color alone and meet the qualified contrast/focus requirements.

**Gate:** Theme/component tests and native review pass for system/light/dark/high contrast, monochrome, reduced motion, 1x/2x scale, missing assets, and visible keyboard focus.

### 6C.6 Resizing, accessibility, and integration

**Objective:** Integrate the packages into one bounded shell without turning `StartupView` into a new state authority.

**Suggested ownership:** One integration agent owns `src/ui/startup.rs` and reconciles all package seams after their tests pass.

**Work:**

1. Render the shell from typed projections and pane presentation state.
2. Use direct GPUI resizable groups unless the post-6B dependency evidence qualifies one matching `gpui-component` source identity.
3. Enforce pane minima, deterministic pressure collapse, restored fractions, and reachable reveal controls.
4. Preserve stable traversal, roving focus, IME behavior, VoiceOver names/states, scroll anchors, and no focus theft.
5. Remove obsolete raw trace/tool rendering only after the new canonical projection passes reconstruction fixtures.
6. Keep safe diagnostics available without exposing prompts, reasoning, file bodies, command output, credentials, headers, or personal absolute paths.

**Gate:** The integrated native harness passes the behavioral and accessibility scenarios below without source-of-truth duplication.

### 6C.7 Phase 6B qualification and evidence

**Objective:** Prove the redesigned shell rather than declaring it complete from screenshots.

**Work:**

1. Run the repository command sequence from `AGENTS.md`.
2. Run focused projection, preference migration, terminal toggle, theme, and native harness suites first.
3. Execute the complete Phase 6B work and command/native parity corpus against the integrated Phase 6C projection and shell; evidence from the replaced pre-6C presentation cannot be carried forward without rerun.
4. Run the manual Phase 6B and Phase 6C native matrices on the supported macOS host.
5. Record a dated evidence file with exact commands, revisions, host/display/theme/accessibility scope, sanitized observations, failures, and unavailable checks.
6. Update architecture only for behavior actually discovered; do not weaken gates to match implementation.

**Gate:** Every automated requirement passes and required L4 scenarios have dated evidence. A missing native/accessibility check remains a verification gap.

## Source coordination

Concurrent agents share one worktree. Use non-overlapping ownership:

| Area | Primary ownership |
| --- | --- |
| Canonical transcript projection and fixtures | Projection agent |
| Transcript components/disclosure | Transcript UI agent |
| Preference schema and pane reducer | Layout-state agent |
| Terminal visibility adapter and shortcuts | Terminal UI agent |
| Theme tokens and shared primitives | Visual-system agent |
| `src/ui/startup.rs`, documentation reconciliation, final checks | Integration owner |

The integration owner must inspect all diffs, resolve semantic conflicts, and run the combined suite. Workers preserve unrelated user changes, never rewrite another package to make their task easier, and report exact checks rather than claiming implied success.

## Automated verification

Run the narrowest relevant checks during each package, then the full repository sequence:

```sh
cargo fmt -- --check
cargo check
cargo build
cargo test
cargo clippy --all-targets --all-features -- -D warnings
```

Add focused tests for:

- canonical live/reconstructed transcript parity;
- call/approval/result identity and ordering;
- provisional-to-completed replacement;
- every disclosure-matrix state;
- stale and duplicate events;
- row bounds, virtualization, measurement invalidation, and scroll anchoring;
- preference V1-to-V2 migration, corruption, newer schema, atomic write, and bounds;
- pane reveal/hide/focus under minimum and restored geometry;
- terminal lazy creation, idempotence, hide without process action, and focus restoration;
- light/dark/system/high-contrast semantic roles;
- redaction of safe diagnostics.

Dependency fetch failure, missing native environment, unavailable VoiceOver automation, or unsupported host is a recorded gap, not a pass.

## Native acceptance matrix

At L4 on the supported macOS host, verify at least:

1. Clean preferences open one selected chat with navigation, inspection, files, and terminal hidden but discoverable.
2. Migrated preferences retain valid navigation/file choices and do not modify sessions.
3. Every pane is reachable by mouse, keyboard, and VoiceOver; hiding a focused pane moves focus predictably.
4. Minimum and large windows never overlap panes or make composer/reveal controls unreachable.
5. A streamed assistant turn containing reasoning and multiple read/search calls settles into stable grouped rows without duplicate raw results.
6. Patch and shell approvals remain expanded, exact, keyboard reachable, and stale-safe.
7. Failure, truncation, timeout, cancellation, interruption, and uncertainty remain visible.
8. Scrolling away during streaming preserves the viewport and exposes new activity without focus theft.
9. First `Control-backtick` reveal creates one terminal; repeated presses during opening create no duplicate.
10. Hiding a running terminal leaves its child active; revealing restores the same terminal snapshot and generation.
11. Explicit close and app shutdown retain the existing process cleanup/uncertainty guarantees.
12. Theme, scale, reduced motion, monochrome/high contrast, IME, full keyboard access, and VoiceOver scenarios pass.
13. The equivalent command-mode fixture and native session reconstruct the same canonical outcome.

## Failure and rollback

Each package must remain independently reversible at the presentation boundary:

- If grouped projection fails parity, retain the prior renderer and do not ship visual hiding rules.
- If preference migration fails, preserve the original file, use safe chat-first defaults for that run, and show a local recovery diagnostic.
- If terminal lazy creation fails, leave the pane visible in `Failed` with retry; never fall back to eager startup.
- If a theme profile fails contrast/accessibility, retain the qualified existing profile for that mode.
- If a selected component introduces a second GPUI identity or fails licensing/feature review, use direct GPUI primitives.

Rollback cannot delete or rewrite canonical sessions, approvals, artifacts, terminal records, or user workspace content.

## Completion gate

Phase 6C passes only when:

1. Phase 6B has a dated `PASS` produced against the integrated Phase 6C surface.
2. The chat-first profile, pane migration, grouped transcript, terminal toggle, and semantic visual system obey the amended architecture.
3. Command/native canonical parity remains green.
4. Tool/approval/effect auditability is not reduced.
5. Hidden terminals retain correct actor/process ownership and shutdown evidence.
6. Full automated checks pass.
7. The complete required native/accessibility matrix has dated evidence.
8. Documentation indexes and user-facing shortcut/safety material match shipped behavior.

Screenshots may demonstrate appearance but cannot satisfy any state, safety, process, accessibility, or parity gate.
