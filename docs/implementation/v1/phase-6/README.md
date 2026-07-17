# Phase 6: Native GPUI workbench

- Status: **V1 RELEASE — 0.1.0, 2026-07-17**
- Depends on: [Phase 5](../phase-5-sessions.md)
- Governing decisions: [ADR 0004](../../../decisions/0004-native-workbench-phase-6.md) and [ADR 0005](../../../decisions/0005-release-v1-and-defer-phase-6b.md)
- Normative architecture: [GPUI workbench](../../../architecture/gpui-workbench.md)
- Produces: Usable native macOS personal coding workbench over the proven Pho Code runtime
- Future: [V2 roadmap](../../v2/README.md)

## Document role

This directory owns Phase 6 delivery order, work packages, executable checks, native scenarios, evidence, and the release gate. It does not redefine the workbench, backend, tool, session, or PTY contracts. Those behaviors belong to architecture and are linked from each work package.

The former single-file plan remains as a [compatibility pointer](../phase-6-gpui.md).

## Outcome

The verified `pho` command harness gains a native four-pane GPUI workbench with registered-workspace/session navigation, a rich execution trace and composer, a read-only file/diff viewer, a separately supervised user PTY, and a file tree. The application keeps one DeepSeek backend and one active root agent turn. GPUI remains an adapter over typed operations and canonical state rather than a second harness.

## Design and research gate

Implementation does not begin until all of the following are reviewed:

- [ADR 0004](../../../decisions/0004-native-workbench-phase-6.md) records the expanded product boundary.
- [GPUI workbench architecture](../../../architecture/gpui-workbench.md) establishes the whole-system context and develops the chat transcript/rendering path to representative depth.
- The [`gpui-component` study](../../../research/gpui-component-source-study.md) identifies reusable components, one-GPUI-source integration, feature/license impact, and upstream example boundaries.
- The [Markdown/LaTeX study](../../../research/markdown-latex-rendering.md) selects an offline bounded rendering boundary, source fallback, and a qualification candidate.
- [Native workbench lifecycle](../../../architecture/native-workbench-lifecycle.md), [workspace inspection](../../../architecture/workbench-workspaces.md), and [user terminal](../../../architecture/user-terminal.md) expand the remaining contracts to the approved representative depth.
- The [PTY/emulator study](../../../research/terminal-pty-source-study.md) defines the terminal dependency spike and rejects the audited GPL Zed wrapper.

## Work-package order

| Stream | Plan | Outcome | State |
| --- | --- | --- | --- |
| 6.0 Decision and research | [Design and research](00-design-and-research.md) | Accepted boundary and complete architecture/research set | **PASS — 2026-07-17** |
| 6.1 Native foundation | [Native foundation](01-native-foundation.md) | Real GPUI entry, one component graph, startup/preferences/theme/assets | V1 slice complete |
| 6.2 Workbench state | [Workbench state](02-workbench-state.md) | Registry, catalog/tabs, atomic selection, layout/focus | V1 slice complete |
| 6.3 Chat and approvals | [Chat and approvals](03-chat-and-approvals.md) | Virtual trace, Markdown/math, composer, activity, exact approvals | V1 core complete; interaction matrix moved to Phase 6B |
| 6.4 Workspace inspection | [Workspace inspection](04-workspace-inspection.md) | Safe tree, read-only viewer/diff, one Git projection | Implemented and native-qualified |
| 6.5 User terminal | [User terminal](05-user-terminal.md) | Qualified PTY/emulator, bounded actor, process cleanup | V1 actor/surface complete; multi-tab UI matrix moved to Phase 6B |
| 6.6 Integration and release | [Integration and release](06-integration-and-release.md) | Personal release evidence and deferred qualification boundary | **V1 RELEASE — 0.1.0** ([evidence](../../evidence/phase-6-release-candidate-2026-07-17.md)); remainder moved to [V2 Phase 6B](../../v2/phase-6b-native-completion.md) |

Packages execute in order for integration clarity. Read-only spike preparation may overlap, but no production dependency or later package can bypass an unmet predecessor gate. Architecture owns behavior; each package records only implementation work and evidence.

## Phase invariants

- One concrete DeepSeek backend and one active agent turn remain global V1 limits.
- Open chat tabs do not imply concurrent streams, approvals, or tools.
- Views never own filesystem, Git, PTY, Keychain, network, journal, tool, or coordinator work.
- The text viewer is read-only; agent mutation continues through the existing tool contracts.
- The user PTY is separate from the model-facing noninteractive shell tool and is not a model authority channel.
- Completed assistant phases, tool results, approval identities, usage, and terminal turn states remain canonical over visual deltas.
- Untrusted Markdown/math cannot load remote content, execute active content, or hide source on failure.
- Every queue, file/diff result, terminal stream, rendered document, cache, tab count, and retained projection is bounded before implementation passes its gate.

## Verification levels

Phase 6 adds three layers to the existing repository checks:

1. Pure projection tests feed canonical event fixtures into GPUI-neutral workbench reducers and compare semantic rows, activity, focus targets, and decisions.
2. Component/native harness tests exercise window construction, layout constraints, input routing, virtualization, and actor cancellation with scripted services.
3. L4 macOS scenarios exercise the real application, Keychain boundary, workspaces, terminal child processes, crash/restart, approvals, theme contrast, keyboard navigation, and the same supervised coding task already proven through `pho`.

No native behavior is considered verified merely because a component story renders or a headless fixture passes.

## V1 release gate

[ADR 0005](../../../decisions/0005-release-v1-and-defer-phase-6b.md) revises the V1 acceptance boundary. V1 passes when the packaged local app demonstrates secure credential custody, live chat and durable reconstruction, bounded read-only workspace/Git inspection, a separately supervised terminal, coordinated shutdown, shared command/native runtime ownership, current documentation, and dated evidence that names every unavailable check.

That revised gate passed on 2026-07-17 with [V1 release evidence](../../evidence/phase-6-release-candidate-2026-07-17.md). The app is an unsigned local Apple Silicon release; no public distribution or broader compatibility claim is made.

## Deferred original Phase 6 gate

The following original criteria are preserved as [V2 Phase 6B](../../v2/phase-6b-native-completion.md) acceptance work rather than discarded:

Phase 6B passes only when:

1. All earlier gates remain green and the dependency graph contains one qualified GPUI source identity.
2. Every selected component, math-rendering, PTY, and terminal-emulator dependency has a recorded feature, license, advisory, packaging, and supported-macOS result.
3. Command and GPUI decisions produce equivalent canonical session records, approval/effect identities, usage, terminal turn states, and reconstruction for the parity matrix.
4. Workspace switches cannot retarget active work; stale file/Git/tree generations cannot enter the selected workspace; PTY state cannot grant agent approval.
5. Restart reconstructs the canonical execution trace and presents interrupted/uncertain state without replaying work.
6. The native scenario matrix and visual/keyboard/accessibility review pass on the supported macOS version and architecture.
7. A clean account and clean workspace can complete the same supervised real coding task through both `pho` and the workbench without divergent runtime semantics.
8. The root `README.md` documents build/run, storage, data transfer, cost, terminal and shell safety limits, recovery, and compatibility dates.

Signing, notarization, automatic updates, public distribution support, writable editing, multiple real backends, concurrent agent turns, subagents, compaction, and non-macOS platforms remain outside this gate.
