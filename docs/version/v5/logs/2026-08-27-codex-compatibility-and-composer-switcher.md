# Codex compatibility and composer switcher correction

Status: implemented and focused verified

Owner: V5 B2/B4

Related UI record: [`../../../ui/logs/2026-08-27-change-composer-backend-switcher.md`](../../../ui/logs/2026-08-27-change-composer-backend-switcher.md)

## Owner feedback

Requiring the installed Codex CLI to report exactly `0.149.1` made the external prerequisite impractical and could prevent Codex sessions from opening even when the app-server operations Pho Code uses remained compatible. Backend selection also belongs in the composer rather than beside the sidebar New session action.

## Correction

The Codex adapter now treats a successful app-server `initialize` exchange as the entry compatibility boundary. It no longer parses `userAgent` or rejects a different CLI version before sending `initialized`. The adapter remains intentionally narrow, so a genuinely incompatible build fails at the concrete operation it cannot satisfy. CLI `0.149.1` remains the characterized build and historical evidence, not a required installation version. This follows the experimental protocol posture described by the [official OpenAI App Server documentation](https://developers.openai.com/codex/app-server); no exact CLI-version client contract is documented there.

The sidebar New session action remains one-click Pi and no longer has an adjacent chooser. The active composer toolbar now shows the selected backend. Choosing another advertised backend starts a separate backend-pinned session. Codex and Claude stay labeled Experimental, and their external-agent disclosure remains hidden behind the small information button until requested.

## Verification

- `bun test packages/backend-codex/test/adapter.test.ts` from `packages/pho-agent`: 4 passed, including successful initialization with a different Codex user-agent version.
- `bun run --cwd packages/ui typecheck`: passed.
- `bun run --cwd apps/desktop typecheck`: passed.
- `bun run --cwd packages/ui lint`, `bun run --cwd apps/desktop lint`, and `bun run --cwd packages/pho-agent/packages/backend-codex lint`: passed with no errors; the UI and desktop lanes retain 9 pre-existing React hook warnings in unrelated files.
- `bun run build` from `apps/desktop`: passed.
- `bunx playwright test tests/chat.spec.ts -g "chooses a backend from the composer"`: 1 passed outside the GUI-restricted sandbox after rebuilding the desktop bundle.

The first Electron attempt launched the stale existing `out/` bundle because the direct Playwright command does not build; its screenshot exposed the old sidebar chooser. After an explicit build, the next attempt reached the new UI but retained the old disclosure sentence in its assertion. The assertion was corrected to the new bounded disclosure, and the final focused run passed.

## Remaining boundary

Codex app-server remains experimental. This change removes a brittle version guess; it does not claim compatibility with every Codex release. Real provider-backed Codex and packaged external-command discovery remain unverified.
