# PTY and terminal-emulator study for Phase 6

- Status: Research decision recorded; implementation candidate unqualified
- Audit date: 2026-07-17
- Local Zed revision: `7cf50a771f54427f76b4584030c7b3b66f4e39f5`
- Consumer: [User terminal architecture](../architecture/user-terminal.md)

## Question

Which macOS Rust PTY/emulator boundary can support a bounded first-class user terminal without importing a second application runtime, GPL Zed UI code, unbounded event flow, or model-shell semantics?

## Decision

The first spike qualifies [`portable-pty` 0.9](https://docs.rs/portable-pty/0.9.0/portable_pty/) for PTY allocation/spawn/resize/child handles with [`vt100`](https://docs.rs/vt100) as the smallest plausible screen emulator. This pair is not yet an accepted production dependency. Direct pinned [`alacritty_terminal`](https://docs.rs/alacritty_terminal/latest/alacritty_terminal/) is the fallback candidate if the minimal emulator cannot satisfy full-screen, Unicode, alternate-screen, and escape-sequence behavior.

The Zed `terminal` and `terminal_view` crates in the pinned checkout are rejected for Phase 6 integration absent a separate licensing decision: both declare GPL-3.0-or-later, carry broad Zed service dependencies, and are not required to use their lower-level evidence. Pho Code may study behavior but does not copy code from them.

## Verified local evidence

Pho Code currently has one application Tokio runtime and no direct PTY or emulator dependency. The existing `shell` tool is noninteractive `/bin/zsh -f -c` with closed stdin, scrubbed environment, bounded pipes, approval, process-group cancellation, and durable outcomes. Reusing it would violate both user interactivity and the authority separation accepted by ADR 0004.

At the pinned Zed revision, `crates/terminal` wraps its `alacritty_terminal` fork, constructs a PTY/event loop, handles input/resize/exit, and attempts process-group cleanup. It pins the fork at `4c129667ce56611becdc82de6e28218c80e2e88f`. The wrapper's PTY event sender is explicitly unbounded with a source TODO to replace it, so its handoff policy also fails Pho Code's bounded-channel rule unchanged.

Zed's persistence code retains terminal panel/tab metadata while excluding active task terminals. That supports Pho Code's process-local terminal design but is evidence only; Pho Code preferences never persist live PTY state or scrollback.

## Candidate comparison

| Candidate | Useful capability | Qualification risk | Phase 6 result |
| --- | --- | --- | --- |
| `portable-pty` 0.9 + `vt100` | MIT components; native PTY traits, spawn, reader/writer, resize, child handle; small screen model | Blocking reads; macOS process-group cleanup and emulator coverage unproven | Recommended first spike |
| Direct pinned `alacritty_terminal` | Apache-2.0 upstream metadata; mature parser/emulator/PTY/event loop | Git revision/features, fork behavior, unbounded-wrapper precedent, graph size | Fallback spike |
| Zed `terminal` / `terminal_view` | Proven product-level behavior at audited source | GPL-3.0-or-later and broad Zed application dependencies | Rejected unchanged |
| `vte` alone | MIT/Apache parser | No screen model or PTY | Insufficient alone |
| `termwiz` | Rich cells/surfaces/terminal utilities | Larger fast-changing surface and overlap | Not first choice |
| macOS `openpty` + reviewed spawn setup | Direct controlling-terminal/process-group control | Unsafe/low-level ownership and pre-exec burden | Contingency only |
| `forkpty` inside the app | Compact API | Fork safety inside multithreaded Tokio/GPUI process | Rejected as casual fallback |

The [`portable-pty` documentation](https://docs.rs/portable-pty/0.9.0/portable_pty/) demonstrates native PTY creation, shell spawn, reader cloning, master writes, dimensions, and child termination handles, but it does not by itself prove Pho Code's descendant process-group contract on macOS. Apple's [`openpty(3)` manual](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man3/openpty.3.html) documents master/slave allocation, controlling-terminal setup through `login_tty`, and the composition of `forkpty`; any lower-level adapter must preserve those semantics without unsafe post-fork behavior.

## Spike gate

The disposable spike records exact versions/revisions, features, duplicate runtime/source identities, licenses, advisories, clean macOS build, and release-size change. It compares the two candidates against the same typed actor and corpus rather than allowing a crate API to define architecture.

Acceptance requires:

1. interactive login-shell startup in a retained workspace with no injected Pho/Keychain secret;
2. correct PTY size/SIGWINCH, input, Unicode cells, ANSI color, alternate screen, bracketed paste, selection/copy source, and disabled OSC 52/automatic links;
3. bounded blocking-read isolation, output flood/scrollback eviction, input backpressure, snapshot coalescing, and lossless lifecycle events;
4. foreground interrupt, child exit/drain, descendant process-group terminate/kill fallback, wait/reap, and honest `Uncertain` when cleanup cannot be proven;
5. eight-tab, workspace-switch, close, clean restart, crash/no-reattach, accessibility, and GPUI focus behavior on the supported macOS target;
6. no GPL Zed terminal code and no second GPUI/Tokio application runtime.

If `portable-pty` cannot prove group ownership/cleanup but its emulator boundary otherwise passes, Phase 6 stops for a narrow macOS spawn design; it does not weaken `Closed` semantics. If both emulators fail usability or containment gates, the workbench may ship without an enabled PTY only by revisiting ADR 0004 and the Phase 6 outcome.
