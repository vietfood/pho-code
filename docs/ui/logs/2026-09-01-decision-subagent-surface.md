# Subagent transcript and Agents surface

Kind: decision

Status: planned only; no UI implemented

Surface: conversation transcript and shared right-sidebar host

Owner: features/subagents (product); ui/conversation chrome (host rules only)

Owning plan: [`../../features/subagents/implementation-plan.md`](../../features/subagents/implementation-plan.md)

Related logs: [`2026-08-26-codex-native-tool-presentation.md`](./2026-08-26-codex-native-tool-presentation.md), [`2026-08-27-decision-right-sidebar-tiling-tabs.md`](./2026-08-27-decision-right-sidebar-tiling-tabs.md), [`2026-08-27-change-right-sidebar-floating-tiles.md`](./2026-08-27-change-right-sidebar-floating-tiles.md), [`2026-09-01-feedback-native-subagent-ownership.md`](./2026-09-01-feedback-native-subagent-ownership.md), [`../../features/subagents/logs/2026-09-01-research-and-promotion.md`](../../features/subagents/logs/2026-09-01-research-and-promotion.md)

## Intent

Make Pho-created child sessions fully inspectable without turning the primary
conversation into a multi-agent dashboard or creating one right-sidebar tile
per child.

## Decision

1. Each initial delegation appears as one compact, persistent activity card in
   the parent transcript. It shows the friendly child identity, backend/model,
   access, prompt preview, status, elapsed/reported usage, and Open/Stop actions.
2. Pho adds one **Agents** launcher and surface to the existing floating right-
   sidebar host. The host's two-visible-tile cap, parked tray, resize behavior,
   persistence, tokens, keyboard behavior, and no-shadow floating frames stay
   unchanged.
3. The Agents surface contains a bounded roster plus one selected inspector.
   Overview, Prompt & context, Transcript, and Activity share that inspector;
   children do not create separate tiles.
4. Clicking a transcript card opens/focuses Agents and selects the exact child.
   Selecting a child never replaces the parent chat in the main region.
5. Exact Pho prompt/context layers are visible. Backend-owned prompt/tool layers
   that Pho cannot inspect are labeled unknown rather than reconstructed.
6. Child attention retains child identity and reuses the accepted keyed
   interaction dock. Navigation never auto-resolves or migrates a request.
7. Pho-created child sessions and backend-native collaboration use visibly
   different labels. A generic Codex native `subagent` activity row does not
   gain Pho session controls merely because the Agents surface exists.
8. Live child state uses the transcript-tail/coalesced-update pattern. Full
   historical child transcripts are paged on demand and do not rerender every
   parent turn.

## Non-goals

- no generic fleet dashboard, metrics wall, kanban, graph, or workflow builder;
- no tile/window per child;
- no child rows in the ordinary project chat sidebar;
- no owner-started child control in this first feature;
- no new avatar/asset system, Settings page, or alternative design tokens;
- no claim that a child or right-sidebar tile is an OS/process sandbox.

## Verification status

Documentation decision only. No source or UI test changed, and no desktop or
packaged behavior is claimed. Implementation must add reciprocal feature/UI
logs and run the Electron/right-sidebar/accessibility lanes named in the owning
plan.
