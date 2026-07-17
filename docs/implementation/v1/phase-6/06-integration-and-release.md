# Phase 6.6: Integration and personal release

- Status: V1 release complete under ADR 0005; original qualification matrix deferred to V2 Phase 6B
- Depends on: [Phase 6.1–6.5](README.md#work-package-order)
- Architecture: [GPUI workbench](../../../architecture/gpui-workbench.md), [native lifecycle](../../../architecture/native-workbench-lifecycle.md), [workspace inspection](../../../architecture/workbench-workspaces.md), and [user terminal](../../../architecture/user-terminal.md)

## Outcome

V1 `0.1.0` was released on 2026-07-17 under the revised boundary in [ADR 0005](../../../decisions/0005-release-v1-and-defer-phase-6b.md), with [dated release evidence](../../evidence/phase-6-release-candidate-2026-07-17.md). The remaining work and native scenario matrix below are preserved in [V2 Phase 6B](../../v2/phase-6b-native-completion.md); this file remains the historical V1 plan.

The original target was one locally distributable macOS personal workbench completing the same supervised DeepSeek coding task as `pho`, preserving canonical session/tool/approval truth, surviving reconstruction safely, and meeting the native layout, accessibility, dependency, privacy, and child-process gates. V1 delivered the bounded personal workflow recorded in its evidence; the uncompleted parts of this target moved to Phase 6B. Signing, notarization, automatic updates, and public distribution remain outside scope.

## Work

1. Build a command/native parity fixture that feeds identical canonical transcripts and decisions through both adapters and compares item identity/kind, phase grouping, approvals/effect digests, tool results/truncation/artifacts, usage, terminal states, and reconstruction.
2. Run the complete failure/cancellation/overload/restart matrix across startup, selection, chat rendering, tree/viewer/Git, terminal, and shutdown with deterministic local services.
3. Exercise the real supported macOS application on clean and existing Application Support roots, supported architecture/display classes, system/light/dark/high-contrast themes, 1x/2x scale, keyboard-only navigation, IME, and VoiceOver.
4. Run the same supervised live coding task through `pho` and the native workbench with the qualified DeepSeek account/profile and compare sanitized canonical outcomes and cost/usage projection.
5. Prove restart reconstructs completed/interrupted/uncertain sessions without replay, stale approval, terminal reattachment, or process PID reuse.
6. Record final dependency sources/features/licenses/advisories, binary size, startup/first-window/shutdown timings, child cleanup, and supported macOS version/architecture.
7. Update root/user documentation for build/run, storage/preferences, Keychain, network data/cost, Markdown/link policy, read-only viewer, agent-shell approval/sandbox limit, user-terminal authority/environment/shutdown, recovery, compatibility date, and known limits.

## Native scenario matrix

- first run with no credential/session/workspace; credential install/invalid replacement/network unavailable;
- one and many registered workspaces, large tree/history, missing/replaced root, idle and active-turn switching;
- streaming Markdown/math/tool/approval/usage, scroll-away, cancellation, renderer saturation, and exact source copy;
- patch/shell approval and denial, Git refresh/diff, viewer reload/read-only behavior, artifact/truncation details;
- two user terminals, foreground child/descendant, workspace switch, Git change, flood/backpressure, close/restart, window shutdown, and crash/no-reattach;
- lock contention between command/native processes, preference/session damage, crash during effect, restart reconstruction, and no replay;
- minimum/large display, resize/collapse/restore, all themes/scales, keyboard/IME/VoiceOver/reduced motion, and no focus/scroll theft.

## Required evidence

Evidence is dated and separates fixture-tested, native-manual, and live-qualified results. It records exact commands/scenarios and sanitized outcomes without prompts, reasoning, file bodies, terminal output, environment, credentials, account data, headers, or personal absolute paths. Any unavailable account, advisory database, supported machine, Keychain, PTY cleanup proof, or accessibility scenario is a verification gap rather than a pass.

## Original phase gate

This original gate is now the [deferred Phase 6B gate](README.md#deferred-original-phase-6-gate): earlier phases remain green, the native parity/live task succeeds, no known child is unreaped or falsely labeled, one qualified GPUI/source and PTY/render dependency graph is recorded, documentation matches observed behavior, and the evidence record is linked from the implementation roadmap and documentation index.
