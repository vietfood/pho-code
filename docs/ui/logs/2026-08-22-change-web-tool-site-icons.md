# Colorful web search and fetch site icons

Kind: change
Status: in source
Surface: transcript tool rows for `web search` and `fetch`
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-21-change-concise-tool-chips.md`](./2026-08-21-change-concise-tool-chips.md), [`2026-08-22-bug-image-model-warning-stale.md`](./2026-08-22-bug-image-model-warning-stale.md), [`2026-08-22-change-tool-display-headings.md`](./2026-08-22-change-tool-display-headings.md)

## Intent

Owner asked to make search/fetch less grayscale: search results should look like a compact colorful site list, and fetch should use a web/site icon. Expanded search should lead with a magnifying-glass query row.

## Expected / actual (before)

Expected: search hits are recognizable sites; fetch shows a web identity for the URL.
Actual: both tools dumped QUERY/URL/OUTPUT into gray monospace panels; fetch used the generic globe/work-entry chrome only.

## Changes and decisions

- Parse harness-owned search output into title/url/host rows. Expanded search shows a muted query row (`Search` icon + query), then up to three site rows (favicon with a hashed-color globe fallback) and `+N more`.
- Collapsed search keeps the query chip and a small stack of result site icons.
- Fetch’s leading row icon is the same colorful site badge (favicon or globe) for that URL; expanded fetch shows the site row plus page output, not a gray URL box.
- Site favicons load Google’s public `s2/favicons` image for the hostname (`img-src` already allows `https:`). A failed load keeps the hashed-color globe. Credentialed or non-http(s) URLs are dropped.

## Verification

- **unit verified:** `bun test packages/ui/test/web-source.test.ts packages/ui/test/tool-row.test.ts` — 19 pass. `@pho-code/ui` typecheck passed.
- **desktop:** not verified.
- **packaged:** not verified.

## Owner feedback

2026-08-22: make search/fetch more colorful, matching a compact site-list reference; fetch should have a web icon. Follow-up: search is good; add the magnifying-glass query row on top; change the fetch heading icon to the web/site badge.

## Handoff

Living contracts: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md), [`../../architecture/renderer-and-ui.md`](../../architecture/renderer-and-ui.md), [`../../current-state.md`](../../current-state.md).
