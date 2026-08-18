# Extension model

## Current implementation status

Personal v1 and v2 are accepted and archived. Ordinary global/project executable feature discovery is disabled, `HarnessFeatureManifest` remains the only extension/MCP composition input, and packaged builds resolve third-party executable features only from app-owned resources. V2 Milestone 4 reads text-only skills from fixed, explicitly enabled Codex/Cursor/Claude/Pi user roots with provenance and validation, ships three Pho Code-authored skills, and adds one Settings-controlled adapter for pinned read-only `github/github-mcp-server` `v1.9.0`. Enabling a skill source makes its skills available in `/`; it does not bake them into Pi session context. GitHub uses an explicitly supplied PAT retained in the OS secret store and a fixed `mcp` dispatcher restricted to qualified allowlisted reads; OAuth is intentionally absent. Typed settings do not admit arbitrary paths, packages, or server definitions. See the [v2 closure review](../archive/v2/reviews/milestone-4-code-review.md).

## Purpose

This document defines how the harness composes curated features without becoming a customizable Pi distribution. Pi remains the runtime format and loader, but the application chooses, pins, and ships its capabilities. The owner changes the feature set by changing source and rebuilding the app, not through a resource store.

The harness is standalone: it embeds bare-bones Pi plus an application-owned feature bundle. User Pi directories are optional interoperability/data sources, never feature dependencies. A feature that works only after the user installs it into another Pi environment is not baked in and does not satisfy this model.

## Vocabulary

Use these terms consistently:

- **Pi extension:** executable TypeScript/JavaScript loaded by Pi. It may register tools and commands, observe events, change prompts, or request host UI.
- **Skill:** a `SKILL.md` capability following the Agent Skills model. Pi exposes its description and loads detailed instructions on demand.
- **Prompt template:** Markdown expanded through a slash command.
- **Pi package:** a package that bundles extensions, skills, prompts, and themes through a `pi` manifest or convention directories. The harness may use one internally as a pinned implementation unit; users do not install packages through the app.
- **Harness feature:** a named, versioned, source-controlled application capability composed from one or more extension factories/paths, skills, prompts, UI adapters, or MCP services.
- **Feature setting:** a typed, application-owned option that changes documented behavior of one named baked feature without changing whether or how its code is loaded.
- **Built-in extension:** a Pi extension factory or path supplied by a harness feature.
- **MCP server:** an external process or HTTP service implementing Model Context Protocol. Pi has no core MCP API; an extension/adapter presents MCP capabilities as Pi tools.
- **Application plugin:** not supported. The harness has no third-party desktop-plugin API.

Do not call every one of these a “plugin” in code or UI. The security and lifecycle behavior differs.

## Goals

- Preserve Pi extension, skill, prompt, session, model, and context formats where they help interoperability.
- Make the active feature set explicit in source and reproducible from the lockfile/build.
- Prevent user/project Pi settings from silently adding executable features to the harness.
- Report baked feature identity, version, and load/compatibility failures through internal diagnostics.
- Keep MCP behind feature-owned internal adapters so third-party implementations can change.
- Keep the implementation small: one manifest and Pi's loader, not a custom plugin platform.

## Non-goals for v1

- installing, updating, enabling, disabling, or removing packages/resources at runtime;
- a Resources store, catalog, command launcher, or reload screen;
- automatic auditing, signing, or trust scoring;
- editing arbitrary extension source in the app;
- inheriting arbitrary global/project extensions, skills, prompts, packages, or MCP configuration;
- running terminal-only custom extension components inside React;
- dynamically loading React code from extensions;
- accepting arbitrary MCP server configuration; specified servers are baked later as features.
- a generic settings registry, schema renderer, JSON key/value editor, or extension-owned React settings panel.

## Feature composition

The runtime creates one Pi context per effective workspace, but executable feature composition comes only from a source-controlled manifest. Configure `DefaultResourceLoader` with `noExtensions`, `noSkills`, `noPromptTemplates`, and `noThemes`, then pass the manifest's `additionalExtensionPaths`, `extensionFactories`, and `additionalPromptTemplatePaths`. Built-in skill paths come from the manifest. Milestone 4's `SkillSourceRegistry` may append only validated text-only paths from fixed, explicitly enabled Codex/Cursor/Claude/Pi user roots; it is not Pi's ambient discovery and cannot add scripts, extensions, prompts, themes, packages, or MCP servers. Keep project context files such as `AGENTS.md` enabled because they describe the workspace rather than extending the harness. Renderer light/dark/system theme is application state, not a Pi theme resource.

