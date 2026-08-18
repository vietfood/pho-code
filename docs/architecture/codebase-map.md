# Current codebase map

## Status

Source map for the current working implementation. Update this page when modules move, package responsibilities change, or an accepted workstream adds a durable subsystem.

## Workspace shape

```text
apps/desktop/
├── electron/        Electron main, preload, IPC, security, native adapters
├── src/             Renderer composition and keyed UI state
└── tests/           Electron, packaged, security, and helper lanes
packages/
├── protocol/        JSON-safe contracts, reducers, validation
├── application/     Use cases, metadata, catalog coordination
├── runtime/         Pi ownership and privileged feature adapters
└── ui/              React presentation and interaction components
scripts/             Packaging, staging, attribution checks
```

The enforced direction is:

```text
apps/desktop/src -> packages/ui -> packages/protocol
apps/desktop/src -> packages/protocol
apps/desktop/electron -> packages/application -> packages/runtime -> Pi SDK
apps/desktop/electron -> packages/protocol
```

Electron main is the composition root and may import application/runtime packages. Renderer code may not.

## Protocol package

`packages/protocol/src` groups contracts by behavior:

- `version.ts`, `bridge.ts`, `command-result.ts`, `errors.ts`, `json.ts` — versioned facade, result envelope, normalized failures, JSON-safety.
- `events.ts`, `conversation.ts`, `bootstrap.ts` — runtime envelopes, transcript/run projections, bootstrap snapshot and reducers.
- `workspace.ts`, `session-lifecycle.ts` — composite identity, catalog, archive/restore/removal, recent projects.
- `settings.ts`, `sandbox.ts`, `credentials.ts`, `github-mcp.ts`, `skills.ts` — typed settings and redacted account/skill/MCP/sandbox projections.
- `attachments.ts`, `at-mention.ts`, `retrieval.ts`, `web.ts`, `http-url.ts` — bounded input/retrieval/network contracts.
- `context-prompt.ts` — per-session prompt composition and active-tool selection.
- `resources.ts` — baked feature diagnostics.
- `plan-agent.ts` — ask-user questionnaire types/bounds plus Plan/Agent mode, document, `todo` list, `execute_plan`, and commands (accepted).
- `change-review.ts` — accepted V3 review/Approve/per-file Undo contracts.

`index.ts` is the public package surface. Runtime validation accompanies types; TypeScript alone is not an IPC boundary.

## Application package

`packages/application/src` is intentionally small:

- `bootstrap.ts` implements `ApplicationService`, validates use-case identity/input, coordinates metadata and runtime, and maps errors.
- `metadata.ts` defines application metadata schema v6: recent-workspace order, selection, archive/view/outcome lifecycle, appearance, trusted projects, skill sources, and GitHub MCP enabled state.
- `session-catalog.ts` joins Pi session truth with application archive/attention state.
- `index.ts` exports the application boundary.

Application depends on protocol and the `HarnessRuntime` interface. It does not import Electron, React, Node APIs, or Pi.

## Runtime package

### Pi and session core

- `harness-runtime.ts` defines the privileged runtime interface.
- `pi-runtime.ts` composes Pi services and public runtime operations.
- `session-registry.ts` owns composite identity and the bounded independent registry: eight resident controllers and four concurrent runs.
- `transcript.ts`, `model-summary.ts`, `preview.ts` project Pi truth.
- `extension-host.ts`, `host-dialog-presentation.ts` bind structured extension UI per session.
- `context-prompt.ts`, `context-prompt-feature.ts`, `assistant-rewrite.ts` own Pi custom-entry/prompt integration. Context-prompt injection looks up compiled A from the live session on `before_agent_start`; the factory does not capture a bind-time session key.

### Feature composition and resources

- `features.ts`, `resources.ts`, `resource-locator.ts` build the immutable manifest and resolve development vs packaged resources.
- `permission-settings.ts`, `permission-presets.ts` adapt the pinned permission feature; runtime start syncs harness allow-list tools (`ask_user_question`, `update_plan_document`, `todo`, `execute_plan`) and the managed `web_search` / `fetch_content` pair onto existing configs, and appends the sandbox `authorizerChain` link (`pho-code-sandbox`).
- `trash-feature.ts`, `recoverable-removal.ts`, `trash-target.ts`, `process-launch.ts` implement recoverable removal behind injected platform/process seams.
- `plan-agent-feature.ts`, `plan-agent-state.ts`, `todo-tool.ts`, `ask-user-question.ts`, `ask-user-present.ts`, `ask-user-rpc-fallback.ts` register `ask_user_question`, `todo`, Plan tool policy, `update_plan_document`, and Plan-only `execute_plan` (accepted Plan/Agent).
- `sandbox-runtime.ts`, `sandbox-policy.ts`, `sandbox-settings.ts`, `sandbox-feature.ts`, `sandbox-permission.ts` wrap agent `bash` / `user_bash` with pinned `@anthropic-ai/sandbox-runtime` when Settings enables it (accepted agent-tool sandbox; default on; skip-ask; in-process `read`/`write`/`edit` policy; packaged engine/`rg` staging).
- `cursor-sdk-policy.ts` fixes the baked Cursor provider policy.

