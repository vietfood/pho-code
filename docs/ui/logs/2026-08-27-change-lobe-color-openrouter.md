# Composer: color Lobe marks; OpenRouter stays OpenRouter

Kind: change
Status: in source
Surface: model picker, backend picker, provider accounts
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-27-change-lobe-brand-icons.md`](./2026-08-27-change-lobe-brand-icons.md), [`2026-08-27-change-brand-icon-style.md`](./2026-08-27-change-brand-icon-style.md)

## Intent

Owner asked for colorful Lobe marks instead of the mono set, and for every OpenRouter catalog model to use the OpenRouter icon.

## Expected / actual (before)

Expected: brand-colored logos; OpenRouter/Jamba and OpenRouter/Claude both show OpenRouter.
Actual: CSS-mask mono SVGs followed `currentColor`; OpenRouter rows resolved to the underlying model brand (Jamba, Claude, GPT).

## Changes and decisions

- Prefer Lobe `-color.svg` (or `-brand-color.svg`) and render those as images so fills stay brand-colored.
- Brands that only ship a black/white SVG (OpenAI, Anthropic, Cursor, Pi, GitHub, Ollama, Grok, xAI, Moonshot) stay mono `currentColor` masks.
- `resolveModelIconId` returns `openrouter` whenever the provider is OpenRouter, before model-brand patterns.

## Verification

- **unit verified:** `bun test packages/ui/test/provider-icon.test.ts packages/ui/test/backend-icon.test.ts packages/ui/test/backend-picker.test.ts packages/ui/test/conversation.test.ts packages/ui/test/work-entry-icon.test.ts packages/ui/test/skills-settings.test.ts` — 36 pass.
- **typecheck:** `bun run --filter @pho-code/ui typecheck` — 0 errors.
- **desktop:** not exercised as a Playwright journey.
- **packaged:** not verified.

## Owner feedback

2026-08-27: all OpenRouter models should use the OpenRouter icon; use colorful icons, not the minimal set.
2026-08-27: some icons are hard to see; make them color-agnostic. Follow-up: [`2026-08-27-change-lobe-theme-marks.md`](./2026-08-27-change-lobe-theme-marks.md).

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md). First Lobe wiring: [`2026-08-27-change-lobe-brand-icons.md`](./2026-08-27-change-lobe-brand-icons.md). Theme-following marks: [`2026-08-27-change-lobe-theme-marks.md`](./2026-08-27-change-lobe-theme-marks.md).
