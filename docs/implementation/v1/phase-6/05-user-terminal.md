# Phase 6.5: User terminal

- Status: Pending Phase 6.4
- Depends on: [Phase 6.1](01-native-foundation.md) and [Phase 6.2](02-workbench-state.md); scheduled after [Phase 6.4](04-workspace-inspection.md)
- Architecture: [User terminal](../../../architecture/user-terminal.md)
- Research: [PTY and terminal-emulator study](../../../research/terminal-pty-source-study.md)
- Next: [Phase 6.6 integration and release](06-integration-and-release.md)

## Outcome

The inspection pane contains a first-class tabbed interactive macOS terminal whose bounded actor owns PTYs, emulator state, direct user input, workspace binding, process groups, output flow, and honest shutdown. It remains wholly separate from agent tools, approvals, sessions, and model context.

## Work

1. Run the disposable `portable-pty + vt100` versus direct pinned `alacritty_terminal` spike on the exact production graph. Record versions/features/licenses/advisories/size and reject Zed GPL terminal wrappers.
2. Select only a candidate that passes controlling-terminal, process-group, reap, resize, emulator, and bounded-channel gates; otherwise stop for the documented narrow macOS PTY design.
3. Implement opaque identities, generations/sequences, the eight-tab `TerminalActor`, typed commands/events, state machine, dedicated blocking readers, immutable snapshots, coalesced wakeups, lossless lifecycle events, and all resource bounds.
4. Implement login-shell resolution, contained initial cwd, documented environment allowlist/credential exclusions, title/cwd hint sanitization, OSC/link/clipboard policy, and Git badge binding.
5. Implement keyboard/paste/resize/selection/copy/search, input backpressure, scrollback eviction, interrupt/restart/close, dormant preference restoration, workspace grouping, and accessibility.
6. Implement clean window shutdown and process-group terminate/kill/wait/reap/absence proof with `Uncertain` on any unproven result.

## Acceptance scenarios

- interactive shell startup/exit/failure, `stty size`, SIGWINCH, foreground `Control-C`, alternate screen, bracketed paste, Unicode/wide/combining cells, ANSI color, malformed escapes, OSC 7/52, and links;
- one-byte and flood output, long lines, eight tabs, rapid input/resize, input saturation, snapshot coalescing, scrollback/aggregate eviction, and lifecycle-channel pressure without UI/coordinator deadlock;
- workspace switch leaves the process in its original cwd and uses the correct Git generation; root replacement blocks new/restart without retargeting the live child;
- child/descendant close exercises hangup/terminate/kill fallback, wait/reap, process-group absence, deadline, and `Uncertain`;
- close/restart never replays input or output, crash/relaunch never reattaches or signals a persisted PID, and restored descriptors are dormant;
- provider/Pho secret variables are absent, and terminal input/output/environment/history/PID/cwd never enter logs, sessions, artifacts, model requests, tools, or approvals.

## Gate

Phase 6.5 passes only with one license-approved dependency set, pure actor/projection tests, real macOS PTY/process-group evidence, bounded flood behavior, privacy/redaction evidence, keyboard/accessibility review, and no unreaped child reported as success. A process result that cannot be proven is `Uncertain` and leaves the package incomplete until that behavior is accepted by architecture or fixed.
