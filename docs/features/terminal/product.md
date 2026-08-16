# Product definition: integrated terminal

## Status

Owner-approved add-on product boundary, 2026-08-16. This is **not** v3 and does not block or depend on change-review acceptance.

Personal v1 and v2 remain accepted. The implementation contract is [`implementation-plan.md`](./implementation-plan.md). Status is **In implementation** until that plan’s acceptance gate passes.

## Outcome

The owner can open a real login shell in the selected workspace from the existing right sidebar, type commands, see faithful VT output, resize the panel, hide the panel without killing the process, restart or close that shell explicitly, and quit the app with bounded process teardown.

The conversation stays primary. The terminal is an owner-facing workspace tool, not a second IDE, not a replacement for Pi `bash`, and not a sandbox.

## Audience and trust model

The add-on continues the personal, trusted-workspace assumptions of accepted v2:

- the owner selects and trusts the workspace for ordinary coding work;
- commands typed in this panel run as the app user with the app process’s authority;
- that is the same local authority as opening Terminal.app in that folder;
- Pi permission modes do **not** wrap keystrokes here;
- agent `bash` remains a separate, permission-gated one-shot tool;
- macOS is the first verified platform; Linux stays compatibility-oriented until exercised;
- Windows is out of scope.

Honest disclosure is required in UI copy or Settings/About where the surface is introduced:

- Pi has no built-in sandbox.
- Renderer sandboxing protects the desktop UI boundary; it does not sandbox the shell.
- Confirmation dialogs and process separation are not a sandbox for this PTY.

## Selected product decisions

These were open in the research note. They are now the product contract:

| Decision | Selection |
| --- | --- |
| Scope | **One PTY per selected workspace.** Chat switch in the same project keeps the shell. Project switch hides this workspace’s terminal and shows or creates the other project’s. |
| Host chrome | **Existing right sidebar.** Terminal is a third surface beside Changes and Context prompt. Not a bottom drawer, not a second window, not T3’s multi-surface split store. |
| Emulator | **Pinned `ghostty-web`, not xterm.js.** WASM Ghostty VT + canvas, xterm-shaped attach API. |
| PTY | **Pinned `node-pty` in Electron main** behind `TerminalHost` / `TerminalService`. Never in the renderer, preload, UI package native bindings, or Pi runtime. |
| Tabs / splits | **None in this add-on.** One shell per workspace. A later add-on may add a small tab cap. |
| Hide vs kill | **Collapse, surface switch, and chat switch do not SIGTERM.** Restart and Close in the terminal chrome do. Removing a project or quitting disposes that workspace’s PTY. |
| Keep-alive | **Keep the ghostty-web instance mounted and hidden** when switching to Changes or Context prompt. If the whole right sidebar unmounts, restore from the host replay buffer on next open. |
| Shell binary | **Allowlisted login shell only.** `SHELL` when it is an absolute allowlisted path; otherwise `/bin/zsh` then `/bin/bash` on macOS. No Settings field for an arbitrary executable. |
| Font | **No new Settings control.** Map the existing appearance chat font size into ghostty-web, clamped to 11–18px, with a monospace stack from theme tokens (`ui-monospace`, SF Mono, Menlo, monospace). Palette colors map from CSS variables. |
| Shortcut | **Deferred.** First release is the rail icon. A later chrome pass may add a toggle. |
| Agent attach | **Out of scope.** Do not pipe Pi `bash` or tool output into this PTY. |
| Scrollback persistence | **Memory only.** No disk log, no Pi JSONL, no change-ledger entries. |

## Non-goals

This add-on will not:

- ship xterm.js, `@xterm/*` addons, or a DOM-row emulator;
- put `node-pty`, process handles, or raw IPC in the renderer;
- teach the Pi runtime, baked extensions, or agent tools about the owner PTY;
- expose an arbitrary shell executable path, generic terminal JSON settings, or a second font system;
- add splits, tabs, worktree-scoped shells, remote SSH, or Windows ConPTY;
- claim renderer sandboxing, permission dialogs, or process separation as containment;
- implement Oh My Pi persistent eval / kernel sessions;
- copy pi-gui’s bottom drawer or T3’s right-panel store wholesale;
- become a file explorer, browser, or second editor in the same rail.

## Product invariants

