# Move backend selection into the composer

Status: implemented and focused verified

Surface: composer toolbar and sidebar New session

Owner: [`../../version/v5/implementation-plan.md`](../../version/v5/implementation-plan.md), B4

Related V5 record: [`../../version/v5/logs/2026-08-27-codex-compatibility-and-composer-switcher.md`](../../version/v5/logs/2026-08-27-codex-compatibility-and-composer-switcher.md)

## Owner feedback

The backend chooser should be directly available in the composer. The longer external-backend disclosure should remain behind a small information button rather than occupying the main interface.

## Change

The sidebar New session row is again a single one-click Pi action. The composer toolbar now begins with a compact control showing the active backend. Its menu lists every backend advertised at bootstrap, marks Pi as built in, marks external backends Experimental, and explains that changing backend starts a separate session. The disclosure for separately installed Codex and Claude agents expands only after the information button is pressed.

Selecting the already active backend is a no-op. Selecting a different backend calls the existing new-session path with the current workspace and chosen backend ID, preserving the V5 rule that a session is pinned to one backend and an existing transcript is never reinterpreted.

## Verification

- `bun run --cwd packages/ui typecheck`: passed.
- `bun run --cwd apps/desktop typecheck`: passed.
- UI and desktop lint passed with no errors; 9 unrelated pre-existing React hook warnings remain.
- The desktop production bundle built successfully.
- Focused Electron chat verification passed 1 test outside the GUI-restricted sandbox. It proves the sidebar has no backend selector before session creation, the composer exposes the Pi/Codex/Claude menu, external rows are labeled Experimental, the info button reveals the disclosure, and selecting the already active Pi backend is a no-op.

The first direct Playwright run used a stale `out/` bundle because that command does not build. After rebuilding, one assertion still expected the previous disclosure wording; correcting it produced the final pass.
