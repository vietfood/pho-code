# Sidebar Stop-all row

Status: accepted and archived with agent-stop 2026-08-20

Surface: project sidebar action block

Owner: archived [`agent-stop`](../../archive/urgent/agent-stop/README.md)

Owning plan: [`agent-stop implementation plan`](../../archive/urgent/agent-stop/implementation-plan.md)

Related logs: [`Milestone 2`](../../archive/urgent/agent-stop/logs/2026-08-19-m2-stop-all-and-teardown.md), [`closure`](../../archive/urgent/agent-stop/logs/2026-08-20-m2-acceptance-and-closure.md)

## Change

A conditional `Stop all` row appears under Open folder in the expanded sidebar while at least one run is live anywhere (phase `working` or `attention`). It shows the live count when more than one (`Stop all (2)`), uses the same filled-square glyph as composer Stop in destructive color, and is never disabled by the global `busy` flag. Clicking it loops the existing `abortRun` command over every live activity row; no new protocol command was added.

## Why

Milestone 1 made Stop bounded for the selected chat, but a background chat stuck on a permission or ask-user card still required switching to it first. Stop-all is the owner-facing way to cancel every live run, including background ones.

## Verification

Desktop evidence in the owning milestone log: `tests/abort.spec.ts` `Stop all cancels a background run and close stays bounded` (25 passed in the full lane, 2026-08-19).

## Handoff

Accepted as shipped. Collapsed-pill chrome intentionally has no Stop-all. If the owner later wants Stop-all in the collapsed pill or a keyboard chord, record it as new feedback under `docs/ui/`.