1. **Conversation remains primary.** The terminal is an optional right-rail surface. Opening it must not replace the transcript or composer.
2. **The renderer never receives authority.** It receives terminal ids, status, bounded replay/data strings, and titles. It never receives cwd paths, env, PIDs, PTY handles, or a generic process channel.
3. **Workspace identity is host-owned.** cwd is the canonical selected workspace already known to the application. The renderer cannot retarget a PTY by supplying a path.
4. **Selection is not process ownership.** Switching chats does not dispose the workspace PTY. Switching the visible surface does not dispose it.
5. **Hide is not close.** Closing the panel chrome is not SIGTERM. Close is an explicit action.
6. **Pi JSONL stays transcript authority.** Terminal I/O is not a session, not a run, and not a change-review record.
7. **Agent tools stay independent.** Pi `bash` and this PTY do not share a process, buffer, or permission path.
8. **Bounded I/O.** Writes, replay, titles, and event payloads have explicit size limits. Pressure drops oldest replay and coalesces live data rather than growing without bound.
9. **Fail closed without breaking chat.** Missing `node-pty`, WASM init failure, or a dead shell degrades to an error on the Terminal surface. Changes, Context prompt, and conversation keep working.
10. **Packaged native modules are app-owned.** The unsigned macOS `.app` must load an Electron-ABI `pty.node` and same-origin `ghostty-vt.wasm` without compiling on first launch and without a Pi CLI.

## User-visible contract

- The collapsed overlay pill and expanded icon rail gain a Terminal control (`SquareTerminal` or equivalent lucide icon) after Collapse / Changes / Context prompt.
- Selecting it expands the same mouse-resizable panel (`pho-code.reviewSidebarWidth`, clamp 360–720px) and shows the emulator.
- No selected workspace: the icon is disabled with a short reason (“Open a project to use the terminal”).
- Empty/error states: spawn failure, WASM load failure, exited shell with Restart.
- Status chrome: running / exited / error, plus an optional short OSC title (truncated).
- Restart recreates the PTY for that workspace. Close disposes it; the next ensure creates a new one.
- Escape collapses the right sidebar only when the terminal view is not focused. Focused keystrokes, including Escape, go to the PTY.
- http(s) hyperlinks in output open through the existing main-process URL gate. The renderer never `window.open`s.
- Appearance theme and `prefers-reduced-motion` apply: cursor blink off when reduced motion is requested.
- Composer and terminal must not both consume the same printable keystrokes while the terminal is focused.

## Lifecycle

| Owner action | PTY |
| --- | --- |
| Open Terminal surface | `ensure` for the selected workspace; spawn if none |
| Switch to Changes / Context prompt | Keep PTY; keep ghostty-web mounted hidden |
| Collapse right sidebar | Keep PTY; view may unmount; replay on next open |
| Switch chat, same workspace | Keep PTY and view association |
| Switch workspace / project | Hide previous; `ensure` the newly selected workspace’s PTY |
| Restart | Dispose PTY, spawn replacement, clear replay |
| Close | Dispose PTY; next open is a new shell |
| Remove project | Dispose that workspace’s PTY |
| Quit | SIGTERM, short grace, SIGKILL; report leftovers on the bounded-shutdown probe |

Application restart does not restore the previous shell. A new `ensure` starts a new login shell. That is intentional: there is no persisted session.

## Data

| Data | Owner | Location | User consequence |
| --- | --- | --- | --- |
| PTY process, env, cwd | Electron `TerminalService` | Memory; dies on close/quit | Local shell with workspace access |
| Replay buffer | Same | Memory, 1,000,000 UTF-16 code units max, oldest dropped | Scrollback after hide/remount; not a log |
| Panel width / collapsed / selected surface | Renderer | existing `localStorage` keys plus surface `"terminal"` | Chrome only |
| Pi JSONL / change ledger | Unchanged | Unchanged | Terminal I/O is not transcript or review authority |

Diagnostics may report spawn failure class, status, col/row, truncated replay, and redacted error text. They must not ship env dumps, command traces, or replay contents to general logs.

## Relationship to other tracks

| Track | Relationship |
| --- | --- |
| V3 change review | Independent. Shell mutations are still not attributed undo targets. |
| Conversation UI | Hosts the rail. Terminal chrome and PTY lifecycle are this add-on. |
| Permission feature | Does not gate owner keystrokes. Continues to gate agent `bash`. |
| Compaction / session tree | Unrelated. |

## References

- Implementation contract: [`implementation-plan.md`](./implementation-plan.md)
- Add-on tracker: [`../README.md`](../README.md)
- Architecture: [`../../architecture/overview.md`](../../architecture/overview.md), [`../../architecture/desktop-shell.md`](../../architecture/desktop-shell.md)
- Right sidebar chrome: [`../../ui/implementation/conversation-ui.md`](../../ui/implementation/conversation-ui.md)
- Roadmap Phase D (promoted here): [`../../version/roadmap-vnext.md`](../../version/roadmap-vnext.md)
