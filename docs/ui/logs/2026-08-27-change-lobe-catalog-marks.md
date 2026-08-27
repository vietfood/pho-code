# Composer: map remaining Lobe catalog marks

Kind: change
Status: in source
Surface: model picker, backend picker, provider accounts
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-27-change-lobe-brand-icons.md`](./2026-08-27-change-lobe-brand-icons.md), [`2026-08-27-change-lobe-theme-marks.md`](./2026-08-27-change-lobe-theme-marks.md), [`2026-08-27-change-work-entry-icon-packs.md`](./2026-08-27-change-work-entry-icon-packs.md)

## Intent

Owner asked to search Lobe more thoroughly so gateways such as Baseten and Cloudflare get their own marks instead of a letter fallback.

## Expected / actual (before)

Expected: Pi provider ids that Lobe publishes (Baseten, Cloudflare, Groq, Together, Fireworks, Cerebras, Vercel, Xiaomi, Z.ai, …) resolve to those glyphs.
Actual: the mapping only listed a small hand-picked set; `baseten` and `cloudflare-ai-gateway` fell through to a letter circle.

## Changes and decisions

- Import Lobe mono SVGs for the rest of Pi `0.84.1` providers that Lobe ships, plus common gateways (Groq, Together, Fireworks, Cerebras, SiliconCloud, Novita, …).
- Explicit aliases for ids that would otherwise collide (`openai-codex` stays Codex, `cloudflare-workers-ai` uses Workers AI, `google-vertex` uses Vertex).
- Hyphenated regional/plan suffixes (`qwen-token-plan-cn`, `kimi-coding`, `xiaomi-token-plan-ams`) fall back to the longest matching prefix or alias.
- Marks stay mono `currentColor` masks from [`2026-08-27-change-lobe-theme-marks.md`](./2026-08-27-change-lobe-theme-marks.md). OpenRouter catalog rows still use the OpenRouter mark.

## Verification

- **unit verified:** `bun test packages/ui/test/provider-icon.test.ts packages/ui/test/backend-icon.test.ts packages/ui/test/backend-picker.test.ts packages/ui/test/conversation.test.ts packages/ui/test/work-entry-icon.test.ts packages/ui/test/skills-settings.test.ts packages/ui/test/appearance-theme.test.ts packages/application/test/settings.test.ts` — 66 pass.
- **typecheck:** `bun run --filter @pho-code/ui typecheck` and `bun run --filter @pho-code/protocol typecheck` — 0 errors.
- **desktop:** not exercised as a Playwright journey.
- **packaged:** not verified.

## Owner feedback

2026-08-27: Baseten, Cloudflare, etc. have Lobe icons too; search better.

## Handoff

Living contract: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md). Work-entry packs: [`2026-08-27-change-work-entry-icon-packs.md`](./2026-08-27-change-work-entry-icon-packs.md).
