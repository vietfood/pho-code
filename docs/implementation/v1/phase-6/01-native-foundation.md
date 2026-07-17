# Phase 6.1: Native foundation

- Status: In progress; foundation and native-interaction slices recorded 2026-07-17
- Depends on: [Phase 6.0](00-design-and-research.md)
- Architecture: [Native workbench lifecycle](../../../architecture/native-workbench-lifecycle.md)
- Research: [`gpui-component` source study](../../../research/gpui-component-source-study.md)
- Next: [Phase 6.2 workbench state](02-workbench-state.md)
- Evidence: [2026-07-17 progress record](../../evidence/phase-6.1-progress-2026-07-17.md)

## Outcome

A dedicated internal macOS native executable opens one real GPUI window over a reusable application-services factory, while the existing `pho` command remains behaviorally and operationally intact. The native shell has typed startup/offline/auth/shutdown state, one coherent GPUI dependency family, qualified local theme/assets, and a recoverable bounded preference store.

## Work

1. Extract construction of the instance guard, application-support/session services, credential actor, backend/tool runtime, and coordinator into shared headless factories without moving blocking work into either adapter.
2. Add the internal `pho-native` binary target and macOS application entry. The app bundle invokes it without secret or prompt argv. Keep `pho` the supported command executable.
3. Implement the GPUI-neutral startup reducer and generations, lock-conflict surface, offline inspection states, masked `SecretText` credential intent, and coordinated shutdown.
4. Implement `WorkbenchPreferencesV1` with restrictive permissions, byte/value bounds, atomic replacement, explicit corruption/newer-version handling, and no session/terminal content.
5. Run the one-GPUI-source compatibility spike. Exercise component initialization/`Root`, native title bar, nested resizable groups, tabs, sidebar, tree rows, virtual list, multiline composer, Markdown row, and a selectable read-only code prototype. Pin every Zed-family dependency to one revision or use direct GPUI primitives if the component cannot pass.
6. Qualify system/light/dark/high-contrast colors, packaged icons/fonts, 1x/2x scale, missing-asset behavior, and fixed layout minima/collapse.
7. Add deterministic startup/preference/layout/focus/accessibility harnesses before pane functionality.

## Dependency evidence

Record the exact component/Zed revisions, Cargo sources, `cargo tree -e features`, `cargo tree -d`, license/advisory result, release binary-size delta, supported macOS build, startup-to-window time, and shutdown result. The lock must contain one coherent `gpui`, `gpui_platform`, and `gpui_macros` family. A component example's filesystem/process behavior is never accepted as application code.

## Acceptance scenarios

- clean app-support root, missing credential, and no sessions opens an offline-capable shell;
- ready, invalid, malformed, validating, unavailable, and removal-failed credential states project correctly without secret retention;
- a second `pho` or native process loses the lock safely before Keychain/writable sessions;
- corrupt/newer/oversized preferences preserve the candidate and use safe defaults;
- minimum-window collapse, restored off-screen frame, keyboard pane focus, IME-safe composer routing, VoiceOver names, and theme/scale changes behave deterministically;
- closing during startup, credential validation, and idle state stops owned work and releases the lock last;
- existing command parser/process and Phase 1B–5 suites remain green.

## Gate

Phase 6.1 passes only when the real native window constructs and shuts down on the supported macOS target, the component graph has one qualified GPUI identity, no view render path performs component I/O, preferences survive the corruption matrix, and command/native service construction demonstrably uses the same headless owners. Component incompatibility selects the documented direct-GPUI fallback; it does not justify two GPUI identities.
