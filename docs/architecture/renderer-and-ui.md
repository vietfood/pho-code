# Renderer and UI architecture

## Status

Current renderer implementation and accepted presentation boundary. V3 review semantics are accepted. Plan/Agent chrome (composer `+` mode, questionnaire dock, Plan rail) is accepted. Terminal is not implemented.

## Composition boundary

`apps/desktop/src/main.tsx` mounts React. `apps/desktop/src/App.tsx` owns application-shell orchestration and imports only React, `@pho-code/ui`, and `@pho-code/protocol`.

`packages/ui` owns reusable presentation and pure interaction helpers. It does not call Electron, Node, Pi, MCP, PTY, filesystem, process, or credential APIs.

```text
window.phoCode
    |
renderer bridge wrapper
    |
App.tsx state and commands
    |
packages/ui components
```

## State model

The renderer keeps four distinct classes of state:

1. **Bootstrap and settings:** selected workspace/session, model catalog, feature diagnostics, appearance, permissions, skills, GitHub status, and provider accounts.
2. **Keyed conversation cache:** authoritative snapshots by `{workspaceId, sessionId}`, selected key, drafts, and catalog projections.
3. **Live-run store:** high-frequency thinking/text/tool deltas keyed by composite session identity. The live transcript tail subscribes; settled turns and shell chrome do not rerender per token.
4. **View state:** sidebar collapse/width, right-sidebar surface, settings/dialog visibility, focus, menus, and optimistic busy states.

Runtime snapshots replace projected truth after open/reload. Incremental events route by composite identity and run ID. Switching chat selects another cache entry; it does not dispose a background controller.

## Event path

1. Preload publishes a normalized protocol event.
2. `App.tsx` identifies the owning composite session.
3. Live deltas update the keyed live-run store.
4. Authoritative catalog/session/settings/review events update bounded cache state.
5. Settled transcript snapshots replace temporary projections.
6. Sidebar activity is derived without selecting the background chat.

The renderer never parses streaming text as final state and never invents filesystem/session truth after a missed event.

## Conversation surface

The conversation is primary:

- project/session sidebar and welcome launcher;
- transcript with user/assistant turns;
- collapsed work log for thinking, tools, and pre-tool narration;
- anchored or empty-session composer;
- model/thinking/usage controls and prepared images;
- permission/host interaction docks (Allow once, Allow for this session, No with optional reason);
- static working and bounded error states.

Live text uses conservative sanitized GFM. Expensive rich rendering waits until settle:

- Shiki for code;
- KaTeX only when text appears mathematical;
- Mermaid in strict mode;
- SVG as an image data URL, never injected markup;
- credential-less gated image URLs and lightbox.

Tool input/output and assistant Markdown are untrusted. No `rehype-raw`, MDX, arbitrary HTML, or workspace file URL escapes.

## Navigation and persistence

The shell preserves:

- manual recent-project order;
- project expansion and sidebar width across collapse;
- left-sidebar collapsed overlay pill (Home, Open folder, New session, Settings), or the same actions in the chat header when the right sidebar is expanded so the conversation can fill the left pane;
- Home returning to the welcome launcher without disposing background sessions;
- per-chat drafts and live-run projections;
- session catalog state for inactive workspaces;
- right-sidebar collapsed state and width (default 520px, clamp 360–1100px or 62% of the window).

Archive is metadata over Pi sessions. Removal is a confirmed privileged operation using recoverable Trash. A busy session or blocking review state may refuse removal.

## Right sidebar

`packages/ui/src/right-sidebar.tsx` owns:

- collapsed overlay pill;
- expanded icon rail and resizable content area;
- Escape-to-collapse when no modal owns Escape;
- clicking the active Changes, Context prompt, or Plan icon collapses the panel;
- accessible surface buttons and focus behavior.

`AppShell` owns ⌘B / Ctrl+B for the left sidebar and ⌘R / Ctrl+R for the right sidebar. The Electron application menu moves window Reload to ⌘⇧R / Ctrl+Shift+R so the default Chromium Reload chord does not steal ⌘R. The transcript scroller hides native scrollbar chrome while remaining scrollable.

Current surfaces are:

- `changes` — implemented V3 review UI;
- `context-prompt` — edit while the session is empty, inspect after first message;
- `plan` — Plan document surface (accepted Plan/Agent). Terminal remains a planned peer with no `terminal` variant yet.

V3 owns tracked-change, diff, Approve, conflict, and Undo semantics. UI owns host chrome. Plan/Agent meaning and the Plan document are accepted architecture; the immutable contract lives under [`../archive/features/plan-agent/`](../archive/features/plan-agent/README.md).

## Settings and account surfaces

The floating Settings UI renders typed protocol snapshots:

- Appearance;
- Accounts/provider login;
- GitHub MCP;
- Skills and source trust;
- Archived chats;
- Permissions;
- Sandbox (accepted agent-tool sandbox add-on; default on — see [`../archive/features/sandbox`](../archive/features/sandbox/README.md)).

Settings never renders a generic schema, path picker, package manager, feature marketplace, or MCP server editor. Credential fields are transient input and stored values never return to the renderer.

## Accessibility and performance

- Use semantic buttons, navigation, dialogs, labels, and visible focus.
- Keep keyboard paths and focus restoration for dialogs/menus.
- Respect `prefers-reduced-motion`; motion stays opacity/transform based.
- Keep transcript scrolling and live-tail updates bounded.
- Avoid shell remounts during project/session changes.
- Use shared design tokens and existing resize/menu/dialog primitives.

## Testing

Pure reducers/formatters/components have package tests. Renderer/IPC changes also require the real Electron lane. User-visible UI changes should verify relevant keyboard, reduced-motion, streaming/settled, background-session, relaunch, and light/dark states.

Use [`.agents/skills/test-pho-code`](../../.agents/skills/test-pho-code/SKILL.md). Record changes, regressions, mistakes, and owner feedback under [`../ui/logs/`](../ui/logs/README.md).
