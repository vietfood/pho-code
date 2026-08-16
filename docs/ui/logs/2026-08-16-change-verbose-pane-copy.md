# Remove verbose pane descriptions

Kind: change  
Status: implemented  
Surface: Context prompt, Appearance, Archived, welcome launcher, empty-session hero  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-16-bug-context-prompt-injection.md`](./2026-08-16-bug-context-prompt-injection.md)

## Intended change

Drop instructional helper paragraphs under pane titles. Titles, controls, status badges, empty states, and required trust/data-scope disclosures stay.

## Expected / actual (before)

Expected: a Context prompt panel that is just heading, Default/Custom badge, preamble, and section checkboxes.

Actual: the panel opened with a two-sentence explanation of the default system prompt, when to edit, and that the compiled string is what the session sends. Frozen sessions had a second explanation that the prompt cannot change after the first message.

## Changes and decisions

- Context prompt keeps the heading and Default/Custom badge; Save/Reset remaining or disappearing is the edit vs inspect signal.
- Same treatment for Appearance (frosted-glass and font-size blurbs), Archived (how restore/Trash works), the welcome subtitle, and the empty-session footer hint.
- Kept permission-profile copy, GitHub/skills/change-ledger disclosures, and the Accounts storage notice. Those are policy or data-scope honesty, not how-to text.

## Verification

- Unit verified: `bun test packages/ui/test/context-prompt-dialog.test.ts packages/ui/test/conversation.test.ts packages/ui/test/archived-chats.test.ts packages/ui/test/appearance-fonts.test.ts packages/ui/test/settings-section.test.ts` — 28 pass.
- Typecheck verified: `bun run typecheck` — protocol, ui, runtime, application, desktop all exited 0.
- Desktop: not run; chrome-only copy, no IPC or renderer contract change.

## Owner feedback

Remove verbose descriptions; the Context prompt pane was the example.

## Mistakes and corrections

None yet.

## Handoff

Inspect-only after the first message is still Save/Reset hidden plus a read-only preamble. No replacement “frozen” sentence.
