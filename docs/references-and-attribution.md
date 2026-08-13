# References and attribution

## Purpose

This project is new code informed by open-source references. This file records meaningful copied or materially adapted source so required notices remain accurate and later contributors can distinguish original code from upstream-derived code.

Reading an implementation for architectural understanding does not require a row. Copying code, tests, CSS, assets, or closely preserving structure does.

## Reference inventory

### Pi

- Project: [Earendil Works Pi](https://github.com/earendil-works/pi)
- Documentation: [pi.dev](https://pi.dev/docs/latest)
- Role: runtime and public SDK dependency; primary behavioral authority
- License: MIT in the current upstream project; verify and preserve the exact pinned package's license during bootstrap
- Notes: use public SDK APIs and installed typings. Do not copy internal implementation merely to avoid learning the supported API.

### pi-gui

- Local reference: `refs/pi-gui`
- Upstream: [minghinmatthewlam/pi-gui](https://github.com/minghinmatthewlam/pi-gui)
- Pinned revision at documentation creation: `eb9a7380705dffad36db3efa771ee825aafbef6f`
- Copyright: Matthew Lam, 2026
- License: MIT; see `refs/pi-gui/LICENSE`
- Useful reference areas: Electron process boundary, Pi SDK driver, extension UI adaptation, desktop session lifecycle, tests, packaging
- Relationship: reference only; no product runtime dependency is permitted

### pi-web

- Local reference: `refs/pi-web`
- Upstream: [agegr/pi-web](https://github.com/agegr/pi-web)
- Pinned revision at documentation creation: `0877bffc0c6d75a55802e77125183e3df26e44a7`
- Copyright: agegr, 2026
- License: MIT; see `refs/pi-web/LICENSE`
- Useful reference areas: Pi HTTP/SSE projection, package and skill management, project trust, file-access boundaries
- Relationship: reference only; no product runtime dependency is permitted

### t3code

- Local reference: `refs/t3code`
- Upstream: [pingdotgg/t3code](https://github.com/pingdotgg/t3code)
- Pinned revision: `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5`
- Copyright: T3 Tools Inc., 2026
- License: MIT; see `refs/t3code/LICENSE`
- Useful reference areas: desktop Electron chat chrome (hidden inset titlebar, drag regions), zinc theme tokens, sidebar/chat-header/composer/timeline visual language
- Relationship: read-only UI/product reference; no product runtime dependency is permitted. Adapt the desktop presentation only. Do not copy hosted web (Clerk, Connect), mobile, or T3 branding.

### Beautiful UI

- Site: [beautifului.dev](https://www.beautifului.dev/)
- License: [MIT](https://www.beautifului.dev/license), copyright Shane Levine, 2026
- Role: optional source of copy-paste React patterns for AI-native interfaces
- Relevant patterns: streaming text, thinking, approvals, tool chips, task rows, chat, prompt bar, diffs, and code blocks
- Notes: the site is a component showcase, not the application framework. Record every copied component because no package lockfile will otherwise preserve provenance/version.

### ui-kit.ai

- Site: [ui-kit.ai](https://ui-kit.ai/)
- Installation: [`@ui-kit.ai/components`](https://ui-kit.ai/docs/getting-started/installation)
- Role: separately evaluated UI library; not the same project as Beautiful UI
- Current decision: not selected for v1. Re-evaluate only through a dependency/design-system decision.

## Adaptation log

Add one row per meaningful copied/adapted unit. Use the upstream commit or retrieval date so future changes remain traceable.

| Destination | Upstream source | Revision/date | Adaptation | License/notice action | Verification |
| --- | --- | --- | --- | --- | --- |
| `packages/ui/src/tokens.css` | `refs/pi-web/app/globals.css` | `0877bffc0c6d75a55802e77125183e3df26e44a7` | Copied the light/dark color tokens, scrollbar, and type ramp into repository CSS variables. File later retired; tokens now live in `theme.css` from T3. | MIT; recorded here | visual Electron check |
| `apps/desktop/src/styles.css` | `refs/pi-web/components/AppShell.tsx`, `ChatInput.tsx`, `MessageView.tsx` | `0877bffc0c6d75a55802e77125183e3df26e44a7` | Viewport-owning sidebar/main shell, compact composer bar, right-aligned user bubble, tool card density; no file explorer, tabs, or marketplace. Later replaced by Tailwind + T3 theme import. | MIT; recorded here | `test:desktop` chat + host-ui specs |
| `packages/ui/src/app-sidebar.tsx` | `refs/pi-web/components/SessionSidebar.tsx` | `0877bffc0c6d75a55802e77125183e3df26e44a7` | Compact session list and workspace identity; omitted worktrees, file tree, and config modals. Later rewritten against T3 desktop sidebar chrome. | MIT; recorded here | host-ui Electron spec |
| `packages/ui/src/composer.tsx` | `refs/pi-web/components/ChatInput.tsx` | `0877bffc0c6d75a55802e77125183e3df26e44a7` | Auto-growing undivided prompt bar with Send/Stop; omitted steering, attachments, slash menus, and model pickers. Later rewritten against T3 docked composer chrome. | MIT; recorded here | chat Electron spec |
| `packages/ui/src/transcript.tsx` | `refs/pi-web/components/MessageView.tsx` | `0877bffc0c6d75a55802e77125183e3df26e44a7` | Right-aligned user bubble and assistant column; omitted markdown, attachments, and message actions. Later rewritten against T3 desktop chat chrome; this row is retained for provenance. | MIT; recorded here | chat Electron spec |
| `packages/ui/src/theme.css` | `refs/t3code/apps/web/src/index.css` | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | Desktop zinc light/dark tokens, scrollbar, drag-region, workspace topbar; omitted stage artwork, terminal, and hosted theme editor | MIT; recorded here | visual Electron check |
| `packages/ui/src/lib/cn.ts` | `refs/t3code/apps/web/src/lib/utils.ts` | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | `cn()` via `cx` + `tailwind-merge` only; omitted Effect/platform helpers | MIT; recorded here | unit typecheck |
| `packages/ui/src/ui/button.tsx` | `refs/t3code/apps/web/src/components/ui/button.tsx` | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | Native button + CVA variants; omitted Base UI `useRender` | MIT; recorded here | visual Electron check |
| `packages/ui/src/app-shell.tsx`, `app-sidebar.tsx`, `chat-header.tsx` | `refs/t3code/apps/web/src/components/sidebar/SidebarChrome.tsx`, `AppSidebarLayout.tsx`, `chat/ChatHeader.tsx`, `NoActiveThreadState.tsx` | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | Desktop sidebar + chat header with drag regions and traffic-light inset; omitted settings, git, scripts, branding, mobile sheets | MIT; recorded here | `test:desktop` smoke + host-ui |
| `packages/ui/src/composer.tsx` | `refs/t3code/apps/web/src/components/chat/ComposerPrimaryActions.tsx`, `ChatView.tsx` composer dock | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | Rounded docked prompt + circular Send/Stop; omitted slash menus, attachments, stash, model picker | MIT; recorded here | chat Electron spec |
| `packages/ui/src/transcript.tsx`, `tool-row.tsx`, `thinking-block.tsx`, `tool-presentation.ts`, `work-entry-icon.tsx` | `refs/t3code/apps/web/src/components/chat/MessagesTimeline.tsx` (`PlainWorkEntryRow`, thinking tone, WorkingTimelineRow) | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | Faithful work-entry chrome: icon wrappers, “Bash completed” headings, muted previews, check/x status, indented expand body, bot thinking rows, working dots; omitted LegendList, diffs, agent spawn CTA, tooltips. Expanded tool panels and thinking markdown are harness-owned polish on top of that chrome. | MIT; recorded here | chat Electron spec + UI unit tests |
| `packages/ui/src/work-log-toggle.tsx`, turn grouping in `transcript.tsx` / `lib/work-log.ts` | Codex desktop “Worked for …” disclosure (screenshot reference only; no Codex source) | 2026-08-13 | One turn-level collapse for all thinking/tool steps with duration label; thinking still uses `ThinkingBlock` rows inside the disclosure; final assistant text always outside | N/A (visual inspiration; original code) | UI unit work-log tests |
| `packages/ui/src/markdown.tsx`, `.chat-markdown` in `theme.css` | `refs/t3code/apps/web/src/components/ChatMarkdown.tsx` + `index.css` chat-markdown rules | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | Dense sanitized markdown with codeblock chrome and T3 prose CSS; omitted `rehype-raw`, file-link graph, clipboard menus; later extended with KaTeX + settled-only Shiki/Mermaid | MIT; recorded here | UI unit sanitization/math/mermaid tests |
| `packages/ui/src/shiki-code.tsx`, `shiki-highlight.ts` | `refs/t3code/apps/web/src/components/ChatMarkdown.tsx` Shiki path + `lib/syntaxHighlighting.ts` | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | Settled-only highlight with Map cache and language fallback; omitted Suspense/`use()`, Pierre Diffs highlighter, clipboard menus | MIT; recorded here | UI unit theme helper + markdown tests |
| `packages/ui/src/app-sidebar.tsx` project groups | `refs/t3code/apps/web/src/components/Sidebar.tsx` (pattern only) | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | Collapsible project → session list; omitted search, DnD, snooze, git status, branding | MIT; recorded here | desktop chat/host-ui specs |
| `packages/ui/src/host-dialog.tsx` | `refs/t3code/apps/web/src/components/chat/ComposerPendingApprovalPanel.tsx`, `ComposerPendingUserInputPanel.tsx` | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | Inline composer-dock approval card (pending eyebrow, mono detail, option cards, number shortcuts); centered modal overlay removed; focus loop + Escape retained | MIT; recorded here | host-ui Electron spec + UI unit tests |
| `apps/desktop/electron/main.ts` `createWindow` | `refs/t3code/apps/desktop/src/window/DesktopWindow.ts` `getWindowTitleBarOptions` | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | macOS `hiddenInset` titlebar and traffic-light position only; omitted SSH, WSL, updater, preview, protocol handler | MIT; recorded here | `test:desktop` smoke |
| `packages/ui` shell chrome (sidebar actions, soft panels, composer footer selectors, user avatar chip, workspace picker icons, empty-session hero) | Cursor desktop UX patterns (screenshot reference only; no Cursor source) | 2026-08-13 | Harness-owned restyle: Lucide icons, near-black panels, pill composer with model/thinking meta row, relative session timestamps, centered empty-session composer with workspace/local chips; T3 timeline/markdown attribution above unchanged; no Cursor branding, Search/Automations, Plan/Multitask, or git chrome | N/A (visual inspiration; original code) | UI unit + `test:desktop` chat/host-ui |

Example:

| Destination | Upstream source | Revision/date | Adaptation | License/notice action | Verification |
| --- | --- | --- | --- | --- | --- |
| `packages/ui/src/tool-card.tsx` | `https://www.beautifului.dev/` Tool Chips source modal | retrieved YYYY-MM-DD | Converted Tailwind classes to project tokens; replaced demo state with protocol props | Preserve Beautiful UI MIT notice in third-party notices | component test + Electron visual check |

## Required procedure

Before copying or adapting:

1. Confirm the exact source and license.
2. Prefer the smallest useful unit rather than wholesale directory copying.
3. Remove upstream product assumptions and private paths.
4. Preserve required copyright/license notices.
5. Add the adaptation row in the same change.
6. Add repository-owned tests.
7. Note substantial later rewrites; do not erase provenance merely because names changed.

## Third-party notices

Before any distributed artifact, generate or author a third-party notices file that includes all runtime dependency licenses and the notices for copied source. This log is an input to that artifact, not a replacement for license review.

Do not copy:

- upstream branding, icons, or screenshots without separate permission review;
- user session data or credentials;
- generated build output;
- code whose license cannot be established;
- dependencies by copying their built files around their package license.
