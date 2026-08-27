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
- Notes: use public SDK APIs and installed typings. Do not copy internal implementation merely to avoid learning the supported API. The agent-tool sandbox add-on reads the official example [`packages/coding-agent/examples/extensions/sandbox/index.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/sandbox/index.ts) for the `createBashTool` / `user_bash` wrap; the pinned `0.84.1` copy is the API source of truth. Milestone 0 uses Pi's public `createLocalBashOperations` plus `SandboxManager.wrapWithSandbox` rather than copying the example's `spawn("bash", ["-c", …])`. Plan/Agent reads the official [`plan-mode`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/plan-mode/index.ts), [`questionnaire.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/questionnaire.ts), [`question.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/question.ts), and [`todo.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/todo.ts) examples the same way. Reading them does not require a copy row. If an example is later copied or closely adapted into Pho Code, add a copy row here with the pin revision.

### Anthropic sandbox-runtime

- Package: [`@anthropic-ai/sandbox-runtime`](https://www.npmjs.com/package/@anthropic-ai/sandbox-runtime) `0.0.73`
- Upstream: [anthropic-experimental/sandbox-runtime](https://github.com/anthropic-experimental/sandbox-runtime)
- License: Apache-2.0
- Role: OS wrap of agent `bash` children (`sandbox-exec` on macOS). Runtime dependency of the [`archive/features/sandbox`](./archive/features/sandbox/README.md) add-on. Not a renderer import. Packaged macOS flattens the pin into production `node_modules` with nested `zod` 3 so it does not collide with top-level `zod` 4.

### ripgrep

- Upstream: [BurntSushi/ripgrep](https://github.com/BurntSushi/ripgrep) `15.2.0`
- License: Unlicense OR MIT
- Role: bundled `rg` binary for sandbox-runtime deny-path detection (required on Linux; required by this add-on's fail-closed contract on every platform). Staged as an app-owned resource, not a Homebrew `PATH` dependency. `package:mac` copies the pinned binary into `Contents/Resources/features/ripgrep/`.

### juicesharp rpiv-ask-user-question

- Upstream: [juicesharp/rpiv-mono `packages/rpiv-ask-user-question`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-ask-user-question)
- Evaluated version: npm `@juicesharp/rpiv-ask-user-question` `2.6.0`
- Copyright: juicesharp
- License: MIT
- Role: research-only ask-user questionnaire for Pi; RPC `select`/`input` walker is the fallback pattern; schema/envelope/guidelines are the adaptation source
- Relationship: not a product runtime dependency. Do not bake the package. The archived [`archive/features/plan-agent`](./archive/features/plan-agent/README.md) add-on reimplements a Pho-owned tool. Milestone 0 copy rows are in the adaptation log below.

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
| `packages/ui/src/theme-palettes.css` | Official palette hex tables: [Gruvbox](https://github.com/morhetz/gruvbox), [Catppuccin](https://github.com/catppuccin/catppuccin) Latte/Mocha, [Flexoki](https://stephango.com/flexoki), [GitHub Primer](https://primer.style), Atom One Dark | 2026-08-13 | Hand-mapped public palette hexes onto Pho CSS token roles (no upstream CSS/code copied) | Palette values treated as non-copyrightable facts; Flexoki site MIT for docs | unit + settings Electron |
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
| `packages/ui/src/transcript.tsx`, `tool-row.tsx`, `thinking-block.tsx`, `tool-presentation.ts`, `work-entry-icon.tsx` | `refs/t3code/apps/web/src/components/chat/MessagesTimeline.tsx` (`PlainWorkEntryRow`, thinking tone, WorkingTimelineRow) | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | Work-entry chrome: icon wrappers, owner-facing titles without a status word, muted previews, check/x status, indented expand body, thinking rows, working dots; omitted LegendList, diffs, agent spawn CTA, tooltips. Pho/Lucide icon packs and expanded tool panels are harness-owned polish on top of that chrome. | MIT; recorded here | chat Electron spec + UI unit tests |
| `packages/ui/src/work-log-toggle.tsx`, turn grouping in `transcript.tsx` / `lib/work-log.ts` | Codex desktop “Worked for …” disclosure (screenshot reference only; no Codex source) | 2026-08-13 | One turn-level collapse for all thinking/tool steps with duration label; thinking still uses `ThinkingBlock` rows inside the disclosure; final assistant text always outside | N/A (visual inspiration; original code) | UI unit work-log tests |
| `packages/ui/src/markdown.tsx`, `.chat-markdown` in `theme.css` | `refs/t3code/apps/web/src/components/ChatMarkdown.tsx` + `index.css` chat-markdown rules | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | Dense sanitized markdown with codeblock chrome and T3 prose CSS; omitted `rehype-raw`, file-link graph, table/path clipboard menus; later extended with math-gated KaTeX + settled-only Shiki/Mermaid/SVG + http(s)/data image lightbox + harness code-block copy | MIT; recorded here | UI unit sanitization/math/mermaid/svg/image/copy tests |
| `packages/ui/src/markdown-codeblock.tsx`, `copy-button.tsx` | `refs/t3code/apps/web/src/components/ChatMarkdown.tsx` code-block header copy control; later chrome from Cursor citation screenshot (no Cursor source) | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` / 2026-08-16 | Language label + icon copy in fenced-code header; omitted wrap toggle, tooltips menu, failure toast reporting. Later: palette `--background` fill, clearer hairline + header divider, compact padding, ghost copy | MIT; recorded here | UI unit markdown + clipboard tests |
| `packages/ui/src/lib/clipboard.ts`; assistant-output copy in `transcript.tsx` | `refs/pi-web/lib/clipboard.ts`, `refs/pi-web/components/MessageView.tsx` assistant copy action | `0877bffc0c6d75a55802e77125183e3df26e44a7` | Plain-text clipboard helper + turn-level “Copy response” for settled assistant text blocks; omitted user-message/fork actions and i18n | MIT; recorded here | UI unit clipboard + work-log tests |
| `packages/ui/src/markdown-image.tsx` | `refs/pi-web/components/ImagePreview.tsx` | `0877bffc0c6d75a55802e77125183e3df26e44a7` | Native `<dialog>` lightbox for markdown images: trigger button, Esc/backdrop/close, focus restore, body scroll lock; omitted i18n and next/img; harness CSS tokens | MIT; recorded here | UI unit markdown image tests |
| `packages/ui/src/shiki-code.tsx`, `shiki-highlight.ts` | `refs/t3code/apps/web/src/components/ChatMarkdown.tsx` Shiki path + `lib/syntaxHighlighting.ts` | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | Settled-only highlight with Map cache, `text` bootstrap, and on-demand `loadLanguage`/`loadTheme`; theme follows harness palettes (Flexoki → bundled Solarized); `codeToTokens` is used for change-review lines as React text nodes (no raw HTML); omitted Suspense/`use()`, Pierre Diffs highlighter; copy lives in shared codeblock chrome | MIT; recorded here | UI unit theme helper + markdown tests |
| `packages/ui/src/app-sidebar.tsx` project groups | `refs/t3code/apps/web/src/components/Sidebar.tsx` (pattern only) | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | Collapsible project → session list; later gained harness-owned folder DnD | MIT; recorded here | desktop chat/host-ui specs |
| `packages/ui/src/app-sidebar.tsx` denser project rows + shell collapse | `refs/pi-gui/apps/desktop/src/sidebar.tsx`, `sidebar.css`, `sidebar-toggle-button.tsx` (visual density / collapse pattern); collapsed overlay pill chrome from this repo’s `right-sidebar.tsx` / `refs/t3code` `RightPanelTabs.tsx` | local `refs/pi-gui`; T3 `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | Wider sidebar, Open folder + New session actions, count/`+` project rows, collapsible shell chrome; collapse shows a compact overlay pill (Open folder, New session, Settings) matching the right-rail pill; omitted Skills/Extensions nav, worktrees, pinned threads; folder reorder via `@dnd-kit` is harness-owned (not copied pi-gui DnD source) | MIT; recorded here | smoke toggle + UI unit app-sidebar tests |
| `packages/ui/src/loading-dots.tsx`, `session-leading-mark.tsx` | Cursor desktop agent-list running mark (screenshot reference only; no Cursor source) | 2026-08-15 | Compact 3×3 spinner in the session row while a run is live; `prefers-reduced-motion` holds a static cell; Beautiful UI Dots/pixel-grid omitted | N/A (visual inspiration; original code) | UI unit session-leading-mark tests |
| `packages/ui/src/session-context-menu.tsx` | `refs/pi-gui/apps/desktop/src/sidebar.tsx` `ThreadSessionRow` `onContextMenu` + `refs/pi-gui/apps/desktop/src/hooks/use-thread-menu.tsx` | local `refs/pi-gui` | Right-click session menu with Archive/Restore and Move to Trash; omitted rename, pin, mark-read, and copy session id | MIT; recorded here | UI unit session-context-menu test |
| `packages/ui/src/host-dialog.tsx` | `refs/t3code/apps/web/src/components/chat/ComposerPendingApprovalPanel.tsx`, `ComposerPendingUserInputPanel.tsx` | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | Inline composer-dock approval card (pending eyebrow, mono detail, option cards, number shortcuts); centered modal overlay removed; focus loop + Escape retained | MIT; recorded here | host-ui Electron spec + UI unit tests |
| `packages/ui/src/host-dialog.tsx` compact chrome | [Beautiful UI](https://www.beautifului.dev/) ApprovalCard.tsx (`#approval-card`) | retrieved 2026-08-13 | Tighter pad, radio-dot rows, dismiss, footer send arrow; omitted multi-question pager, auto-advance, and demo “answers sent”; Pi confirm/select/input + Enter/digit shortcuts unchanged | MIT (Shane Levine); recorded here | UI unit host-dialog tests |
| `packages/pho-agent/packages/runtime/src/plan-agent/ask-user-question.ts`, `plan-agent-feature.ts` prompt guidelines | juicesharp `@juicesharp/rpiv-ask-user-question` `2.6.0` `tool/validate-questionnaire.ts`, `tool/response-envelope.ts`, `tool/format-answer.ts` | 2.6.0 / 2026-08-16 | Pho-owned validation, reserved labels, decline vs host-failure envelope, and tool guidelines. 8 KiB fields reject. Package and `pi-tui` not baked. | MIT (juicesharp); recorded in both repositories | agent-protocol + agent-runtime ask-user unit tests |
| `packages/pho-agent/packages/runtime/src/plan-agent/todo-tool.ts` reconstruct from `getBranch()` tool-result details | earendil-works/pi `0.84.1` [`examples/extensions/todo.ts`](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/examples/extensions/todo.ts) persist idea | 0.84.1 / 2026-08-16 | Scan current-branch `todo` tool results and keep the latest `details.todos`. Cursor merge-replace input, not Pi add/toggle. TUI `/todos` not copied. | MIT (earendil-works/pi); recorded in both repositories | agent-protocol parsePlanTodoList bounds |
| `packages/ui/src/ask-user-card.tsx`, `.ask-user-*` in `theme.css` | [Beautiful UI](https://www.beautifului.dev/) ApprovalCard.tsx (`#approval-card`) pager / Type something / review | retrieved 2026-08-16 | Lettered option rows, Type something, header chips, optional preview, review step on the existing dock; permission copy stays in `host-dialog.tsx` | MIT (Shane Levine); recorded here | UI unit ask-user-card-state + host-dialog tests; Electron `ask-user.spec.ts` |
| `apps/desktop/electron/main.ts` `createWindow` | `refs/t3code/apps/desktop/src/window/DesktopWindow.ts` `getWindowTitleBarOptions` | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | macOS `hiddenInset` titlebar and traffic-light position only; omitted SSH, WSL, updater, preview, protocol handler | MIT; recorded here | `test:desktop` smoke |
| `packages/ui` shell chrome (sidebar actions, soft panels, composer footer selectors, user avatar chip, workspace picker icons, empty-session hero, `@` mention chips) | Cursor desktop UX patterns (screenshot reference only; no Cursor source) | 2026-08-13 | Harness-owned restyle: Lucide icons, near-black panels, pill composer with model/thinking meta row, relative session timestamps, centered empty-session composer with workspace/local chips, teal inline `@` file/folder chips in composer + user transcript; T3 timeline/markdown attribution above unchanged; no Cursor branding, Search/Automations, Plan/Multitask, or git chrome | N/A (visual inspiration; original code) | UI unit + `test:desktop` chat/host-ui |
| `packages/ui/src/composer-rail.tsx`, `composer-toolbar.tsx`, `composer.tsx` field row, `.composer-rail-*` / `.composer-toolbar*` / `.composer-send` in `theme.css` | Claude Code composer layout (screenshot reference only; no Claude Code source) | 2026-08-21 | Harness-owned relayout: machine/workspace chip rail above the empty-session field (hidden after the first message), prompt-only field with a trailing `↵` send affordance, flat mode/model/thinking/usage toolbar below. Omitted Claude Code branding, dictation, and the git branch/worktree chips (no branch state in the protocol; branch switching is out of scope) | N/A (visual inspiration; original code) | UI unit composer-rail / composer-toolbar / conversation tests; `test:desktop` host-ui |
| `packages/ui/src/composer-usage.tsx`, `model-picker.tsx` | Pi TUI footer stats; AI Elements Context (UX only); pi-gui model selector pattern | 2026-08-13 | Linear reddening context bar + ↑↓/R/W/$ strip from Pi session stats; custom model picker with $/M rates; no AI Elements/tokenlens dependency | N/A (behavioral/UX inspiration; original code) | UI unit + runtime snapshot tests |
| `packages/ui/src/provider-icon.tsx` | [Simple Icons](https://simpleicons.org/) brand path data (`deepseek`, `anthropic`, `openai`, `googlegemini`, `cursor`, …) via jsDelivr `simple-icons` package | retrieved 2026-08-13; `cursor` path reused 2026-08-14 | Inlined monochrome `currentColor` SVG paths keyed by Pi provider ids; letter fallback for unknown providers; no runtime dependency on `simple-icons` | CC0 1.0; recorded here | UI unit conversation / provider-icon test |
| `packages/ui/src/skill-source-icon.tsx` Cursor mark | [Simple Icons](https://simpleicons.org/) `cursor` path via `ProviderIcon` | retrieved 2026-08-14 | Cursor skill source reuses the provider-icon Cursor mark; Codex reuses the owner-supplied provider bitmaps; Claude reuses the Anthropic Simple Icons path | CC0 1.0; recorded here | UI unit skills-settings test |
| baked `pi-cursor-sdk` `0.2.0` + `@cursor/sdk` `1.0.23` | [`pi-cursor-sdk`](https://github.com/fitchmultz/pi-cursor-sdk) / npm; Cursor SDK | 0.2.0 / 1.0.23 | Baked provider feature for local Cursor SDK agents; harness forces local runtime and `PI_CURSOR_SETTING_SOURCES=none`; Cursor Cloud not productized; warning dialog on Cursor model select | MIT (`pi-cursor-sdk`); Cursor SDK license via notices | runtime feature resolve + stage-app-resources + UI warning tests |
| `packages/ui/src/assets/openai-codex-light.png`, `openai-codex-dark.png` | Owner-supplied OpenAI Codex product marks (black cloud for light UI, white cloud for dark UI) | 2026-08-13 | Resized to 128×128 PNG and shown for Pi provider id `openai-codex` only; API-key `openai` keeps the Simple Icons blossom | OpenAI trademark; personal identification use, not redistributed as a standalone asset | UI unit provider-icon test |
| Composer thinking max accent | Codex effort “Ultra” purple emphasis (screenshot reference only; no Codex source) | 2026-08-13 | Native thinking `<select>` keeps Pi labels; top available level gets purple text only (no slider) | N/A (visual inspiration; original code) | UI unit conversation test |
| `packages/ui/src/tool-row.tsx` collapsed row chrome | [Beautiful UI](https://www.beautifului.dev/) ToolChips.tsx (`#tool-chips`) | retrieved 2026-08-13 | Icon + heading + hover chevron; preview after the heading is harness-owned quiet text (web search/fetch omit it); omitted demo autoplay, fake diffs, and ice-cream copy; expanded Input/Output panels remain harness-owned | MIT (Shane Levine); recorded here | UI unit tool-row tests |
| Composer highlight ring + `/` skill picker in `packages/ui/src/composer.tsx`, `composer-picker-menu.tsx` | [Beautiful UI](https://www.beautifului.dev/) PromptBar.tsx (`#prompt-bar`); [globals.css](https://github.com/slev12397/beautiful-ui/blob/main/app/globals.css) `pop-in` | retrieved 2026-08-13 / 2026-08-22 | Shell ring for max thinking, `@` mention, and `/` skill insert; gliding highlight and pop-in `@` / `/` menus with a type-to-search footer; omitted dictation, `glimm` rainbow sweep, autoplay, and fake source/command catalogs | MIT (Shane Levine); recorded here | UI unit composer-highlight + composer-tokens + composer-picker-menu tests |
| Live Working/Thinking shimmer in `working-label.tsx`, `work-log-toggle.tsx`, `thinking-block.tsx`, `.working-shimmer` in `theme.css`; sparkle in `sparkle-icon.tsx` | [Beautiful UI](https://www.beautifului.dev/) ThinkingState sparkle header; [globals.css](https://github.com/slev12397/beautiful-ui/blob/main/app/globals.css) `shimmer-text` | retrieved 2026-08-22 | Moving gradient highlight on live Working/Thinking copy; four-point sparkle on the live Thinking row only (not the turn-level Working disclosure); omitted expandable demo traces, ice-cream copy, and pixel-grid loader | MIT (Shane Levine); recorded here | UI unit work-log + thinking-block + conversation tests |
| Live streaming caret in `stream-text.tsx`, `transcript.tsx`, `thinking-block.tsx`, `.stream-caret` in `theme.css` | [Beautiful UI](https://www.beautifului.dev/) [globals.css](https://github.com/slev12397/beautiful-ui/blob/main/app/globals.css) StreamText `.stream-caret`; harness `StreamLine` caret | retrieved 2026-08-22 | Caret is solid while tokens arrive. Owner rejected the StreamText leading-edge blur tail. Tokens still come from Pi; omitted the demo word-by-word timer, citations, follow-ups, and `.stream-tail` | MIT (Shane Levine); recorded here | UI unit stream-text + thinking-block + conversation tests |
| `packages/runtime` local retrieval (`local-retrieval.ts`, `retrieval-feature.ts`) | [`@ff-labs/fff-node`](https://www.npmjs.com/package/@ff-labs/fff-node) `0.10.1`; tool names/schemas informed by [`@ff-labs/pi-fff`](https://www.npmjs.com/package/@ff-labs/pi-fff) `0.10.1` | 0.10.1 / 2026-08-13 | Application-owned `FileFinder` adapter for additive `fffind`/`ffgrep`/`fff-multi-grep` plus composer `@` suggestions from the same index. `pi-fff` is not loaded (it owns a second index and TUI autocomplete). Indexes and frecency DBs live under app data `retrieval/`, not Pi’s default `~/.pi/agent/fff/`. | MIT (Dmitry Kovalenko); notices via `fff-node` | runtime local-retrieval + workspace-reference tests |
| staged `@ff-labs/fff-node/dist/src/binary.js` in `scripts/package-mac.ts` | [`@ff-labs/fff-node`](https://www.npmjs.com/package/@ff-labs/fff-node) `0.10.1` binary resolver | 0.10.1 / 2026-08-13 | Build-time-only patch maps a resolved native library from Electron's virtual `app.asar` path to the corresponding existing `app.asar.unpacked` path before `ffi-rs` calls `dlopen`; fails closed if the pinned upstream source shape changes. The installed development package is not modified. | MIT (Dmitry Kovalenko); existing `fff-node` notice retained | package script unit test + packaged smoke |
| `packages/runtime` pho-web (`web-url.ts`, `web-client.ts`, `web-search-providers.ts`, `web-youtube.ts`, `web-feature.ts`) | Policy and DuckDuckGo HTML parse informed by [`pi-web-access`](https://www.npmjs.com/package/pi-web-access) `0.22.0` (`ssrf-protection.ts`, `duckduckgo.ts`); YouTube URL detection informed by `youtube-extract.ts`; extraction via `@mozilla/readability` `0.6.0`, `linkedom` `0.16.11`, `turndown` `7.2.1`; Jina Search/Reader are keyless HTTP APIs ([`s.jina.ai`](https://s.jina.ai) / [`r.jina.ai`](https://r.jina.ai)), not a copied package | 0.22.0 / 2026-08-14 | Application-owned `pho-web` adapter: `web_search` fans out DuckDuckGo/Bing/Brave/Mojeek/Jina and merges unique URLs; `fetch_content` does public HTTP GET, YouTube captions/metadata, then Jina Reader for thin pages. `pi-web-access` is not loaded (TUI, Exa/Codex, GitHub clone, PDF, Gemini cookies). SSRF, redirect, timeout, and size limits are harness-owned. | MIT (Nico Bailon / Mozilla / linkedom / turndown); Jina is a remote HTTP API | runtime web-url + web-client + web-youtube tests |
| `packages/runtime` GitHub MCP (`github-mcp-runtime.ts`, `github-mcp-feature.ts`, `github-mcp-artifact.ts`) | Official [`github/github-mcp-server`](https://github.com/github/github-mcp-server) `v1.9.0` native binary; [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) `1.30.0` stdio client | 2026-08-10 / 1.30.0 | Application-owned read-only adapter: packaged binary over `stdio --read-only --lockdown-mode`, with one fixed `mcp` dispatcher restricted to a source-controlled qualified GitHub read allowlist. PAT stored in the OS secret store; renderer never receives the token, server path, or stderr. | MIT (GitHub, Inc. / Anthropic, PBC); notices via staged binary PIN + MCP SDK | runtime github-mcp-runtime + allowlist tests |
| `packages/runtime/src/change-diff.ts` | `@earendil-works/pi-coding-agent` `generateUnifiedPatch` (`dist/core/tools/edit-diff.ts`) | `0.84.1` | Call the already-pinned SDK public unified-patch helper for bounded review diffs; parse/page hunks in harness-owned code. No extra `diff`/jsdiff dependency. | MIT (Earendil Works); existing Pi SDK notice | runtime change-ledger + change-capture tests |
| `packages/ui/src/change-review-sheet.tsx` (shared toolbar/status chrome), `change-review-window.tsx`, `right-sidebar.tsx`, `lib/change-review-diff.ts`, `.change-review-*` in `theme.css` | `refs/t3code/apps/web/src/components/files/FilePreviewPanel.tsx`, `DiffPanelShell.tsx`, `diffs/StyledDiffCodeView.tsx`, `chat/DiffStatLabel.tsx`, `chat/PanelLayoutControls.tsx`, `RightPanelTabs.tsx`, `index.css` `--code-background` / hunk separators | `6bc6cb6be4ebecd5bd7a3b7b88f07cb61815ded5` | Unified-diff card with file verb, +/- stats, line gutter, unmodified-line pills, in-panel search, whitespace glyphs, bounded context control, and token-colored lines as React text; persistent right sidebar as a collapsed overlay pill (FileDiff, Context prompt) that expands to a resizable panel; re-clicking the active surface collapses it (no PanelRight control); omitted Pierre Diffs, comments, before/agent/current tabs, explorer, and extra rail surfaces (terminal, files, browser) | MIT; recorded here | UI unit change-review-window + change-review-diff + right-sidebar tests |

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
