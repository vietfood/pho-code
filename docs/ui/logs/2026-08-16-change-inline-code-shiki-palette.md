# Compact inline code and palette-aware Shiki

Kind: change  
Status: implemented  
Surface: transcript markdown (inline `code` + fenced Shiki); Changes diff tokens  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-16-change-codeblock-chrome.md`](./2026-08-16-change-codeblock-chrome.md), [`../../archive/v3/logs/2026-08-16-m3-hardening.md`](../../archive/v3/logs/2026-08-16-m3-hardening.md)

## Intended change

Make inline code chips compact and on-palette, and map Shiki token themes to the selected appearance palette so fenced blocks (and Change-review tokens) are not stuck on GitHub Light/Dark.

## Expected / actual (before)

Expected: `` `LRUCache.put` `` sits on the scheme background with a thin hairline and does not inflate the line; fenced highlighting matches Gruvbox/Catppuccin/Flexoki/GitHub/One Dark.

Actual: inline code used `--muted` fill, a heavier radius, and vertical padding that made a charcoal chip taller than the surrounding text. Shiki always used `github-light` / `github-dark`.

## Changes and decisions

- Inline code: `color-mix` of `--foreground` over `--background`, 12% foreground hairline, `0.25rem` radius, `0.02em 0.28em` padding, `line-height: inherit`.
- `preferredShikiTheme(prefersDark, palette)` maps Default/GitHub → github, Gruvbox → medium, Catppuccin → Latte/Mocha, Flexoki → Solarized (nearest bundled warm theme; Shiki 3.12.2 has no Flexoki), One Dark → `one-dark-pro`. Themes `loadTheme` on demand.
- Document chrome hook watches `data-palette` as well as `data-appearance`. Change-review `codeToTokens` uses the same mapping. Fenced Shiki cache keys include the theme so a palette switch does not keep the previous colors.

## Verification

- Unit verified: `bun test packages/ui/test/markdown.test.ts packages/ui/test/appearance-theme.test.ts packages/ui/test/change-review-sheet.test.ts` — 26 pass.
- `@pho-code/ui` typecheck passed.
- Desktop: not run; CSS + theme mapping only. Change-review token colors follow the same helper; no IPC change.

## Owner feedback

Inline code should be more compact and aesthetic, matching the fenced block’s on-scheme chrome. Shiki should adapt to each color scheme.

## Handoff

A real Flexoki Shiki theme would replace the Solarized stand-in. Token colors still come from bundled themes; the fenced chrome fill stays `--background`.
