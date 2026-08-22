# Owner-facing tool titles at the heading; Thought in the tool slot

Kind: change
Status: in source
Surface: transcript tool and thought rows
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-22-change-quiet-tool-preview.md`](./2026-08-22-change-quiet-tool-preview.md), [`2026-08-22-change-web-tool-site-icons.md`](./2026-08-22-change-web-tool-site-icons.md), [`2026-08-22-change-lucide-default-work-icons.md`](./2026-08-22-change-lucide-default-work-icons.md)

## Intent

Collapsed rows should show the agreed titles (**List**, **Run**) even when the live block still carries the Pi id `ls` / `bash`. Settled Thought should sit in the same 16px icon well as tools, with a heavier sparkle.

## Expected / actual (before)

Expected: `ls` → List, `bash` → Run; Thought aligned with Read/Run.
Actual: the heading only capitalized the arriving name (`ls` → **Ls**). The dictionary lived in runtime, so a renderer hot-reload dropped `completed` while Electron main still sent raw ids. Thought used a thin outline star in a 20px well.

## Changes and decisions

- `displayToolName` moved to protocol with case/space-insensitive lookup. `toolWorkEntryHeading` uses it. JSONL and `TranscriptToolBlock.name` stay canonical (`ls`, `bash`) so Seatbelt overlay still matches; leftover `Run` names still stamp.
- Pho settled `thought` redrawn as a centered double-diamond sparkle in the `size-4` / `size-3.5` slot. Live Thinking keeps the filled sparkle.
- Follow-up: `ls` display title is **Browse** (not List / Browser). Other titles stay short action words.

## Verification

- **unit verified:** `bun test packages/protocol/test/tool-display.test.ts packages/runtime/test/tool-display.test.ts packages/runtime/test/transcript-tool-display.test.ts packages/runtime/test/sandboxed-bash.test.ts packages/ui/test/tool-row.test.ts packages/ui/test/thinking-block.test.ts packages/ui/test/work-entry-icon.test.ts` — 27 pass. `@pho-code/protocol`, `@pho-code/runtime`, and `@pho-code/ui` typecheck passed.
- **desktop:** not verified in this slice (needs an Electron rebuild so the renderer has the heading map).
- **packaged:** not verified.

## Owner feedback

2026-08-22: screenshot still showed **Ls** / **Bash**; Thought mark felt off. Honor the agreed dictionary first. Follow-up: only `ls` gets a warmer word — **Browse**.

## Handoff

Living contracts: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md), [`../../architecture/renderer-and-ui.md`](../../architecture/renderer-and-ui.md), [`../../current-state.md`](../../current-state.md).
