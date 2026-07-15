# Phase 3B: Interactive terminal experience

- Status: **PASS — 2026-07-15** ([evidence](../evidence/phase-3b-2026-07-15.md))
- Depends on: [Phase 3](phase-3-live-backend.md)
- Produces: Alternate-screen interactive `pho chat` presentation over the existing reducer and coordinator
- Next: [Phase 4](phase-4-tools.md)

## Required reading

1. [Presentation adapters and application lifecycle](../../architecture/native-harness-system.md#presentation-adapters-and-application-lifecycle)
2. [Canonical event flow](../../architecture/native-harness-system.md#canonical-event-flow)
3. [Phase 3 evidence](../evidence/phase-3-2026-07-15.md)
4. [Dependency baseline](../dependencies.md)
5. [Ratatui full-screen viewport](https://docs.rs/ratatui/latest/ratatui/enum.Viewport.html) and [terminal lifecycle](https://docs.rs/ratatui/latest/ratatui/struct.Terminal.html)

## Decision and outcome

Phase 3B is an optional usability insertion selected before Phase 4. It does not change the Phase 4 tool architecture or make terminal presentation part of the agent runtime. Its purpose is to make streaming output, tool lifecycle, denial, cancellation, failure, usage, and later approvals legible before real workspace effects are introduced.

`pho chat` becomes a minimal Claude Code-like full-screen terminal experience. It enters the terminal's alternate screen, owns that canvas while running, and restores the prior shell screen on exit. Ratatui supplies the rendering and terminal lifecycle primitives; Pho Code keeps its own canonical view model and event loop, and Ratatui types remain inside the terminal adapter.

The interactive process may accept multiple prompts, but every submission remains an independent ephemeral turn. Earlier displayed turns are not placed into model context, persisted, recovered, or presented as a durable session. Phase 5 continues to own conversational history, context reconstruction, journals, and recovery.

The user-facing term for this Phase 3B behavior is a **dedicated full-screen terminal session** or **alternate-screen TUI**. It owns terminal input and projection until exit and keeps a bounded display transcript inside the active process. It is not a separate operating-system terminal window, shell workspace, or persistent model conversation; Phase 5 owns durable conversation semantics.

## Implementation checkpoint

The implementation includes the approved normal/narrow render, a grapheme-safe bounded multiline composer, alternate-screen terminal guard and restoration, coalesced redraws over canonical events, repeated independent prompts, a bounded in-process display transcript, reasoning disclosure, tool/denial/failure/cancellation projection, cumulative usage/cost, explicit tiny/non-TTY failure, `--raw`, and preserved `--stdin`. Deterministic reducer, projection, editor, raw-mode, repeated-request, resize, alternate-screen, and macOS PTY restoration checks pass. Supervised live TUI turns and manual visual/interaction checks are recorded in the [Phase 3B evidence](../evidence/phase-3b-2026-07-15.md).

## Command contract

- `pho chat` requires a controlling terminal and launches the interactive alternate-screen TUI.
- `pho chat --stdin` retains the current raw one-shot path for automation, fixtures, redirected input, and diagnostic inspection.
- `pho chat --raw` adds a controlling-terminal, raw one-shot path using the same canonical renderer as `--stdin`.
- `pho status`, `pho login`, and `pho logout` remain raw commands.
- Non-TTY `pho chat` fails with bounded usage guidance instead of guessing a presentation mode.

Raw and TUI modes dispatch the same typed intents and consume the same canonical events. Neither owns credentials, backend calls, context construction, tools, approvals, or terminal truth. Presentation failure cancels the active owner through the existing coordinator path.

## Work order

### 1. Dependency and terminal-spike gate

- Review and exactly pin the current Ratatui release and the compatible Crossterm event dependency; record selected features, transitive graph, duplicate terminal crates, minimum Rust version, and licenses in the dependency baseline.
- Prove alternate-screen entry and exit, Unicode width, resize, bounded transcript scrolling, cursor placement, raw-mode restoration, and the existing nonblocking-output contract on supported macOS.
- Stop if the dependency graph creates a second runtime, conflicts with GPUI's graph, or cannot restore terminal state reliably.

### 2. Gold-standard view before bulk implementation

Build one deterministic in-memory render containing:

- one user prompt;
- collapsed provider reasoning with a visible disclosure control;
- one completed in-memory tool call/result;
- one denied fake mutation;
- one assistant answer;
- cumulative usage/cost status; and
- the active multiline composer.

Capture buffer snapshots at normal and narrow widths and obtain user review before implementing the complete event loop. The intended visual language is restrained transcript content, small lifecycle markers, and minimal persistent chrome. Do not copy Claude branding, exact artwork, or unrelated interaction complexity.

### 3. Terminal adapter and lifecycle

- Add a terminal-only view model derived from `AppState` and `RuntimeEvent`; do not store a second authoritative turn state.
- Run bounded input, canonical-event, and redraw paths under the existing Tokio runtime. Coalesce redraw requests, never semantic or terminal events.
- Own raw mode, alternate screen, cursor, resize, paste, and restoration through an explicit guard. Restore the prior shell screen and terminal mode on normal exit, initialization failure, render failure, cancellation, signal, and panic.
- Keep terminal reads and renders outside the reducer and runtime actors. A blocked or failed terminal must cancel rather than stall live work.

### 4. Interaction and projection

- Provide a bounded multiline composer with predictable cursor movement, backspace/delete, line breaks, paste, and submission.
- While idle, `Ctrl+C` clears nonempty input and otherwise requests exit; while running, it requests cancellation. `Ctrl+D` exits only while idle with empty input.
- Show streaming assistant text, a compact thinking indicator, optional provider-reasoning detail, tool name and lifecycle, denial/failure, terminal state, and cumulative usage/cost.
- Preserve sensitive-provider-reasoning treatment and bounded previews. Phase 3B does not invent approval summaries or expose raw provider/tool payloads that canonical events do not authorize.
- After a turn reaches one terminal state, accept another independent ephemeral prompt without retaining the prior turn in model context.

### 5. Raw parity and fallback behavior

- Preserve byte bounds, nonblocking descriptors, exit codes, cancellation, redaction, and broken/non-draining-pipe behavior for raw output.
- Keep `--stdin` deterministic and free of cursor control sequences.
- Add `--raw` without duplicating backend or coordinator construction.
- Make unsupported terminal capability, tiny viewport, and initialization failure explicit and recoverable; do not silently switch an interactive request into a different input contract.

## Verification

Automated evidence must include:

- Ratatui in-memory buffer snapshots for the approved gold-standard view, narrow widths, long wrapping, and resize;
- reducer-to-view-model tests for reasoning, text, tools, denial, cancellation, failure, usage, and exactly one terminal outcome;
- deterministic key, multiline edit, paste, cancel, clear, submit, and exit sequences;
- repeated independent turns proving that prior display content does not enter the next backend request;
- raw `--stdin` and `--raw` parity with no ANSI/cursor sequences in captured raw output;
- PTY checks for initialization, resize, signal, cancellation, terminal loss, render failure, non-draining output, clean exit, and exact terminal-mode restoration;
- command-process checks showing one coordinator/backend/tool path for raw and TUI projections; and
- a supervised live text turn, in-memory tool continuation, and fake-mutation denial through the TUI, recorded without prompt, reasoning, result, or replay content.

Manual evidence on supported macOS must inspect the approved normal-width and narrow-width layouts, in-app transcript scrolling, multiline editing, alternate-screen shell restoration, and legibility of active, denied, failed, cancelled, and completed states.

Run the repository's canonical format, check, build, test, Clippy, and diff checks after dependency and implementation changes.

## Gate

Phase 3B passes only when:

1. The user approves the representative visual unit and the implementation preserves that calibrated density.
2. `pho chat` provides repeated independent ephemeral turns through one alternate-screen TUI without creating conversation/session semantics.
3. `pho chat --stdin` remains raw and one-shot, and `pho chat --raw` provides the same raw projection from a controlling terminal.
4. Raw and TUI paths dispatch the same intents and consume the same canonical events; Ratatui/Crossterm types do not cross into reducer, backend, loop, tool, credential, or session modules.
5. Streaming text, thinking state, reasoning disclosure, tool lifecycle, denial/failure, cancellation, terminal state, and usage/cost are legible at supported widths.
6. Terminal initialization and every exit path restore prior terminal state, including panic, signal, render failure, and cancellation.
7. Input, event, redraw, transcript projection, and terminal output are bounded; overload fails visibly and cannot block the coordinator.
8. Prior displayed turns are absent from later model requests, and no Phase 5 persistence or recovery behavior is claimed.
9. Scripted, command-process, PTY, supervised-live, and manual visual evidence are recorded separately and pass.

## Non-goals

Phase 3B does not add persistent or volatile conversational context, sessions, recovery, real workspace tools, themes, mouse control, file browsing, complex panes, syntax highlighting, Markdown completeness, command palettes, plugin UI, GPUI reuse, or provider/runtime behavior. Those concerns remain with their existing phase and architecture owners.