Conceptual manifest:

```ts
interface HarnessFeature {
  id: string;
  version: string;
  extensionFactories?: readonly InlineExtension[];
  extensionPaths?: readonly string[];
  skillPaths?: readonly string[];
  promptPaths?: readonly string[];
  mcp?: HarnessMcpFeature;
}

interface HarnessFeatureManifest {
  features: readonly HarnessFeature[];
}
```

The composition root owns exactly one manifest. Runtime code flattens it into Pi loader options and records feature diagnostics. The renderer never receives executable factories or mutable resource controls.

Feature composition and feature settings are separate inputs. The manifest answers “what code exists in this build?” and is immutable at runtime. A typed settings adapter answers “how should this baked feature behave for this owner?” and may read/write only the documented data owned by that adapter.

## Internal feature snapshot

Diagnostics may expose a minimal serializable feature record:

```ts
interface HarnessFeatureSummary {
  id: string;
  version: string;
  status: "loaded" | "degraded" | "failed";
  diagnostics: ResourceDiagnostic[];
}
```

This is an About/Diagnostics record, not a composition model. It has no install source, arbitrary reload action, or executable command list. A separate typed settings snapshot may expose skill-source trust flags, baked GitHub MCP enabled state, and agent-tool sandbox policy. Those controls cannot add package paths or MCP server definitions; sandbox extra read/write lists are the bounded exception. Renderer records must not include factories, imported modules, credential values, canonical external-skill paths, arbitrary error objects, or Pi class instances.

## Baked feature seam

`HarnessFeatureManifest` is the only composition input. Use a named inline factory for application-owned integration code. Use an explicit packaged path when a third-party Pi package is the implementation unit.

The first shipped features are:

```ts
const permissionFeature: HarnessFeature = {
  id: "permission-system",
  version: "24.0.0",
  extensionPaths: [resolvedBundledPermissionPackage],
};

const trashFeature: HarnessFeature = {
  id: "recoverable-trash",
  version: "1.0.0",
  inlineFactory: "recoverable-trash",
};

const retrievalFeature: HarnessFeature = {
  id: "local-retrieval",
  version: "1.0.0",
  inlineFactory: "local-retrieval",
};

const webFeature: HarnessFeature = {
  id: "pho-web",
  version: "1.2.0",
  inlineFactory: "pho-web",
};

const cursorSdkFeature: HarnessFeature = {
  id: "cursor-sdk",
  version: "0.2.0",
  extensionPaths: [resolvedBundledCursorSdkPackage],
};
```

### Two-stage runtime composition

`createDefaultFeatureManifest` supplies the stable base features: permission system, Cursor SDK provider, recoverable Trash, pho-web, curated Pho Code skill resources, and local retrieval when its workspace service is available.

`createPhoCodeRuntime` then appends application-wired inline features whose factories need live runtime services:

- `skill-invoke` registers `read_skill` over `SkillSourceRegistry`; `/` inserts a source-qualified token and runtime expands/loads the selected text skill on demand;
- `github-read` binds the fixed allowlisted GitHub MCP tools only while the packaged server and credential state are ready;
- `context-prompt` always registers `before_agent_start` at resource-loader reload, then re-injects the compiled per-session prompt from the live session id/cwd and applies active-tool selection before each run;
- `change-capture` observes Pi `write`/`edit` for the accepted V3 ledger.

These are still immutable source-selected capabilities. They are assembled in two stages because they depend on runtime-owned services, not because users or projects can install them. Ambient Pi extension/skill/MCP discovery remains disabled. The V3 feature's accepted recovery limits remain in [`../archive/v3/`](../archive/v3/README.md).

`@gotgenes/pi-permission-system` must be an exact application dependency and must be staged with its package manifest, `src`, runtime dependencies, schema/config assets, and license. The Pi loader should load that staged package/path explicitly. Do not rely on `npm:@gotgenes/pi-permission-system` in `~/.pi/agent/settings.json`, global npm lookup, or runtime installation.