`createDefaultFeatureManifest` supplies stable base resources/factories. `createPhoCodeRuntime` appends service-bound inline features for `read_skill`, GitHub MCP, context-prompt injection, V3 change capture, and the agent-tool sandbox factory (bash wrap plus file-tool intercept while enabled). Both stages are source-selected and immutable to the user.

### Retrieval and input

- `local-retrieval.ts`, `retrieval-feature.ts`, `workspace-reference.ts`, `workspace-path.ts` own the workspace-bounded FFF index and references.
- `web-feature.ts`, `web-client.ts`, `web-url.ts`, `web-search-providers.ts`, `web-youtube.ts` own bounded public web search/fetch.
- `image-store.ts`, `image-bytes.ts` own prepared image lifetime and validation.
- `skill-source.ts`, `skills-feature.ts`, `skill-invoke.ts` own fixed text-only skill sources and on-demand expansion.

### Accounts and MCP

- `credentials.ts`, `provider-auth-flow.ts`, `secret-store.ts` keep credential material and provider OAuth in the privileged layer.
- `github-mcp-runtime.ts`, `github-mcp-feature.ts`, `github-mcp-allowlist.ts`, `github-mcp-artifact.ts` own the single pinned read-only GitHub server and tool allowlist.

### V3 change review

The implemented V3 subsystem is grouped under:

- capture/identity/path/hash/text/diff: `change-capture.ts`, `change-identity.ts`, `change-path.ts`, `change-hash.ts`, `change-text.ts`, `change-diff.ts`;
- record/store/recovery: `change-record.ts`, `change-ledger-store.ts`, `change-recovery.ts`;
- runtime/tool integration: `change-feature.ts`, `change-review.ts`.

This accepted subsystem's product contract, evidence, and residual recovery limits are archived under [`../archive/v3/`](../archive/v3/README.md).

## Electron adapter

`apps/desktop/electron` owns:

- `main.ts` — app lifecycle, composition, BrowserWindow, native dialogs/clipboard/theme, resource roots, staged `rg` PATH prepend, command registration, bounded quit.
- `application-menu.ts`, `application-menu-spec.ts` — application menu; Reload is CommandOrControl+Shift+R so CommandOrControl+R can toggle the right sidebar.
- `preload.ts`, `ipc.ts` — explicit `window.phoCode` facade and fixed channel names.
- `security.ts`, `security-policy.ts`, `trusted-renderer.ts` — CSP, sender/origin, navigation, permission, and external-URL policy.
- `metadata-store.ts` — atomic application metadata persistence.
- `image-ingest.ts`, `image-base64.ts` — native picker/clipboard image admission.
- `bounded-shutdown.ts` — aggregate disposal deadline.

There is no PTY or terminal service in source. That work remains under the terminal add-on.

## Renderer composition

`apps/desktop/src/App.tsx` is the stateful shell composition:

- bootstrap/settings/provider-account state;
- keyed conversation cache and per-chat live-run store;
- per-workspace session catalogs and session switching;
- prompt/image/model/thinking/host-dialog commands;
- archive/restore/project removal and trust flows;
- right-sidebar selection and V3 review hook.

`bridge.ts`, `use-session-switch.ts`, `session-catalog-state.ts`, and `use-change-review.ts` isolate bridge lookup, session/catalog transitions, and review requests. Renderer code sends typed intent and never imports privileged layers.

Composite identity is `{workspaceId, sessionId}`; the current runtime uses the canonical absolute workspace path as `workspaceId`. UI code treats it as opaque identity and does not derive filesystem authority from it.

## UI package

`packages/ui/src` is presentation plus pure interaction helpers:

- shell/navigation: `app-shell.tsx`, `app-sidebar.tsx`, project/session menus, resize/toggle controls, welcome/empty/loading surfaces;
- conversation: `conversation.tsx`, `transcript.tsx`, composer, chat header, thinking/work log, tool rows, notification and host-dialog components, ask-user questionnaire card, Plan document panel (accepted Plan/Agent);
- rich content: Markdown, code, Shiki, KaTeX integration, Mermaid, SVG, images, copy;
- settings/accounts/skills/GitHub/archive/trust/sandbox dialogs;
- right sidebar: `right-sidebar.tsx`, `change-review-sheet.tsx`, `context-prompt-dialog.tsx`, `plan-document-panel.tsx`;
- design tokens/palettes in `theme.css` and `theme-palettes.css`, with helpers under `lib/`.

UI imports React and protocol only. It renders remote/tool/model content as untrusted data.

## Tests and executable boundaries

- Package tests live beside `packages/*/test` and cover reducers, validation, adapters, Pi integration, lifecycle, and recovery using owned temporary roots.
- `apps/desktop/tests/unit` covers shell helpers and boundary invariants.
- `apps/desktop/tests/*.spec.ts` runs Electron journeys for bootstrap, security, chat, sessions, dialogs, ask-user questionnaires, settings, credentials, OAuth, permissions, project trust, V3 review, sandbox, and shutdown.
- `apps/desktop/tests/packaged.spec.ts` verifies the unsigned macOS artifact with isolated data and no Pi CLI.
- `eslint.config.js` enforces package dependency direction.

Use [`.agents/skills/test-pho-code`](../../.agents/skills/test-pho-code/SKILL.md) to select the verification lane.
