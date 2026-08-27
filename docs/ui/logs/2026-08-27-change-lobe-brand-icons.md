# Composer and settings: Lobe brand icons

Kind: change
Status: in source
Surface: model picker, backend picker, provider accounts, skill sources, GitHub work-entry mark
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-16-bug-model-picker-gap.md`](./2026-08-16-bug-model-picker-gap.md), [`2026-08-21-change-composer-claude-code-layout.md`](./2026-08-21-change-composer-claude-code-layout.md)

## Intent

Owner asked to use [Lobe Icons](https://github.com/lobehub/lobe-icons) for provider, backend, and model-type marks and to drop the inlined custom SVGs.

## Expected / actual (before)

Expected: one maintained AI-brand icon set for Pi/Codex/Claude backends, Pi provider ids, and per-model brands (for example Jamba on OpenRouter).
Actual: `ProviderIcon` inlined Simple Icons path data plus owner-supplied Codex PNGs; `BackendIcon` inlined the Pi website mark and reused those provider paths.

## Changes and decisions

- Pin `@lobehub/icons-static-svg` `1.94.0` on `@pho-code/ui`. The React `@lobehub/icons` package peers onto `antd` and `@lobehub/ui`; those stay out of the renderer.
- Mono SVGs paint through `currentColor` via CSS mask so they follow muted/Claude chip color.
- Provider aliases map Pi ids (`openai-codex`, `google-gemini`, `amazon-bedrock`, …) onto Lobe keys. Model rows resolve a model-type mark from the id (Claude, Jamba, GPT, …) and fall back to the provider.
- Letter-circle fallback remains for unknown providers.
- Removed the inlined Simple Icons paths, the Pi website SVG copy, and the Codex light/dark PNGs.
- Skill sources Codex/Claude now use the Codex and Claude marks rather than the OpenAI blossom / Anthropic A.

## Verification

- **unit verified:** `bun test packages/ui/test/provider-icon.test.ts packages/ui/test/backend-icon.test.ts packages/ui/test/backend-picker.test.ts packages/ui/test/conversation.test.ts packages/ui/test/skills-settings.test.ts packages/ui/test/work-entry-icon.test.ts packages/ui/test/cursor-model-warning-dialog.test.ts` — pending this log’s run.
- **typecheck / lint:** pending.
- **desktop:** not exercised as a Playwright journey.
- **packaged:** not verified.

## Owner feedback

2026-08-27: use https://github.com/lobehub/lobe-icons for model provider, backend, and model-type icons; remove custom SVG.
2026-08-27: colorful icons, not the minimal set; every OpenRouter model should use the OpenRouter icon. Follow-up: [`2026-08-27-change-lobe-color-openrouter.md`](./2026-08-27-change-lobe-color-openrouter.md).
2026-08-27: some icons are hard to see; make them color-agnostic. Follow-up: [`2026-08-27-change-lobe-theme-marks.md`](./2026-08-27-change-lobe-theme-marks.md).
2026-08-27: Baseten, Cloudflare, etc. have Lobe icons too; search better. Follow-up: [`2026-08-27-change-lobe-catalog-marks.md`](./2026-08-27-change-lobe-catalog-marks.md).

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md). Attribution: [`../../references-and-attribution.md`](../../references-and-attribution.md).
