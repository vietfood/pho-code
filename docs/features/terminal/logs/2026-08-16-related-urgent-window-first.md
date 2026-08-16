# Related: urgent window-first must not move PTY into Pi

Status: ready for review  
Owner: features/terminal  
Plan: [`../implementation-plan.md`](../implementation-plan.md)  
Related logs: [`../../../urgent/window-first-pi-core/logs/2026-08-16-research-handoff.md`](../../../urgent/window-first-pi-core/logs/2026-08-16-research-handoff.md)

## Intent

Cross-link the urgent Pi-core track: if `HarnessRuntime` later moves to `utilityProcess`, `node-pty` and `TerminalHost` stay in the Electron adapter.

## Contracts and files

- Terminal product: [`../product.md`](../product.md) — PTY in Electron main; ghostty-web in the renderer
- Urgent plan: [`../../../urgent/window-first-pi-core/implementation-plan.md`](../../../urgent/window-first-pi-core/implementation-plan.md) Milestone 3 diagram

## Changes and decisions

No terminal contract change. Window-first must not block terminal milestones. Pi-process extraction must not put PTY inside the Pi child.

## Verification

Not verified: documentation-only reciprocal link.

## Mistakes and corrections

Do not teach the Pi runtime about the owner PTY as a shortcut when splitting processes.

## Owner feedback

None new.

## UI impact

None.

## Blockers and handoff

Terminal remains in implementation with no PTY in source. Urgent window-first remains proposed.
