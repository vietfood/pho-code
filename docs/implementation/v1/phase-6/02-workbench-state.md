# Phase 6.2: Workbench state and navigation

- Status: Pending Phase 6.1
- Depends on: [Phase 6.1](01-native-foundation.md)
- Architecture: [GPUI workbench](../../../architecture/gpui-workbench.md), [workspace navigation](../../../architecture/workbench-workspaces.md), and [native lifecycle](../../../architecture/native-workbench-lifecycle.md)
- Next: [Phase 6.3 chat](03-chat-and-approvals.md)

## Outcome

The fixed four-pane shell projects a bounded workspace registry, rebuildable recent-session catalog, presentation-only chat/file tabs, and one atomic selected context. Selecting a project swaps the chat, inspection, and tree projections without retargeting active agent work or accepting stale service results.

## Work

1. Add GPUI-neutral workbench identities, state, intents, events, generations, and reducer tests. Keep `WorkspaceRegistrationId` distinct from durable `WorkspaceId`.
2. Implement the bounded registry over canonical retained workspace openings and preference persistence. Registration removal affects navigation only.
3. Extend the non-mutating session catalog projection with first-user-message titles, latest valid record time, profile/compatibility state, and workspace classification. Keep the journal authoritative and retain the 1,024-session cap.
4. Implement the 16-tab chat presentation model and 32-tab file/diff presentation model. Close/reorder/open never deletes or rewrites canonical data.
5. Implement atomic workspace/session selection, failure rollback, explicit active-turn cancel-and-switch, and generation rejection across session and placeholder pane services.
6. Bind the fixed layout, pane/collapse/focus routing, sidebar workspace/chat rows, tab strips, header/footer placeholders, and accessibility state to the reducer.
7. Add instrumentation proving GPUI gestures dispatch typed intents and no view opens a workspace or journal.

## Acceptance scenarios

- duplicate canonical registrations are rejected while same display names are disambiguated;
- missing/replaced/renamed roots become missing or stale and cannot inherit old authority;
- old sessions remain compatible even though registration identity is new;
- damaged, incompatible, read-only, empty, and missing-workspace sessions sort/title/project correctly;
- only the selected tab can send; closing a tab leaves its journal byte-identical;
- successful selection commits all pane identities together, while any open/load failure leaves the old context selected;
- an active turn, approval, or tool blocks switching until explicit cancellation reaches an authoritative terminal event;
- stale workspace/session/pane generations cannot change selection;
- terminal placeholders remain grouped to their original workspaces rather than being retargeted.

## Gate

Phase 6.2 passes when pure reducer fixtures and the native harness prove atomic selection, stable identities, bounded registry/catalog/tabs, no journal deletion, active-turn isolation, full stale-result rejection, and keyboard/accessibility behavior at layout limits. No chat rich rendering, file I/O, Git child, or PTY is needed to pass this package.
