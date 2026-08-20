# Window-first startup status

Status: accepted and closed 2026-08-20
Surface: app launch / welcome launcher / About
Owner: archived [`window-first-pi-core`](../../archive/urgent/window-first-pi-core/README.md)
Owning implementation: [`Milestone 1 log`](../../archive/urgent/window-first-pi-core/logs/2026-08-20-m1-window-first-implementation.md); [`closure`](../../archive/urgent/window-first-pi-core/logs/2026-08-20-m1-acceptance-and-closure.md)
Related defect: [`window blocked on Pi boot`](./2026-08-16-bug-window-blocked-on-pi-boot.md)

## Change

The welcome launcher and metadata recents now render while Pi is starting. Pi-backed project, session, model, and prompt actions remain disabled. The launcher shows **Starting Pi…** during boot and a fixed redacted error if boot fails; About distinguishes starting, ready, and failed.

Renderer bootstrap no longer waits for provider accounts. A separate typed runtime-status subscription wakes the renderer, which re-queries authoritative bootstrap state before enabling controls.

## Verification

- UI component coverage proves the welcome chrome remains present in starting and failed states.
- Electron coverage holds runtime boot, sees the welcome heading and recent project, confirms `runtime_unavailable`, releases boot, and completes deterministic chat.
- Electron failure coverage keeps the welcome chrome alive with the bounded error.
- Focused startup/chat/shutdown/Stop lane: 11 passed.
- Full Electron lane: 28 passed, including all three new startup journeys.

Packaged UI behavior was not run because the owner excluded package work on this machine. The owner explicitly waived that assertion for closure; it remains unverified, not passed.
