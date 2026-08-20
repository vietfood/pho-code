# Concise collapsed tool and thought chips

Kind: change
Status: in source
Surface: transcript tool and thought rows (live and settled)
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-20-change-sandbox-bash-shield.md`](./2026-08-20-change-sandbox-bash-shield.md)

## Intent

Restore collapsed preview chips after the heading-only pass, but keep them short: basename, command, first-line thought, with CSS `...` overflow instead of slicing the string. Do not restore the old 120-character dumps or emptied change-review paragraphs.

## Expected / actual (before)

Expected: collapsed rows still identify the file, command, or thought at a glance without filling the line.
Actual: heading-only rows hid that context; the earlier chips dumped full relative paths and shell pipelines.

## Changes and decisions

- Collapsed tool rows show a content-sized chip capped at 14rem with `text-overflow: ellipsis`. Paths use the basename; hover title keeps the full path or command. Fetch URLs use the last path segment. Todo chips are `completed/total` only; the list stays under the row.
- Collapsed thought rows show the same chip chrome with the first line, markdown markers stripped. Expanded thought hides the chip because the body has the text.
- Seatbelt bash shield stays between heading and chip. Always-on change-review copy stays empty.

## Verification

- **unit verified:** `bun test packages/ui/test/tool-row.test.ts packages/ui/test/thinking-block.test.ts` — 13 pass. Chip text keeps the full compact command/thought; overflow is CSS ellipsis.
- **desktop:** not re-run for this overflow follow-up. `apps/desktop/tests/sandbox.spec.ts` still expects a short `pwd` chip on sandboxed bash.
- **packaged:** not verified.
- **typecheck:** `@pho-code/ui` passed.

## Owner feedback

2026-08-21: restore the chip, but make it cleaner and more concise than the previous dump. Overflow with rendered `...`, do not slice the label.

## Handoff

Living contracts: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md), [`../../architecture/renderer-and-ui.md`](../../architecture/renderer-and-ui.md), [`../../current-state.md`](../../current-state.md).