`pi-cursor-sdk` `0.2.0` is baked the same way: pin the exact package, stage it under app-owned `Resources/features/pi-cursor-sdk` with nested `@cursor/sdk` (and the current-platform `@cursor/sdk-*` binary package), and load only through the manifest. Harness policy forces `PI_CURSOR_RUNTIME=local` and `PI_CURSOR_SETTING_SOURCES=none` so Cursor Cloud and ambient `~/.cursor` MCP/plugins/rules stay out of product scope. Cursor host tools are not gated by the permission-system feature; bridged Pho Code tools still are. Selecting a `cursor/*` model always shows a warning dialog before the session model binding changes. Settings → Accounts lists Cursor at harness boot (API-key import only); the extension still supplies the live model catalog when a session binds. Cursor Desktop/CLI login is not supported by `@cursor/sdk`—only a Dashboard or service-account API key.

The application-owned Trash feature registers the `move_to_trash` tool through a named inline factory. It uses `/usr/bin/trash` on macOS and `trash-put` then `gio trash` on Linux, never `rm`. Missing or failing Trash on a platform degrades that tool with a diagnostic; the rest of the session continues. The runtime still does not import Electron for filesystem or process launch.

The application-owned local-retrieval feature wraps pinned `@ff-labs/fff-node` `0.10.1`. One `FileFinder` per active workspace serves additive `fffind` / `ffgrep` / `fff-multi-grep` tools and the typed `searchWorkspaceReferences` command. Pho Code does not load `@ff-labs/pi-fff` because that extension owns a second index and TUI `@` autocomplete this host no-ops. Index and frecency state live under application data `retrieval/<workspace-hash>/`, never in packaged resources or another Pi installation’s default FFF database. Native lookup failure degrades the feature; ordinary chat continues.

The application-owned `pho-web` feature registers additive `web_search` and `fetch_content` tools. Search fans out in parallel across keyless DuckDuckGo HTML/Lite, Bing, Brave, Mojeek, and Jina, then merges unique URLs. Fetch is a public `http:`/`https:` GET with DNS/SSRF, redirect, timeout, and size limits, then Readability/Turndown extraction; YouTube watch/shorts URLs return public captions and metadata when available; thin HTML retries through Jina Reader. Jina discloses the query or URL to jina.ai. Pho Code does not load `pi-web-access`; Exa MCP, Codex/OpenAI search, browser cookies, GitHub cloning, PDF conversion, and Gemini video understanding remain unavailable. Requests originate in the privileged runtime; the renderer `connect-src 'self'` policy is unchanged.

The package currently exposes its service API at the package root while its Pi extension factory is declared by the package's `pi.extensions` manifest. Resolve/package it as a Pi package resource; do not import the root service and assume it is the extension factory. If packaging the published package cannot provide a stable manifest path, add a narrow application adapter or request an upstream factory export rather than reaching through undocumented internal paths throughout the runtime.

Immutable shipped files belong in application resources and are located through `ResourceLocator`. Packaged builds use `createPackagedResourceLocator` rooted at Electron `process.resourcesPath` (`Resources/features/<package>`) and do not fall back to `node_modules` or user-global Pi packages. Source-tree and workspace `node_modules` paths remain development/test locators only. The lockfile/app version controls updates. There is no runtime install/update path. Missing packaged features fail closed with named diagnostics.

The same rule applies to every resource type:

- extensions ship as pinned package resources or application-owned factories;
- Pho Code-authored skills and prompts ship as immutable application resources discovered by `SkillSourceRegistry`; they are available for `/` insert rather than Pi `additionalSkillPaths`. Milestone 4 external text-only skills remain mutable user-owned instructions read through fixed trusted source adapters, not packaged features;
- MCP adapters and servers ship with the code/assets needed for their selected transports, unless a named operating-system dependency is an explicit product requirement;
- feature licenses and notices ship with the application (`docs/third-party-notices.md` and `Contents/Resources/THIRD_PARTY_NOTICES.txt` in the macOS artifact);
- missing user-global Pi packages never change harness capability.

## Reload behavior

The normal product has no generic feature Reload action because the executable manifest is immutable for the running build. Milestone 4's explicit **Refresh skills** action rereads only enabled fixed text-skill roots and recomputes provenance/compatibility for the `/` catalog and named load. It does not rebind session controllers or change a running prompt. Applying another supported feature setting may internally reload/rebind idle sessions; that lifecycle action is not exposed as generic composition control. Development may restart Electron to pick up built-in feature source changes. A future signed app update may replace the whole baked feature bundle; it must not mutate feature code inside a running session.

## Feature settings boundary

Each settings surface is explicit in the protocol and application UI. Use named commands such as `updatePermissionSettings`, not `setSetting(key, value)`. The runtime adapter owns validation, storage location, migration, and apply/reload behavior for its pinned feature version. The renderer receives a redacted settings snapshot and sends typed intent; it never reads/writes config files.

