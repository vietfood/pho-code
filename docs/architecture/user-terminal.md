# User terminal architecture

- Status: Normative V1 architecture; bounded actor and single-surface implementation released in 0.1.0; multi-tab qualification deferred to V2 Phase 6B
- Governing decision: [ADR 0004](../decisions/0004-native-workbench-phase-6.md)
- Parent presentation: [GPUI workbench](gpui-workbench.md)
- Dependency research: [PTY and emulator study](../research/terminal-pty-source-study.md)
- Model-facing process contract: [V1 shell tool](tools.md#noninteractive-shell)
- Delivery: [Phase 6](../implementation/v1/phase-6/README.md)

## Document role

This document owns the embedded user terminal's PTY/emulator boundary, typed actor, process state, input/output/resize flow control, workspace binding, privacy, restart, and shutdown. It does not own the agent shell tool, approval, session history, Git computation, window layout, or a general terminal framework.

## Authority and non-goals

The embedded terminal is a direct user-operated interactive shell running with the macOS account's authority. It is not sandboxed. User input may execute shell startup files and commands that can read, mutate, or remove anything the account can access. The terminal pane and README state this plainly.

This authority never crosses into the agent harness. Terminal input/output, exit status, title, cwd hints, prompt text, process identity, and shell history cannot become model context, a tool result, an approval decision, a provider request, or proof that an agent effect completed. The model-facing shell remains noninteractive, exact-effect approved, descriptor-bound, environment-scrubbed, bounded, and durably recorded under the tools/session contracts.

Multiple user terminals may run concurrently because they are independent user processes. This does not relax the global V1 limit of one selected session, one active root agent turn, one backend stream, and one active agent tool.

## Identity and ownership

Terminal identities are opaque and independent of tab order:

```text
TerminalId
TerminalGeneration
TerminalEventSequence

TerminalBinding
  registration_id: WorkspaceRegistrationId
  workspace_generation: WorkspaceGeneration
  initial_relative_cwd
```

One coordinator-managed `TerminalActor` owns at most eight terminal entries. Each entry owns the PTY master/slave lifecycle, shell child and process-group/session identity, emulator/parser, bounded input queue, blocking reader/emulator worker, output/screen ring, cancellation state, and join handles. OS descriptors, process IDs, environment, buffers, cancellation tokens, and handles are process-local and never durable.

GPUI views own only tab order, focus, selection, scroll anchor, local search state, and rendering of immutable `TerminalSnapshot` values. A view cannot allocate a PTY, write bytes, resize an fd, signal a process, wait for a child, or parse raw output.

## Typed actor protocol

Commands carry terminal ID and generation where applicable:

```text
CreateTerminal { binding, rows, columns, pixel_size }
WriteInput { terminal_id, generation, bytes }
Resize { terminal_id, generation, rows, columns, pixel_size }
SendInterrupt { terminal_id, generation }
CloseTerminal { terminal_id, generation, reason }
RestartTerminal { terminal_id, next_generation }
RequestSnapshot { terminal_id, generation, after_sequence? }
ShutdownAll { deadline }
```

Events are typed and bounded:

```text
Opening
Ready
SnapshotChanged { sequence }
OutputTruncated { omitted_rows_or_bytes }
InputBackpressure
TitleHintChanged
CwdHintChanged
ChildExited { status_class }
Closing
Closed
Failed { safe_code }
Uncertain { safe_code }
```

Raw output is consumed by the actor/emulator and is not broadcast as an unbounded event stream. High-frequency `SnapshotChanged` notifications use a latest-state/coalescing mailbox per tab. Opening, ready, exit, close, failure, truncation, backpressure, and uncertain events are lossless within a bounded lifecycle channel; saturation transitions visibly rather than dropping terminal truth. A snapshot is accepted only when terminal identity, generation, and monotonically increasing sequence match.

## State machine

```text
Dormant -> Opening -> Running
Opening -> Failed
Running -> Draining -> Exited
Running -> Closing -> Closed
Running -> Failed -> Closing
Closing -> Uncertain
Exited | Closed | Failed | Uncertain -> Restarting -> Opening
```

`Opening` allocates the PTY, constructs the child configuration, spawns the shell, closes unused slave/master references, starts the reader/emulator worker, and publishes `Running` only after the actor owns every cleanup handle. Partial startup failure closes acquired descriptors and waits/reaps any spawned child before `Failed`.

Normal child exit enters `Draining`: new input is rejected, the writer closes, and remaining PTY bytes are consumed for a bounded grace before the final snapshot and `Exited`. A read/write failure while the child may still live enters the close path; it is not treated as child exit.

User close or application shutdown enters `Closing`, rejects new input/resize, sends the qualified hangup/termination sequence to the owned session/process group, waits a short grace, escalates to kill when necessary, closes the PTY, and waits for the child. `Closed` requires both child wait/reap and the qualified process-group absence check. If either cannot be established by the deadline, the state is `Uncertain` and the UI says cleanup could not be proven. A cancellation request alone is never rendered as termination success.

Restart is always explicit, increments the terminal generation, and spawns a fresh shell. It never replays input, shell history, cwd hints, screen content, or a prior command. `Uncertain` requires acknowledgement before restart and does not assert that the old process is dead.

## PTY and emulator boundary

The initial qualification candidate is `portable-pty 0.9.x` for PTY allocation/spawn/resize/child handles plus a minimal `vt100` screen emulator. This is a candidate, not an accepted dependency. It must prove controlling-terminal behavior, foreground/descendant process-group signalling, wait/reap semantics, resize/SIGWINCH, EOF/EIO handling, full-screen programs, Unicode cells, and the complete dependency/license graph on the supported macOS target.

Direct pinned `alacritty_terminal` is the fallback candidate when the minimal emulator cannot meet required terminal behavior. Its parser/emulator and PTY event loop are mature evidence, but its exact Git revision, features, event-channel policy, and graph require qualification. Pho Code does not import or copy Zed's `terminal` or `terminal_view` crates because the audited versions are GPL-3.0-or-later, depend on broad Zed application services, and use an unbounded terminal event sender.

If neither candidate proves process-group cleanup, a narrow macOS `openpty`/`login_tty` implementation may be designed separately. `forkpty` is not casually called inside the multithreaded GPUI/Tokio process; any pre-exec code must remain async-signal-safe and receive explicit review.

PTY reads are blocking on macOS. Phase 6 uses one dedicated bounded reader/emulator worker per running tab, never a blocking GPUI or Tokio coordinator task. The actor remains the sole owner of screen state; GPUI receives immutable cell/row snapshots.

## Shell startup and environment

The actor obtains the user's configured login shell from the macOS account record and falls back to `/bin/zsh`. The resolved value must be an absolute executable regular file. The exact login/interactive argv convention is qualified against zsh and the configured shell; unlike the agent tool, the terminal does not force `-f` or pass a command string. Startup files are intentionally user code.

The initial cwd is the selected registration's validated retained workspace root. A tab remains bound to that registration and workspace generation for its lifetime. Switching the workbench does not `chdir`, kill, restart, or relabel the process; the old tab remains grouped and visibly named for its original workspace. If that root is later renamed/replaced, the existing process may continue in its OS cwd, but restart/new-tab creation fails until the user selects a valid registration.

The child environment is rebuilt from a documented interactive allowlist, including the account/home/shell identity, bounded `PATH`, locale, temporary-directory, and explicitly qualified development socket variables needed for the personal workflow, plus terminal values such as `TERM` and terminal-program identity. It does not blindly forward the native process environment. Provider-key names, Pho internal/test variables, credential actor state, Keychain data, model content, approval data, and tool environment are excluded. Environment names/values are bounded before spawn and never logged or persisted. The release test enumerates the allowlist and proves known provider credential and Pho test-secret absence in the child.

The terminal renders the user's actual prompt output. Pho Code does not rewrite or scrape it for cwd, branch, dirty state, or command completion. The separate Git service provides a workspace badge in the terminal tab/header and marks it stale independently. OSC title and cwd sequences are sanitized untrusted hints; a cwd hint is never used for workspace authority without a new contained validation. OSC 52 clipboard writes and automatic URI/hyperlink activation are disabled in V1.

## Input, output, resize, and backpressure

Keyboard, bracketed paste, and qualified mouse/text composition mapping occur only while terminal content owns focus. Ordinary terminal keys become bounded bytes for `WriteInput`; application shortcuts are intercepted before PTY encoding. Typed `Control-C` is terminal input for the foreground process. Toolbar interrupt/close controls are separate actor signals and state their effect.

Initial limits are:

| Resource | Bound |
| --- | --- |
| Running tabs | 8 |
| PTY dimensions | 512 columns by 256 rows |
| One input frame | 64 KiB |
| Queued input per tab | 256 KiB |
| One output read chunk | 16 KiB |
| Scrollback per tab | 20,000 rows or 16 MiB, whichever comes first |
| Aggregate terminal screen/scrollback | 64 MiB |
| Snapshot handoff | one coalesced latest snapshot plus bounded lifecycle events |

When input capacity is unavailable, input is rejected visibly and paste pauses; bytes are never silently discarded. Output consumption must continue so a non-draining UI cannot deadlock the child. At the scrollback or aggregate cap, the oldest rows are evicted, `OutputTruncated` records the local omission count, and the live screen remains usable. Output is not moved to a journal or artifact to evade memory limits.

Resize accepts clamped columns, rows, and pixel dimensions and coalesces identical/intermediate geometry. The PTY size and emulator grid advance under the same terminal generation; stale resize commands cannot affect a replacement shell. Zero/invalid sizes never reach the OS.

## Presentation and persistence

The terminal pane is first-class: it has an independent tab bar, focus target, running/exited/error badge, workspace label, bounded scrollback, selection/copy, local search, and explicit new/interrupt/restart/close controls. It is not visually hidden as tool output. Terminal tabs may remain running when the viewer is collapsed or another workspace is selected.

Only a bounded dormant descriptor may enter workbench preferences: terminal tab order, registration ID, initial contained relative cwd, and sanitized display title. Live handles, PID/group, environment, input/output, screen, scrollback, selection, command history, exit status, and reconnect token are never persisted. After orderly shutdown or restart, restored tabs are dormant and require explicit start; after a crash, the app never reattaches or replays.

Copying selected terminal text is an explicit user clipboard action. The default excludes trailing padded cells and preserves bounded displayed text. Terminal output cannot request clipboard writes, open links, open files, invoke Git, access Keychain, or dispatch an agent intent.

## Shutdown and crash behavior

Workspace switching leaves terminals running under their original bindings. Closing a tab or window presents the direct-user-authority/termination consequence when a child is active. Agent cancellation and PTY closure remain separate operations even when the same window-close confirmation mentions both.

Application shutdown calls `ShutdownAll`, waits for each terminal's close state and child worker join, then allows the shared lifecycle to release the instance guard. A terminal cleanup deadline produces `Uncertain`; it does not silently detach a child. Safe diagnostics retain terminal identity, generation, operation, signal-stage/status class, deadlines, and whether wait/reap/group absence were proven, but no command, cwd, output, input, environment, or PID.

Process death can prevent clean signalling, and macOS provides no claim here that arbitrary daemonized descendants die with the app. On next startup, `clean_shutdown = false` permits a warning and dormant-tab restoration only. Pho Code neither searches for nor signals an old PID from preferences, because PID reuse and missing ownership handles make that unsafe.

## Verification

Pure tests cover every state transition, stale identity/generation/sequence, lossless lifecycle events, snapshot coalescing, input backpressure, scrollback eviction, dimension clamping, terminal/app shortcut routing, dormant restoration, and diagnostic redaction.

The macOS PTY corpus covers shell startup/exit, startup failure, `stty size`, resize/SIGWINCH, `Control-C` of a foreground child while the shell survives, descendant process-group close, terminate/kill escalation, wait/reap and absence proof, EOF/EIO, Unicode/wide/combining cells, ANSI color, alternate screen, bracketed paste, malformed escapes, OSC 7/52, hyperlinks, large/one-byte output, long lines, rapid input/resize, eight tabs, cache pressure, and saturated UI handoff.

Integration scenarios keep a terminal running across a workspace switch, verify its original cwd and Git badge, close/restart without replay, exercise window close with both a turn and child active, crash/relaunch without reattachment, and prove that terminal content never appears in model requests, journals, artifacts, logs, approvals, or tool results. Every child-cleanup claim is supported by wait/process-group evidence; otherwise the observed result is `Uncertain`.
