# GitHub chip consumes clone `.git` suffixes

Kind: change
Status: implemented
Surface: composer and user-message GitHub `owner/repo` chips
Owner: ui/conversation chrome
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-27-change-skill-chip-contrast.md`](./2026-08-27-change-skill-chip-contrast.md)

## Intended change

Owner screenshot (2026-08-31): a user bubble reading “Push commit e328b9c to [GitHub chip] vietfood/pho-code.git, branch dev”. The chip should parse a GitHub clone URL that ends in `.git` as one chip, not leave `.git` as leftover text after `owner/repo`.

## Expected / actual (before)

Expected: `https://github.com/vietfood/pho-code.git` becomes one chip labeled `vietfood/pho-code`.

Actual: the URL regex treated `.` as trailing punctuation, so the chip stopped at `pho-code` and `.git` stayed in the surrounding text.

## Changes and decisions

- `packages/ui/src/lib/github-link.ts`: repo names start and end on an alnum (so a sentence period stays punctuation) and may contain internal dots (`next.js`). An optional clone `.git` suffix is consumed into the stored URL and omitted from the captured repo used as the chip label.
- Composer segments, the contenteditable chip, and the user-message transcript share that parser; no new chip chrome.

## Verification

- **unit verified:** `bun test packages/ui/test/github-link.test.ts packages/ui/test/composer-tokens.test.ts packages/ui/test/conversation.test.ts packages/ui/test/github-chip.test.ts --timeout 20000` — 34 pass, 0 fail.
- Desktop: not run — parser-only, no IPC or Electron surface change. Closest substitute is the conversation unit render of the owner’s clone-URL sentence.
- Packaged: not verified.

## Mistakes and corrections

None yet.

## Owner feedback

“The github chip should parse `.git` too.”

## Handoff

SSH `git@github.com:owner/repo.git` and scheme-less `github.com/owner/repo` remain unparsed; only `http(s)://github.com/owner/repo` (optional `.git`, optional trailing slash) becomes a chip.
