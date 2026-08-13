# Extension model

## Current implementation status

Personal v1 is accepted through Milestone 5. Ordinary global/project feature discovery is disabled, `HarnessFeatureManifest` is the only executable composition input, and `@gotgenes/pi-permission-system` `24.0.0` is the first baked feature. Typed settings change supported baked-feature behavior without making the feature set customizable, and packaged builds resolve that feature only from app-owned resources. See the [Milestone 5 review](./reviews/milestone-5-code-review.md).

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

The runtime creates one Pi context per effective workspace, but executable feature composition comes only from a source-controlled manifest. Configure `DefaultResourceLoader` with `noExtensions`, `noSkills`, `noPromptTemplates`, and `noThemes`, then pass the manifest's `additionalExtensionPaths`, `extensionFactories`, `additionalSkillPaths`, and `additionalPromptTemplatePaths`. Keep project context files such as `AGENTS.md` enabled because they describe the workspace rather than extending the harness. Renderer light/dark/system theme is application state, not a Pi theme resource.

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

This is an About/Diagnostics record, not a composition model. It has no enabled flag, install source, reload action, or executable command list. A separate settings snapshot may expose supported behavior values. Renderer records must not include factories, imported modules, credential values, arbitrary error objects, or Pi class instances.

## Baked feature seam

`HarnessFeatureManifest` is the only composition input. Use a named inline factory for application-owned integration code. Use an explicit packaged path when a third-party Pi package is the implementation unit.

The first feature is:

```ts
const permissionFeature: HarnessFeature = {
  id: "permission-system",
  version: "24.0.0",
  extensionPaths: [resolvedBundledPermissionPackage],
};
```

`@gotgenes/pi-permission-system` must be an exact application dependency and must be staged with its package manifest, `src`, runtime dependencies, schema/config assets, and license. The Pi loader should load that staged package/path explicitly. Do not rely on `npm:@gotgenes/pi-permission-system` in `~/.pi/agent/settings.json`, global npm lookup, or runtime installation.

The package currently exposes its service API at the package root while its Pi extension factory is declared by the package's `pi.extensions` manifest. Resolve/package it as a Pi package resource; do not import the root service and assume it is the extension factory. If packaging the published package cannot provide a stable manifest path, add a narrow application adapter or request an upstream factory export rather than reaching through undocumented internal paths throughout the runtime.

Immutable shipped files belong in application resources and are located through `ResourceLocator`. Packaged builds use `createPackagedResourceLocator` rooted at Electron `process.resourcesPath` (`Resources/features/<package>`) and do not fall back to `node_modules` or user-global Pi packages. Source-tree and workspace `node_modules` paths remain development/test locators only. The lockfile/app version controls updates. There is no runtime install/update path. Missing packaged features fail closed with named diagnostics.

The same rule applies to every resource type:

- extensions ship as pinned package resources or application-owned factories;
- skills/prompts ship as immutable application resources with explicit manifest paths;
- MCP adapters and servers ship with the code/assets needed for their selected transports, unless a named operating-system dependency is an explicit product requirement;
- feature licenses and notices ship with the application (`docs/third-party-notices.md` and `Contents/Resources/THIRD_PARTY_NOTICES.txt` in the macOS artifact);
- missing user-global Pi packages never change harness capability.

## Reload behavior

The normal product has no feature Reload action because the manifest is immutable for the running build. Applying a supported feature setting may internally reload/rebind the active session while idle; that lifecycle action is not exposed as a generic feature control. Development may restart Electron to pick up feature source changes. A future signed app update may replace the whole feature bundle; it must not mutate feature code inside a running session.

## Feature settings boundary

Each settings surface is explicit in the protocol and application UI. Use named commands such as `updatePermissionSettings`, not `setSetting(key, value)`. The runtime adapter owns validation, storage location, migration, and apply/reload behavior for its pinned feature version. The renderer receives a redacted settings snapshot and sends typed intent; it never reads/writes config files.

The first adapter targets the permission package's global config at `<agentDir>/extensions/pi-permission-system/config.json`. The default `agentDir` is Pho Code-owned under Electron `userData/pi-agent`; `PHO_CODE_AGENT_DIR` is an explicit external/shared override. The UI discloses the active scope. Milestone 4 edits this global-within-the-active-agent-root config only and reports the presence of a trusted workspace override without editing it.

