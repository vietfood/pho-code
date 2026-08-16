# Fenced codeblock chrome

Kind: change  
Status: implemented  
Surface: transcript markdown / fenced code  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: none originally; later [`2026-08-16-change-inline-code-shiki-palette.md`](./2026-08-16-change-inline-code-shiki-palette.md) for inline chips and palette-aware Shiki.

## Intended change

Rewrite fenced-code chrome so the block matches the active palette background and reads as a clean inset, with a clearer hairline instead of a tinted card.

## Expected / actual (before)

Expected: a code block that sits on the scheme background, outlined by a visible 1px border, with metadata and copy as light chrome rather than a boxed toolbar.

Actual: the wrapper used `bg-secondary` / `dark:bg-input/32`, hid the border in dark mode (`dark:border-transparent`), and drew a header divider plus a labeled outline Copy button.

## Changes and decisions

- Fill is `var(--background)` so the block matches the selected palette, not a secondary/input tint.
- Hairline is `color-mix(in srgb, var(--foreground) 16%, transparent)` so dark palettes with a 5% `--border` still show a clear edge.
- Header keeps a matching hairline divider under the language/copy row; language stays muted metadata; copy is an icon-only ghost control.
- Padding, type size, and line-height are compact (header ~1.75rem, code `0.35rem 0.65rem`, `0.8em` / `1.2`).
- Shiki `pre` backgrounds stay transparent so GitHub theme canvases do not fight the palette fill.

## Verification

- Unit verified: `bun test packages/ui/test/markdown.test.ts` — 11 pass (sanitization, fenced-code chrome, icon-only copy).
- `@pho-code/ui` typecheck passed. Root `bun run typecheck` still fails in unrelated v3 ledger listing types (`change-capture.ts` / `change-ledger-store.ts`); not caused by this chrome change.
- Desktop: not run; chrome-only CSS/markup, no IPC or renderer contract change.

## Owner feedback

Use the scheme background and a clearer outer line. Keep the header divider (first pass removed it). Prefer a more compact block than the spacious citation padding. Code lines should also be tighter (less vertical space between lines).

## Mistakes and corrections

First pass dropped the header `border-bottom` to match a no-rule citation screenshot. Owner asked it back and asked for tighter padding. Restored the divider with the same foreground mix as the outer hairline, then reduced header/code padding and type size. A later pass dropped code line-height from `1.4` to `1.2` and vertical pre padding from `0.5rem` to `0.35rem`. That same pass set Shiki `.line { display: block }`, which doubled vertical space because `codeToHtml` already emits a newline between line spans inside `<pre>`. Removed that rule after the owner saw the block as larger.

## Handoff

Further language-file icons or filename/line-range metadata would need fence info the markdown renderer does not currently receive.
