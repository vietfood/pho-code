# Claude ACP session option

Date: 2026-08-27
Kind: change
Surface: session backend chooser
Owner: V5 Pho Agent Foundation

## Expected behavior

The small New Session backend chooser lists Pi, Codex, and Claude. Pi remains the one-click default. Choosing Claude creates a backend-pinned session and lazily starts the fixed external `claude-agent-acp` command; opening Pho Code or using Pi does not start it.

## Trust and failure behavior

Pho Code does not install, download, configure, authenticate, or update Claude. If the executable is missing or incompatible, session creation fails without changing an existing session. The existing disclosure info control explains that external backends run with their own process permissions and account configuration.

## Verification

Focused Electron `chat.spec.ts` passed 4 tests: the menu displayed Pi, Codex, and Claude; both external choices displayed Experimental; the info disclosure opened; and the one-click action still created Pi. The first test attempt used an incorrect ARIA-role locator for `<summary>` and timed out after visually reaching the correct menu; the corrected label locator passed. Real provider execution is owner-controlled and was not run.

## Related V5 record

See [`../../version/v5/logs/2026-08-27-external-backend-ownership.md`](../../version/v5/logs/2026-08-27-external-backend-ownership.md).
