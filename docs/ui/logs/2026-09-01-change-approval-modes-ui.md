# Approval modes composer and Settings UI

Date: 2026-09-01
Status: Implemented and machine-verified; owner verification pending
Surface: composer, interaction dock, Settings → Permissions, V3 review copy
Owner: [`../../features/approval-modes/`](../../features/approval-modes/README.md)
Evidence: [`../../features/approval-modes/logs/2026-09-01-m0-m3-pi-implementation.md`](../../features/approval-modes/logs/2026-09-01-m0-m3-pi-implementation.md)

## Change

The composer now renders one authoritative Ask/Auto/Full control and omits
unsupported backend modes. Ask and owner-escalated Auto use an exact-input card;
Auto activity reports reviewing, automatic allow/deny, owner-required, or
unavailable without showing reviewer prompts/reasoning. Session grants can be
revoked from the menu. Full requires a blocking first-use process warning and
keeps a high-risk indicator while active.

Settings → Permissions now owns typed default mode, Auto enablement, explicit
reviewer provider/model IDs, on-demand redacted history, Full enablement,
legacy migration, privacy/cost disclosure, and the active boundary. V3's
post-change close action reads **Mark reviewed** so it is not confused with a
future tool authorization; V3 behavior is unchanged.

## Verification and handoff

- UI component approval tests: 3 pass.
- Protocol/application/UI focused matrix: 88 pass.
- Electron Full journey: 1 pass, including relaunch persistence and warning.
- Production build: pass.

No real-model owner walkthrough, reduced-motion review, narrow-layout review,
or light/dark visual acceptance was performed. Those checks remain in the
[owner handoff](../../features/approval-modes/handoff.md).
