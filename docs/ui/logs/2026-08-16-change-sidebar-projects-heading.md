# Sidebar Projects heading

Kind: change  
Status: implemented  
Surface: shell sidebar / project list  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: later [`2026-08-16-change-sidebar-footer-pill.md`](./2026-08-16-change-sidebar-footer-pill.md) for icon-only Settings/About and the collapsed left pill.

## Intended change

Make the visible **Projects** label read as a section heading for the folder list: larger type, left-aligned with the folder glyphs rather than the folder names.

## Expected / actual (before)

Expected: a section label that sits on the same left edge as Garden / piui / pho-demo folder icons and is large enough to scan as a heading.

Actual: `text-[11px]` muted caption with `pl-8`, which lined the word up with the folder *names* and left a gap in the icon column.

## Changes and decisions

- Heading is a semantic `h2` at `text-sm` / `h-8`, matching project-row type size and row height.
- Horizontal padding is `px-2`, the same inset as each project row, so the label starts on the folder-glyph column.
- Color stays `text-sidebar-muted-foreground` so it remains a section label, not another project name.

## Verification

- Unit verified: `bun test packages/ui/test/app-sidebar.test.ts` — 2 pass (folder glyphs plus Projects heading size/alignment).
- Desktop: not run; chrome-only markup, no IPC or renderer contract change.

## Owner feedback

The Projects indicator was too small and should align with the project folders below it.

## Mistakes and corrections

None yet.

## Handoff

None. This is chrome only; product session/project behavior is unchanged.
