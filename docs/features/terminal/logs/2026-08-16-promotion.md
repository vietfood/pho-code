# Integrated terminal promotion

Status: in progress  
Owner: features/terminal  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`../../../ui/logs/2026-08-15-change-v3-right-sidebar.md`](../../../ui/logs/2026-08-15-change-v3-right-sidebar.md), [`../../../ui/logs/2026-08-16-change-right-sidebar-surface-toggle.md`](../../../ui/logs/2026-08-16-change-right-sidebar-surface-toggle.md), [`../../../ui/logs/2026-08-16-change-sidebar-shortcuts-scrollbar.md`](../../../ui/logs/2026-08-16-change-sidebar-shortcuts-scrollbar.md), [`../../../archive/v3/logs/2026-08-15-m0-m2-implementation.md`](../../../archive/v3/logs/2026-08-15-m0-m2-implementation.md), [`../../../archive/v3/logs/2026-08-16-v3-acceptance-review.md`](../../../archive/v3/logs/2026-08-16-v3-acceptance-review.md)

## Intent

Record the owner-approved promotion of the integrated terminal as an add-on independent of V3.

## Contracts and files

- `TerminalHost` is an application-facing port implemented by an Electron-owned `TerminalService`.
- `node-pty` remains in Electron main; `ghostty-web` remains in the renderer UI package.
- Terminal events use a dedicated subscription and do not enter the conversation streaming path.
- The existing right sidebar supplies host chrome only.

## Changes and decisions

- One owner PTY per workspace.
- Hide/collapse does not kill the process; Restart and Close are explicit.
- The renderer cannot submit cwd, environment, shell executable, or PID.
- Owner-typed terminal commands are separate from agent `bash`.
- No terminal UI, PTY, dependency pin, or accepted evidence exists in source yet.

## Verification

Not verified: every implementation and acceptance check in the terminal plan remains outstanding.

## Mistakes and corrections

Do not describe this promoted plan as shipped or accepted. Do not place terminal implementation under V3 or Pi runtime ownership.

## Owner feedback

Promoted as a standalone optional add-on on 2026-08-16.

## UI impact

Terminal will be a peer right-sidebar surface beside Changes and Context prompt. The UI track owns host consistency; this add-on owns terminal product behavior.

## Blockers and handoff

- Milestone 0 must prove Electron ABI loading for `node-pty` and CSP-compatible Ghostty WASM.
- Before changing the right-sidebar surface union, read the linked UI/V3 record and preserve exhaustive handling.
- Host chrome has no dedicated Collapse control; re-clicking the active surface (Changes, Context prompt, and later Terminal) hides the panel. See [`../../../ui/logs/2026-08-16-change-right-sidebar-surface-toggle.md`](../../../ui/logs/2026-08-16-change-right-sidebar-surface-toggle.md).
