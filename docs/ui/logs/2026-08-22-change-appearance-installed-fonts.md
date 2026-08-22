# Cursor-style installed UI and code fonts

Kind: change
Status: in source
Surface: Settings Appearance / typography
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-transcript-type-scale.md`](./2026-08-22-change-transcript-type-scale.md), [`2026-08-20-bug-appearance-reverts-on-new-session.md`](./2026-08-20-bug-appearance-reverts-on-new-session.md), [`2026-08-22-change-appearance-typography-rows.md`](./2026-08-22-change-appearance-typography-rows.md)
Related workstream: terminal Font row inherits `--font-mono` ([`../../features/terminal/product.md`](../../features/terminal/product.md))

## Intent

Let the owner pick an **installed** UI font and code font the way Cursor’s Typography panel does. Do not bundle JetBrains Mono or load a `.ttf` from disk.

## Expected / actual (before)

Expected: Settings Appearance can list OS-installed families, apply one to chrome and one to diffs/code, preview the code face, and toggle font smoothing.
Actual: Appearance only had UI/chat sizes. `--font-mono` was a fixed SF Mono/Menlo stack. Chromium `local-fonts` was denied.

## Changes and decisions

- Typed appearance fields: `uiFontFamily`, `codeFontFamily` (empty = system stack), `fontSmoothing` (default on = current grayscale anti-aliasing). Persisted on metadata schema v6 with defaults; unsafe stored names coerce to system.
- A chosen name is a single family prepended to the existing `--font-sans` / `--font-mono` stacks. CSS injection (`url(`, `;`, lists) is rejected at the command.
- Settings shows searchable installed-family pickers (`queryLocalFonts`, family names only), a live `-/+` code snippet, and a smoothing toggle. Type-in is the fallback when enumeration is empty.
- Electron allows `local-fonts` next to `clipboard-sanitized-write`. Diff/code surfaces disable ligatures so Nerd Fonts stay reviewable.
- Terminal still has no Settings control; it will read `--font-mono` when implemented.

## Verification

- **unit verified:** `bun test packages/protocol/test/appearance-fonts.test.ts packages/application/test/settings.test.ts packages/ui/test/appearance-fonts.test.ts packages/ui/test/appearance-theme.test.ts packages/ui/test/installed-fonts.test.ts apps/desktop/tests/unit/trusted-renderer.test.ts` — 56 pass. `bun run typecheck` pass. `bun run lint` 0 errors (9 pre-existing hook warnings).
- **desktop verified:** `bunx electron-vite build && bunx playwright test tests/settings.spec.ts` from `apps/desktop` — 2 pass (Lucida Grande / Menlo persist across relaunch; smoothing off persists).
- **packaged:** not verified.

## Handoff

Appearance now owns installed typography. Do not add a font-file picker, a second terminal family, or a separate code size without an explicit scope change.

## Addendum: review cleanup (2026-08-22)

Code-quality review pass on this change, behavior unchanged:

- `bootstrap.ts`: folded the `glassEnabled`/`fontSmoothing` boolean checks and the two font-family checks into field loops, matching the `updatePermissionSettings` pattern. Rejection messages now name the field (`uiFontFamily must be …`).
- `metadata.ts`: deleted the `storedFontFamily` wrapper; `parseMetadata` inlines `sanitizeFontFamilyName(…) ?? DEFAULT_*_FONT_FAMILY` so each field falls back to its own default.
- `theme.css`: single `font-variant-ligatures: none` selector list in `@layer base` now covers `.assistant-rewrite-editor` and `.change-review-diff`; scattered declarations removed.

Verification: **unit verified** — the six font/settings test files, 56 pass; `bun run typecheck` pass; `bun run lint` 0 errors (9 pre-existing warnings). **desktop verified** — `bun run --filter @pho-code/desktop build` then `playwright test tests/settings.spec.ts` (workspace Playwright 1.58.2 via node): 2 pass. **packaged:** not verified.
