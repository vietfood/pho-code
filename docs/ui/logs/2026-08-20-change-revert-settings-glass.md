# Revert Settings frost

Kind: change  
Status: implemented  
Surface: Settings dialog  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: [`2026-08-20-change-glass-settings-composer-center.md`](./2026-08-20-change-glass-settings-composer-center.md), [`2026-08-19-change-glass-composer-right-bar.md`](./2026-08-19-change-glass-composer-right-bar.md)

## Intended change

Keep Settings a solid overlay. Hero composer centering from the previous slice stays.

## Expected / actual (before)

Expected: Settings reads as a solid dialog over the frosted shell.

Actual: the previous slice tinted the Settings card and lightened its dimmer.

## Changes and decisions

- Removed `.settings-dialog` / `.settings-backdrop` glass fills. Settings is `bg-background` over `bg-black/50` again.
- Composer overlay insets and `margin-inline: auto` on `.empty-session-column` are unchanged.

## Verification

- Unit verified: `bun test packages/ui/test/appearance-theme.test.ts packages/ui/test/conversation.test.ts` — 24 pass.
- Desktop: not run; chrome-only revert.

## Owner feedback

Do not frost the Settings pane.

## Mistakes and corrections

Frosting Settings was extra. The earlier layered-glass decision to keep Settings opaque was the right call.

## Handoff

Menus, pills, and Settings stay opaque. Composer, chat pane, and both sidebars keep the tinted glass treatment.