The permission engine is rule-based rather than scalar. Expose reviewed Guarded and Balanced policy templates, detect unmatched policy as Custom, and keep YOLO separate because it rewrites `ask` decisions while preserving explicit denies. Preserve fields the simple UI does not own, refuse to overwrite invalid/unrecognized config, and apply updates atomically. Do not show `doublePressToConfirm`; the pinned package documents it as TUI-only and it does not affect this RPC/frontend host.

## Extension UI compatibility

The desktop host implements only structured interactions required by baked features. For the permission-system feature this means:

- `select` for Approve once / Approve for session / Deny / Deny with reason;
- `input` for an optional denial reason;
- `confirm` for other curated feature decisions where needed;
- notification and status projection.

The host does not implement multiline editor, widgets, editor mutation, arbitrary `@earendil-works/pi-tui` components, or the permission package's terminal-only configuration modal unless a later baked feature requires a specific structured equivalent. If a feature calls `ctx.ui.custom`, terminal input hooks, custom editor components, or another unsupported method, record a typed compatibility diagnostic and throw a real `Error` with a useful message. Never throw a plain protocol data record that downstream code renders as `[object Object]`.

All dialog variants use a shared request lifecycle: one request ID, serialized modal presentation, AbortSignal and timeout handling, Escape/cancel settlement, focus containment/restoration, and cancellation during session replacement or app shutdown. The feature owns the decision semantics; the host only transports options and the selected/input result.

An extension that guards behavior using `ctx.mode` or `ctx.hasUI` should be allowed to degrade normally. Do not fake a TUI mode.

The runtime must call the pinned SDK's public extension-binding API with an `ExtensionUIContext`, RPC-compatible mode, and command-context actions where required. The binding is session-owned. Any new/resumed/forked/imported session that replaces `AgentSessionRuntime.session` must cancel stale dialog promises, bind the replacement, refresh commands, and subscribe again before accepting host-UI-dependent work.

## MCP seam

MCP is deferred until the owner names the exact integrations. It follows the same baked-feature rule, with an internal boundary:

```ts
interface McpRuntime {
  start(context: McpContext): Promise<void>;
  getSnapshot(): McpSnapshot;
  reload(): Promise<McpSnapshot>;
  subscribe(listener: (event: McpEvent) => void): () => void;
  dispose(): Promise<void>;
}
```

The Pi-facing implementation is a factory registered by a named feature. A third-party adapter may be wrapped and exactly pinned, but its `.mcp.json` discovery and arbitrary server configuration must be disabled or bypassed. Each feature declares its fixed servers, transports, tools, lifecycle, and any required account/auth flow in source.

When a specific MCP feature is implemented:

- start servers lazily unless a product requirement needs eager status;
- never execute unpinned `npx -y` packages for a baked-in server;
- distinguish cached, connecting, connected, needs-auth, and failed states for the baked server;
- redact headers, bearer tokens, OAuth codes, environment secrets, and server stderr as appropriate;
- bound requests and support cancellation;
- disconnect/terminate session-owned clients on disposal;
- expose only the tools selected for that feature;
- keep tool approval behavior honest: it gates calls, not extension code execution.

## Lifecycle and ownership

- Global services may be shared only when their SDK contract supports it.
- Workspace resource loaders are owned by a workspace runtime context.
- Session extension runners and UI state are owned by a session.
- Long-lived resources should be created on session start and cleaned up on session shutdown according to Pi extension guidance.
- A session replacement must rebind the new session.
- An app shutdown disposes sessions before shared services.
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
7. Expose feature health/version in diagnostics and only deliberately designed behavior settings; never expose enable/install/composition controls.
8. Update this document if the feature introduces a new host capability.

## Primary references

- [Pi extensions](https://pi.dev/docs/latest/extensions)
- [Pi skills](https://pi.dev/docs/latest/skills)
- [Pi packages](https://pi.dev/docs/latest/packages)
- [Pi SDK resource loader](https://pi.dev/docs/latest/sdk)
- [Pi security](https://pi.dev/docs/latest/security)
- [Pi MCP adapter package page](https://pi.dev/packages/pi-mcp-adapter)
