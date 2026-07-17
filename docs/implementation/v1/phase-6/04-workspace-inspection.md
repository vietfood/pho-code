# Phase 6.4: Workspace inspection

- Status: Pending Phase 6.3
- Depends on: [Phase 6.2](02-workbench-state.md); scheduled after [Phase 6.3](03-chat-and-approvals.md)
- Architecture: [Workbench workspaces and inspection](../../../architecture/workbench-workspaces.md)
- Component research: [`gpui-component` source study](../../../research/gpui-component-source-study.md)
- Next: [Phase 6.5 user terminal](05-user-terminal.md)

## Outcome

The selected workspace has a lazy safe file tree, immutable read-only text tabs, a read-only uncommitted-diff tab, and one generation-consistent Git branch/change projection shared by the sidebar, footer, changes view, diff, and terminal badge placeholder.

## Work

1. Implement descriptor-relative lazy directory enumeration with inert symlink/special nodes, deterministic sorting, `.git` opacity, watcher-dirty generations, truncation rows, and cache/request bounds.
2. Implement immutable file snapshots using the existing workspace/read safety baseline, concurrent-change detection, virtual line numbers, bounded copy/search, syntax qualification, stale/reload state, and the read-only component wrapper/custom renderer.
3. Implement the fixed-argument `/usr/bin/git` read-only actor, porcelain-v2 parser, staged/unstaged numstat/diff projection, deadlines/cancellation/output bounds, coalesced refresh, and safe diagnostics.
4. Bind tree/changes toolbar modes, file/diff tabs, source/diff rendering, branch/count/footer/sidebar states, loading/stale/error/unavailable views, and keyboard/accessibility behavior.
5. Mark Git dirty from canonical successful tool completions and terminal-exit placeholders without treating either signal as the refreshed truth.
6. Instrument all render paths and stale-generation boundaries.

## Acceptance scenarios

- tree covers large/deep/wide roots, deterministic order, permission errors, `.git`, symlinks, devices/FIFOs/sockets, watcher bursts, root replacement, cancellation, and every cap;
- viewer covers plain/qualified languages, 16 MiB/250,000-line limits, 2 MiB/50,000-line highlighting fallback, UTF-8/BOM/CRLF, NUL/binary/invalid/oversized files, inode replacement, same-length mutation, deletion, stale/reload, cache eviction, selection/copy, and inability to edit/save;
- Git covers non-repository, branch/detached/unborn/upstream/ahead/behind, staged/unstaged/untracked/conflict/rename/submodule/binary, NUL/Unicode paths, malformed/unknown output, pager/external-diff/textconv suppression, no prompt/network/write, deadline, cancellation, truncation, and root replacement;
- every visible branch/count/change consumer uses one matching `GitSnapshot` generation and marks partial/stale honestly;
- no tree/viewer/Git call occurs in GPUI rendering or accepts an obsolete registration/workspace/request generation.

## Gate

Phase 6.4 passes when all safety/limit/failure fixtures and real macOS large-repository interaction pass, the viewer cannot mutate source through any input/accessibility path, Git never executes an arbitrary argument or repository hook, and stale data cannot enter the selected context.
