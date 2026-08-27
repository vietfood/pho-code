# Integrated terminal promotion

Status: in progress  
Owner: features/terminal  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`../../../ui/logs/2026-08-15-change-v3-right-sidebar.md`](../../../ui/logs/2026-08-15-change-v3-right-sidebar.md), [`../../../ui/logs/2026-08-16-change-right-sidebar-surface-toggle.md`](../../../ui/logs/2026-08-16-change-right-sidebar-surface-toggle.md), [`../../../ui/logs/2026-08-16-change-sidebar-shortcuts-scrollbar.md`](../../../ui/logs/2026-08-16-change-sidebar-shortcuts-scrollbar.md), [`../../../ui/logs/2026-08-16-change-split-pane-chat-fill.md`](../../../ui/logs/2026-08-16-change-split-pane-chat-fill.md), [`../../../archive/v3/logs/2026-08-15-m0-m2-implementation.md`](../../../archive/v3/logs/2026-08-15-m0-m2-implementation.md), [`../../../archive/v3/logs/2026-08-16-v3-acceptance-review.md`](../../../archive/v3/logs/2026-08-16-v3-acceptance-review.md)

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
- Host chrome has no dedicated Collapse control; re-clicking the active surface hides it. Changes docks a stacked-file card on this panel; Expand opens an overlay over chat. Context prompt, Plan, and Terminal still use the docked panel. See [`../../../ui/logs/2026-08-22-change-sidebar-stacked-changes.md`](../../../ui/logs/2026-08-22-change-sidebar-stacked-changes.md), [`../../../ui/logs/2026-08-22-change-claude-changes-overlay.md`](../../../ui/logs/2026-08-22-change-claude-changes-overlay.md) and [`../../../ui/logs/2026-08-16-change-right-sidebar-surface-toggle.md`](../../../ui/logs/2026-08-16-change-right-sidebar-surface-toggle.md).
- Host resize clamp is 360–1100px (or 62% of the window), default 520px. See [`../../../ui/logs/2026-08-16-change-split-pane-chat-fill.md`](../../../ui/logs/2026-08-16-change-split-pane-chat-fill.md).
- A tiling tab redesign of the host is implemented: each surface becomes a tab, open tabs tile (cap of two visible, minimized tray beyond), and "re-clicking the active surface hides the panel" becomes "re-clicking an open surface's icon closes its tile." Terminal becomes a tile under the same ownership split. See [`../../../ui/logs/2026-08-27-decision-right-sidebar-tiling-tabs.md`](../../../ui/logs/2026-08-27-decision-right-sidebar-tiling-tabs.md).
