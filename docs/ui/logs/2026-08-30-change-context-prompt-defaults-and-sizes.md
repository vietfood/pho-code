# Context prompt: Pi docs off, no powershell, chip sizes

Kind: change
Status: in source
Surface: Context prompt Tools / Optional chips, uncustomized system prompt A
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md) §12
Related: [`2026-08-30-change-cursor-tools-cursor-model-only.md`](./2026-08-30-change-cursor-tools-cursor-model-only.md)

## Intent

Owner asked to turn Pi docs off by default, remove the Windows `powershell` tool from this macOS-first harness, and show compact sizes on Context prompt chips.

## Expected / actual (before)

Expected: Optional Pi docs is off unless the owner enables it; non-Windows sessions do not expose `powershell`; chips show how large each slice is.
Actual: Pi docs was checked and Pi’s native system prompt always inlined the path-rich docs block on uncustomized chats. `createAllToolDefinitions` registers `powershell` on every session; `applyToolPolicy` then activated it. The panel showed only enabled/total counts.

## Changes and decisions

- Live Optional chip defaults to off. Uncustomized compiled A strips Pi’s `Pi documentation (read only when…)` block so the model does not receive it until the owner enables the chip and Saves.
- `powershell` is omitted from Context prompt and `setActiveToolsByName` on every platform (Windows is out of product scope).
- Preamble, group headings, and chips show compact character counts (`formatTokenCount`); group size is the enabled payload.

Claude-style lazy-loaded / `defer_loading` tools are **not** in this slice. They need Anthropic tool-search (`tool_reference`) or a client-side equivalent; Pi’s loop has no that contract, and ~16 tools is below the catalog size that feature is for.

## Verification

- **unit verified:** `bun test packages/runtime/test/context-prompt.test.ts packages/runtime/test/runtime-plan-context.test.ts packages/ui/test/context-prompt-dialog.test.ts --timeout 20000` — 27 pass
- **typecheck:** `bun run typecheck` — pass (11 packages)
- **lint:** `bun run lint` — 0 errors; 8 pre-existing `react-hooks/exhaustive-deps` warnings
- **desktop:** not exercised as a Playwright journey
- **packaged:** not verified

## Owner feedback

2026-08-30: Pi docs should be off, remove powershell, sizes on chips are cool; asked whether Claude lazy-loaded tools are hard to implement correctly.

## Handoff

Living contract: conversation-ui §12. Compaction remains the history-optimization add-on; do not treat this as that workstream.
