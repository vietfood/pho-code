# Renderer and UI architecture

## Status

Current renderer implementation and accepted presentation boundary. V3 review semantics are accepted. Plan/Agent chrome (composer mode icon + menu, questionnaire dock, Plan rail) is accepted. Terminal is not implemented.

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
2. **Keyed conversation cache:** authoritative snapshots by normalized `{backendId, workspaceId, sessionId}`, selected key, drafts, and catalog projections. Missing backend identity means Pi for pre-V5 compatibility.
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

The renderer never parses streaming text as final state and never invents filesystem/session truth after a missed event. It shows live assistant text directly while it streams; before substantive text, a running session with no work entries shows the Working state.

Window-first lifecycle does not use this sequenced event path. `App.tsx` first loads metadata bootstrap/settings, renders welcome/recents with a starting or bounded failed status, and defers provider accounts/catalogs while Pi is unavailable. A separate runtime-status wakeup triggers another authoritative bootstrap query. Pi-backed launcher/sidebar controls remain disabled until ready; Settings Appearance and About remain available.

## Conversation surface

The conversation is primary:

- project/session sidebar and welcome launcher;
- one-click Pi session creation plus a compact composer backend chooser for advertised alternatives; changing the selection starts a distinct backend-pinned session, external backends are explicitly Experimental, and the disclosure stays behind a small info control;
- session titles as a short summary (Pi session name or a humanized first-prompt fallback; expanded skill bodies never become the title);
- transcript with user/assistant turns;
- collapsed work log for thinking, tools, and pre-tool narration;
- anchored or empty-session composer;
- backend-advertised model/thinking controls, a separate Fast toggle when supported, usage controls, and prepared images;
- permission/host interaction docks (Allow once, Allow for this session, No with optional reason);
- live Working/Thinking shimmer labels and bounded error states.

Live text uses conservative sanitized GFM. Expensive rich rendering waits until settle:

- Shiki for code;
- KaTeX only when text appears mathematical;
- Mermaid in strict mode;
- SVG as an image data URL, never injected markup;
- credential-less gated image URLs and lightbox.

Tool input/output and assistant Markdown are untrusted. No `rehype-raw`, MDX, arbitrary HTML, or workspace file URL escapes. Collapsed tool headings use owner-facing titles (`ls` → Browse, `bash` → Run); the protocol block keeps the Pi id. Work-entry glyphs default to Lucide; Settings Appearance can switch to Pho, CodeX (`codex-team`), or colorful Meteocons (cropped to the same 14px slot). Provider/backend/model marks default to mono Lobe Icons and can switch to Color on a light contrast plate. Thought uses the same 16px icon slot as tools. Collapsed tool and thought rows show small quiet preview text (file basename, command, first-line thought; CSS ellipsis) plus a shield on Seatbelt-wrapped bash. Web search and fetch omit that preview; site icons identify the work. Web search expanded detail is a query row and a compact site list (favicon or hashed-color globe); fetch uses the same web icon on the row and URL. Full paths, commands, and thought text stay in the expanded detail. The shield is not a claim that Pho, Pi, MCP, or the owner terminal are sandboxed.

## Navigation and persistence

The shell preserves:

- manual recent-project order;
- project expansion and sidebar width across collapse;
- left-sidebar collapsed overlay pill (Home, Open folder, New session, Settings), or the same actions in the chat header when the right sidebar is expanded so the conversation can fill the left pane;
- Home returning to the welcome launcher without disposing background sessions;
- per-chat drafts and live-run projections;
- session catalog state for inactive workspaces;
- the selected backend as part of every session key; changing backend creates or selects another session rather than reinterpreting a transcript;
- right-sidebar collapsed state and width (default 520px, clamp 360–1100px or 62% of the window).

Archive is metadata over Pi sessions. Removal is a confirmed privileged operation using recoverable Trash. A busy session or blocking review state may refuse removal.

## Right sidebar

`packages/ui/src/right-sidebar.tsx` owns:

- chat-header surface launcher icons;
- a resizable tiling region that exists only while at least one tile is open;
- floating rounded tiles with i3-style gaps, a two-tile cap, and a minimized tray;
- Escape and ⌘R / Ctrl+R to hide the region (tiles stay mounted);
- accessible surface buttons and focus behavior.

`AppShell` owns ⌘B / Ctrl+B for the left sidebar and ⌘R / Ctrl+R for the right sidebar. The Electron application menu moves window Reload to ⌘⇧R / Ctrl+Shift+R so the default Chromium Reload chord does not steal ⌘R. The transcript scroller hides native scrollbar chrome while remaining scrollable.

Current surfaces are:

- `changes` — V3 review as the window that fills its tile (`working tree → basename`, search/whitespace/context, minimize, close), using the same rounded border and glass fill as Plan and Context prompt;
- `context-prompt` — edit while the session is empty, inspect after first message;
- `plan` — Plan document surface (accepted Plan/Agent). Terminal remains a planned peer with no `terminal` variant yet.

FileDiff and a write/edit tool card open the Changes tile. Re-click or ⌘R / Ctrl+R hides the region. Plan and Context prompt keep the generic tile frame. V3 owns tracked-change, diff, Approve, conflict, and Undo semantics. UI owns host chrome. Plan/Agent meaning and the Plan document are accepted architecture; the immutable contract lives under [`../archive/features/plan-agent/`](../archive/features/plan-agent/README.md).

## Settings and account surfaces

The floating Settings UI renders typed protocol snapshots:

- Appearance (palette, mode, glass, UI/chat sizes, installed UI and code font families, font smoothing);
- Accounts/provider login;
- GitHub MCP;
- Skills and source trust;
- Archived chats;
- Permissions;
- Sandbox (accepted agent-tool sandbox add-on; default on — see [`../archive/features/sandbox`](../archive/features/sandbox/README.md)).

Settings never renders a generic schema, path picker, font-file picker, package manager, feature marketplace, or MCP server editor. Credential fields are transient input and stored values never return to the renderer.

## Accessibility and performance

- Use semantic buttons, navigation, dialogs, labels, and visible focus.
- Keep keyboard paths and focus restoration for dialogs/menus.
- Respect `prefers-reduced-motion`; motion stays opacity/transform based.
- Keep transcript scrolling and live-tail updates bounded.
- Frosted glass uses one OS vibrancy blur plus translucent fills. Extra CSS `backdrop-filter` stays on the left sidebar, the composer shell, and small overlay cards — not the transcript or right bar. Settings stays a solid overlay.
- Avoid shell remounts during project/session changes.
- Use shared design tokens and existing resize/menu/dialog primitives.

## Testing

Pure reducers/formatters/components have package tests. Renderer/IPC changes also require the real Electron lane. User-visible UI changes should verify relevant keyboard, reduced-motion, streaming/settled, background-session, relaunch, and light/dark states.

Use [`.agents/skills/test-pho-code`](../../.agents/skills/test-pho-code/SKILL.md). Record changes, regressions, mistakes, and owner feedback under [`../ui/logs/`](../ui/logs/README.md).
