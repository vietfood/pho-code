# Sandbox bash shield and compact work rows

Kind: change
Status: in source
Surface: transcript tool and thought rows (live and settled); change-review always-on copy
Owner: conversation UI track (chrome); archive/features/sandbox (policy meaning)
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-17-change-sandbox-honesty.md`](./2026-08-17-change-sandbox-honesty.md), [`2026-08-16-change-sandbox-settings.md`](./2026-08-16-change-sandbox-settings.md), [`2026-08-20-fix-change-review-safety-copy.md`](./2026-08-20-fix-change-review-safety-copy.md), [`2026-08-21-change-concise-tool-chips.md`](./2026-08-21-change-concise-tool-chips.md), [`../../archive/features/sandbox/product.md`](../../archive/features/sandbox/product.md)

## Intent

Show a small Codex-style shield when agent `bash` actually ran through a healthy Seatbelt wrap. Collapsed thought and tool rows are heading-only; click expands the detail. Do not restore always-on verbose change-review paragraphs the owner deleted.

## Expected / actual (before)

Expected: sandboxed bash is visibly distinct; every collapsed work row stays compact.
Actual: bash, read, write, edit, and thought rows dumped paths, commands, or thought previews on the collapsed line. An agent also restored verbose Approve/Undo chrome the owner had cleared.

## Changes and decisions

- Optional protocol `sandboxed` on tool activity. Stamped only for `bash` / `user_bash` while sandbox status is `healthy`.
- Persist matching call ids as Pi custom session entries (`pho-code.sandboxed-bash`) so settle/reopen keep the shield after sandbox is turned off.
- Shield tooltip/aria: “Ran in the agent sandbox”. Not shown on non-bash tools or unsandboxed bash.
- Collapsed thought/tool rows omit preview chips and thought snippets. Expanded detail still has Command/Input/Output and thought markdown. Session `todo` lists stay under the todo row.
- `CHANGE_REVIEW_COPY.alreadyApplied`, `notAllChanges`, and `undoMetadata` stay empty. Capture-cap and unreadable-ledger diagnostics remain.

## Verification

- **unit verified:** `bun test packages/ui/test/tool-row.test.ts packages/ui/test/thinking-block.test.ts packages/ui/test/change-review-sheet.test.ts packages/protocol/test/change-review.test.ts packages/ui/test/work-log.test.ts` — 36 pass. Collapsed bash/read/write/edit have no chips; collapsed thought has no snippet; always-on change-review paragraphs stay empty; capture/ledger diagnostics remain.
- **integration verified:** earlier `sandbox-settings-runtime` pass still covers `sandboxed: true` on wrapped bash. Not re-run in this follow-up.
- **desktop verified:** earlier `tests/sandbox.spec.ts` 2/2 still covers the bash shield. All-tool chip removal is unit verified only in this follow-up.
- **packaged:** not verified.
- **typecheck:** `@pho-code/ui` and `@pho-code/protocol` passed.

## Mistakes / corrections

Restored the verbose change-review strings after the owner had emptied them. Put the always-on paragraphs back to empty. Left fail-closed capture/ledger diagnostics.

## Owner feedback

2026-08-20: add a small shield when the agent runs something in the sandbox, bash only, same idea as Codex. Then hide the collapsed bash command chip. Then do the same for read, thought, write, edit, and every tool; do not restore deleted verbose copy.

## Handoff

Living contracts: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md), [`../../architecture/renderer-and-ui.md`](../../architecture/renderer-and-ui.md), [`../../architecture/protocol-and-ipc.md`](../../architecture/protocol-and-ipc.md), [`../../current-state.md`](../../current-state.md). Policy remains [`../../archive/features/sandbox/product.md`](../../archive/features/sandbox/product.md).