The first adapter targets the permission package's global config at `<agentDir>/extensions/pi-permission-system/config.json`. The default `agentDir` is Pho Code-owned under Electron `userData/pi-agent`; `PHO_CODE_AGENT_DIR` is an explicit external/shared override. The UI discloses the active scope. A project permission override is skipped until the owner explicitly trusts that project's permission rules. Adding or reopening such a workspace opens a confirmation dialog; deferring it leaves a banner, and Settings can reopen the same prompt. Pho Code remembers this narrow decision in its own metadata; it does not write Pi's shared `trust.json`, enable project extensions, or edit the project override.

The permission engine is rule-based rather than scalar. Settings exposes baby (strict), okay, you got it, and with great power comes great responsibility while retaining stable `guarded`, `balanced`, and `developer` keys. Unmatched policies, pre-v3 Developer-without-YOLO policies, and YOLO combined with a different stable key are preserved as Custom. The third mode explicitly selects `developer` and enables YOLO, which rewrites `ask` decisions while preserving explicit denies. Preserve fields the simple UI does not own, refuse to overwrite invalid/unrecognized config, and apply updates atomically. Do not show `doublePressToConfirm`; the pinned package documents it as TUI-only and it does not affect this RPC/frontend host.

The internal `developer` policy remains the v2 daily-driver template: ordinary workspace reads/edits, reviewed inspection and validation command families, and the application-owned `move_to_trash` tool are allowed inside the selected workspace. Public `web_search` is allowed; `fetch_content` asks because it performs an HTTP GET. `ask_user_question`, `update_plan_document`, `todo`, and `execute_plan` are always allowed — they are the owner prompt, not a grant. Runtime start writes those harness allows (and the managed web pair) onto an existing managed config so `"*": "ask"` cannot catch a tool that Settings already treats as part of the preset. It also appends the sandbox authorizer name `pho-code-sandbox` to `authorizerChain` so a healthy Seatbelt wrap can skip bash and in-policy file-tool **asks** without converting **denies**. See [`../archive/features/sandbox`](../archive/features/sandbox/README.md). Every managed template explicitly denies permanent-removal commands with the reason “Permanent removal is unavailable. Use the move_to_trash tool.” Sensitive paths, external directories, privilege escalation, and publication remain asked or denied.

## Extension UI compatibility

The desktop host implements only structured interactions required by baked features. For the permission-system feature this means:

- `select` for Approve once / Approve for session / Deny / Deny with reason;
- `input` for an optional denial reason;
- `confirm` for other curated feature decisions where needed;
- notification and status projection.

The Plan/Agent add-on implements an extra structured `questionnaire` request plus Plan/Agent tool policy, a session `todo` tool, and Plan-only `execute_plan` in source (not accepted): JSON-safe questions/answers on the same one-dialog lifecycle, distinct chrome from permission copy; Plan drops `write` / `edit` / `move_to_trash` / Cursor SDK tools. `custom` and `editor` still throw. See [`../features/plan-agent`](../features/plan-agent/README.md).

The host does not implement multiline editor, widgets, editor mutation, arbitrary `@earendil-works/pi-tui` components, or the permission package's terminal-only configuration modal unless a later baked feature requires a specific structured equivalent. If a feature calls `ctx.ui.custom`, terminal input hooks, custom editor components, or another unsupported method, record a typed compatibility diagnostic and throw a real `Error` with a useful message. Never throw a plain protocol data record that downstream code renders as `[object Object]`.

All dialog variants use a shared request lifecycle: one request ID, serialized modal presentation, AbortSignal and timeout handling, Escape/cancel settlement, focus containment/restoration, and cancellation during session replacement or app shutdown. The feature owns the decision semantics; the host only transports options and the selected/input result.

An extension that guards behavior using `ctx.mode` or `ctx.hasUI` should be allowed to degrade normally. Do not fake a TUI mode.

The runtime must call the pinned SDK's public extension-binding API with an `ExtensionUIContext`, RPC-compatible mode, and command-context actions where required. The binding is session-owned. Any new/resumed/forked/imported session that replaces `AgentSessionRuntime.session` must cancel stale dialog promises, bind the replacement, refresh commands, and subscribe again before accepting host-UI-dependent work.

## MCP seam

