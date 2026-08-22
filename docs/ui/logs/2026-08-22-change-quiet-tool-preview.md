# Quiet tool preview text; no web/fetch header chip

Kind: change
Status: in source
Surface: transcript tool and thought rows
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-21-change-concise-tool-chips.md`](./2026-08-21-change-concise-tool-chips.md), [`2026-08-22-change-web-tool-site-icons.md`](./2026-08-22-change-web-tool-site-icons.md), [`2026-08-22-change-tool-display-headings.md`](./2026-08-22-change-tool-display-headings.md)

## Intent

Owner asked to drop the header text chip on web search and fetch (site icons are enough) and to restyle remaining tool/thought previews as small quiet text, matching the secondary host line on the site list.

## Expected / actual (before)

Expected: search/fetch headers read as heading + icons; other tools show a muted preview after the heading, not a pill.
Actual: every tool kept a Beautiful UI preview chip, including the search query and fetch URL after the site icons.

## Changes and decisions

- Web search and fetch no longer render the header preview. Collapsed search still stacks result favicons; fetch still uses the site badge as the row icon. Query and URL remain in expanded detail and in the row `aria-label`.
- Other tool and thought previews keep basename/command/first-line text with CSS ellipsis, but as 11px muted foreground with no chip background, border, or monospace.
- Removed unused `.tool-chip` tokens from `theme.css`.

## Verification

- **unit verified:** `bun test packages/ui/test/tool-row.test.ts packages/ui/test/thinking-block.test.ts` — 17 pass. `@pho-code/ui` typecheck passed.
- **desktop:** not verified.
- **packaged:** not verified.

## Owner feedback

2026-08-22: on web search and fetch, remove the text chip at the end (icon is enough). For other tools, make the outside chip small quiet text like the site-list host line.

## Handoff

Living contracts: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md), [`../../architecture/renderer-and-ui.md`](../../architecture/renderer-and-ui.md), [`../../current-state.md`](../../current-state.md).
