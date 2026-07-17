# Phase 6.1 native-foundation progress — 2026-07-17

- Result: **HISTORICAL PROGRESS SNAPSHOT — SUPERSEDED**
- Scope: Shared service construction, native entry/window scaffold, lifecycle reducer, preferences, credential interaction, lock retry, window restoration, direct-GPUI source identity, and native/command regression evidence
- Plan: [Phase 6.1](../v1/phase-6/01-native-foundation.md)
- Architecture: [Native workbench lifecycle](../../architecture/native-workbench-lifecycle.md)

This record preserves the intermediate Phase 6.1 state observed earlier on 2026-07-17. Current release status and later verification are owned by the [V1 release evidence](phase-6-release-candidate-2026-07-17.md), while unfinished original criteria are owned by [V2 Phase 6B](../v2/phase-6b-native-completion.md) under [ADR 0005](../../decisions/0005-release-v1-and-defer-phase-6b.md).

## Implemented

- `ApplicationServicesFactory` resolves one application root, acquires the process guard, constructs local session services, then activates the credential actor, DeepSeek backend, tool/approval injection, and coordinator through shared headless owners.
- Construction is staged so preference loading can occur after the guard but before writable session/credential services, and `pho session list` retains its offline behavior without Keychain access.
- The internal synchronous `pho-native` target rejects every launch argument, owns GPUI on the macOS main thread, opens the fixed four-region shell, and holds the Tokio runtime and headless services outside view state.
- A GPUI-neutral startup reducer carries generations across lock, preference, session, credential, selection, failure, and shutdown transitions; stale generations cannot rewrite shutdown state.
- `WorkbenchPreferencesV1` is a bounded one-MiB non-secret schema with value/identity/path limits, restrictive permissions, sibling-temp replacement, file and directory sync, safe defaults, and overwrite blocking that preserves corrupt, oversized, or newer-version candidates.
- The initial direct-GPUI shell provides semantic system/light/dark/high-contrast palettes, explicit window minima, file-tree-first collapse decisions, native title/traffic-light defaults, and stable accessible region labels.
- A bounded coordinator command task carries native credential intents and canonical credential events without putting the coordinator or I/O in view state. Valid candidates project `Validating` before remote validation; malformed candidates project distinctly and cannot replace a usable record.
- The native credential surface uses a bounded IME-backed masked field with no copy, cut, or paste action. Submission moves the buffer into redacted, zeroizing `SecretText`; dismissal zeroizes the field, and no secret enters preferences, projection, logs, screenshots, or accessibility values.
- Lock contention now exposes a named Retry control. Each retry advances the startup generation and reconstructs the guarded services off the render path; it never breaks or takes over the lock.
- Persisted logical window bounds are restored through pure display-aware clamping, including off-screen, oversized, negative-coordinate, multi-display, and invalid-input cases. Live bounds remain preference-only state and are saved through the existing bounded shutdown write.
- Command-Q is an explicit GPUI action and application menu item. Its shutdown observer drops coordinator/runtime work, writes `clean_shutdown = true`, then releases headless services and the process guard.

## Dependency decision

The production graph retains direct GPUI primitives at the already qualified Zed revision `7cf50a771f54427f76b4584030c7b3b66f4e39f5`. The audited `gpui-component` candidate remains outside the graph because its unqualified Zed dependency would introduce a second source identity without a maintained compatibility fork. A lockfile test asserts one `gpui`, `gpui_macos`, `gpui_macros`, and `gpui_platform` identity at the qualified revision and rejects accidental `gpui-component` admission.

## Evidence obtained

- `cargo build --bin pho-native` passed on macOS.
- The real native process opened a GPUI window from an isolated `HOME`, accepted Command-Q through macOS Accessibility automation, exited with status `0`, and durably wrote `clean_shutdown: true`.
- Accessibility automation opened the real credential dialog, typed a non-submitted marker into the secure field, observed an empty accessibility value, dismissed the dialog, and found zero copies of the marker in accessibility output, preferences, stdout, or stderr. No Keychain mutation was attempted.
- A two-process native test proved lock contention and recovery: the second process exposed Retry, the first owner exited, Retry replaced the conflict surface with the ordinary credential control, and both processes exited `0` with empty stderr.
- Focused lifecycle, preference, service-factory, layout/theme, launch-argument, and GPUI-source-family tests passed.
- The Phase 1B–5 command/runtime regression selection passed: 10 command-process, 2 instance-lock, 8 Phase 2, 14 Phase 3, 3 Phase 4, 1 Phase 5 command-process, 2 Phase 5 runtime, and 8 Phase 5 session-store tests.

The final repository-wide verification for this implementation slice was:

```text
cargo fmt -- --check
PASS

cargo check --all-targets
PASS

cargo test -- --test-threads=1
PASS — 195 non-ignored tests passed; 9 opt-in or manual tests ignored

cargo clippy --all-targets --all-features -- -D warnings
PASS

cargo tree -e features --offline
PASS

cargo tree -d --offline
PASS — duplicate versions remain visible in the upstream application graph; the
Phase 6.1 lockfile test separately proves one coherent GPUI source identity
```

One full-suite attempt timed out while waiting for the existing full-screen PTY test to enter raw mode. A later parallel run also timed out in the existing broken/non-draining-output cancellation tests. Each exact test passed immediately when isolated, the complete Phase 3 integration target passed serially, and the final current-tree suite passed with one test thread. The documentation-link test also exposed a stale `tools.md#shell` target; it was corrected to the authoritative `tools.md#noninteractive-shell` heading before the passing full run.

## Historical remaining gate work

At this snapshot, real valid/invalid/unavailable Keychain-backed credential scenarios and close-during-validation evidence remained; the live credential check deliberately performed no Keychain mutation. Pane focus actions, modal focus trapping/return, full keyboard traversal, composer IME routing, broader VoiceOver interaction, reduced motion, real off-screen restored-window launch, scale/asset/font failure behavior, and the supported-macOS scenario matrix were still required. Later work obtained live credential, app, terminal, dependency-audit, size, and shutdown evidence as recorded in the V1 release record. The remaining matrix is preserved in Phase 6B rather than treated as completed here.