Milestone 4 slice 2 implements the first exact MCP integration: read-only GitHub repository, issue, pull-request, review, check, workflow, and bounded Actions-log investigation. It follows the same baked-feature rule. There is no generic MCP manager. The application-owned runtime is `GitHubMcpRuntime`:

```ts
interface GitHubMcpRuntime {
  snapshot(): GitHubMcpSettingsSnapshot;
  shouldBindTools(): boolean;
  setEnabled(enabled: boolean): Promise<GitHubMcpSettingsSnapshot>;
  importPat(token: string): Promise<GitHubMcpSettingsSnapshot>;
  logout(): Promise<GitHubMcpSettingsSnapshot>;
  callTool(input: GitHubMcpCallInput): Promise<{ text: string }>;
  dispose(): Promise<void>;
}
```

The Pi-facing implementation is an inline factory (`github-read`) that registers allowlisted `github_` tools only while the shared server is ready. The official `@modelcontextprotocol/sdk` `1.30.0` stdio client talks to a pinned `github/github-mcp-server` `v1.9.0` binary as `stdio --read-only --lockdown-mode --toolsets context,repos,issues,pull_requests,actions`. `.mcp.json` discovery and arbitrary server configuration remain disabled. A PAT lives in the OS secret store; the renderer never receives it. Development stages that binary with `bun run stage:github-mcp`; packaging stages the same pin. The running app never downloads it.

When a specific MCP feature is implemented:

- start servers lazily unless a product requirement needs eager status;
- never execute unpinned `npx -y` packages for a baked-in server;
- distinguish disabled, starting, ready, needs-auth, degraded, and failed states for the baked server;
- redact headers, bearer tokens, environment secrets, and server stderr;
- bound requests and support cancellation;
- keep the GitHub stdio process application-owned; idle session controllers rebind tools, and shutdown closes the exact child;
- expose only the tools selected for that feature;
- keep tool approval behavior honest: it gates calls, not extension code execution.

## Lifecycle and ownership

- Global services may be shared only when their SDK contract supports it.
- Workspace resource loaders are owned by a workspace runtime context.
- Session extension runners, host-dialog queues, run state, prepared attachments, and UI projections are owned by a session controller. The accepted Milestone 3 registry may keep several such controllers resident; selecting one must not transfer or dispose another controller's state.
- Long-lived resources should be created on session start and cleaned up on session shutdown according to Pi extension guidance.
- A Pi-internal session replacement must rebind that controller's new session. Ordinary Pho Code chat switching selects another controller and is not a Pi session replacement.
- An app shutdown disposes all session controllers before shared services under one bounded aggregate deadline.
- A failed extension must not prevent unrelated diagnostics or sessions from being shown when Pi can continue safely.

## Trust statement

The owner chooses feature code during development; end users cannot add feature code at runtime. Baked extensions still execute with the application's local permissions, baked skills may cause the model to use tools, and baked MCP services may access local programs or remote accounts. Renderer sandboxing and permission dialogs do not sandbox feature code.

A chosen workspace supplies files and context, not extensions/skills/prompts/packages. Test that project and global Pi feature settings do not expand the manifest. Permission decisions gate tool calls according to the baked permission feature; they are operational safety decisions, not feature customization. Stronger runtime isolation remains future production work.

## Adding a future feature

When requested:

1. The owner specifies the capability and it receives a stable feature ID.
2. Decide whether Pi package/path, inline factory, skill/prompt files, MCP service, or a small combination is the right implementation.
3. Pin every third-party version and record its license/provenance.
4. Add it to the source-controlled manifest and immutable resource packaging.
5. Define narrow service dependencies, tool schemas, serializable results, abort, and shutdown behavior.
6. Add the smallest runtime check for its lifecycle and one desktop check for any new host UI shape.
7. Expose feature health/version in diagnostics and only deliberately designed behavior settings. A baked service may have a named connection/tool-exposure toggle, and a fixed text-only skill source may have a named trust toggle; never expose install controls, arbitrary composition, executable paths, or server definitions.
8. Update this document if the feature introduces a new host capability.

## Primary references

- [Pi extensions](https://pi.dev/docs/latest/extensions)
- [Pi skills](https://pi.dev/docs/latest/skills)
- [Pi packages](https://pi.dev/docs/latest/packages)
- [Pi SDK resource loader](https://pi.dev/docs/latest/sdk)
- [Pi security](https://pi.dev/docs/latest/security)
- [Pi MCP adapter package page](https://pi.dev/packages/pi-mcp-adapter)
