# Compact settings disclosure controls

Date: 2026-08-26
Kind: change and correction
Status: in source; focused verification complete
Surface: Settings Skills and Sandbox
Owner: conversation UI track
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related V5 slice: [`../../version/v5/logs/2026-08-26-backend-neutral-direction.md`](../../version/v5/logs/2026-08-26-backend-neutral-direction.md)
Corrects: [`2026-08-22-bug-model-and-sandbox-copy-regressions.md`](./2026-08-22-bug-model-and-sandbox-copy-regressions.md)

## Owner feedback

Trust and sandbox limits should remain available, but long disclosure paragraphs should not occupy the normal Settings layout. Use a small information control to reveal them.

## Change

- Restored the nonempty Skills trust notice and Sandbox coverage disclosure.
- Added one shared native `details`/`summary` information control with an accessible label and compact Info icon.
- Placed disclosure text in a small overlay panel that is collapsed by default.
- Reused the control in both Settings surfaces without adding state, a dialog, or a dependency.

This corrects the earlier decision to remove the Sandbox disclosure. Renderer sandboxing, permission policy, and Seatbelt have different coverage, so the explanation remains available without dominating the interface.

## Verification

- Focused Skills UI, Sandbox UI, protocol, and runtime-copy tests — 18 passed, 0 failed.
- `@pho-code/ui` typecheck — passed.
- `@pho-code/protocol` typecheck — passed.
- Focused Electron Sandbox behavior — build passed and 2 Playwright scenarios passed, including opening the disclosure control and reading its coverage text.
