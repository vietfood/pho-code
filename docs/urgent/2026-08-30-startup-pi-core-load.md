# Startup — Pho Agent and Pi core load is dominated by the public SDK barrel

**Kind:** startup
**Status:** Investigated 2026-08-30; Pi pin moved to `0.84.4`; remaining library-path cost is unchanged
**Related:** archived [`window-first-pi-core`](../archive/urgent/window-first-pi-core/README.md) (window paints before the dynamic import; elapsed time was never claimed); [`2026-08-28-defect-web-url-test-timeout.md`](./2026-08-28-defect-web-url-test-timeout.md) (measured 9.3 s cold module-graph stall); V5 pin record [`../version/v5/logs/2026-08-30-pi-sdk-0.84.4.md`](../version/v5/logs/2026-08-30-pi-sdk-0.84.4.md); compaction pin note [`../features/compaction/logs/2026-08-30-pi-pin-0.84.4.md`](../features/compaction/logs/2026-08-30-pi-pin-0.84.4.md)

## What is slow

Window-first already moved `@pho-code/runtime` off the eager Electron main entry. The remaining wait is that background `import("@pho-code/runtime")`, which evaluates:

1. Pho Agent's Pi service barrel (`@pho-agent/runtime` → `@earendil-works/pi-coding-agent`);
2. Pho Code's product runtime barrel (FFF, MCP SDK, sandbox, web, Codex/ACP factories).

Pi is **externalized** from the Electron Vite bundle (`electron.vite.config.ts` `externalAgentRuntimePackages`), so Electron's Node loader stats and compiles the SDK from `node_modules` instead of a pre-bundled chunk. The public package has one export (`.`) whose `dist/index.js` re-exports CLI args, `main`, InteractiveMode, every TUI component, theme/highlight.js, and `createExtensionRuntime`.

That last export is the load-time trap. `dist/core/extensions/index.js` re-exports `loader.js`, and the loader **statically** imports:

- `jiti/static` (~1.7 MiB);
- `@earendil-works/pi-tui` (~2.6 MiB);
- `@earendil-works/pi-ai/providers/all` (the full provider catalog);
- typebox compile/value;
- a circular `../../index.js` so extensions see the same fat barrel.

`@pho-agent/runtime/src/feature-api.ts` imports `defineTool` from that package root, so **any** Pho Agent/Pho Code runtime import pays for TUI + jiti + every provider even though the desktop never uses Pi's TUI.

Installed 0.84.1 sizes (warm page cache, Node from `packages/pho-agent/packages/runtime`):

| Import | Node | Bun |
| --- | --- | --- |
| `@earendil-works/pi-ai` | 97–105 ms | 56 ms |
| `@earendil-works/pi-agent-core` | 119–124 ms | — |
| `@earendil-works/pi-coding-agent` barrel | 417–425 ms | 278 ms |
| `@pho-agent/runtime` source | — | 284 ms |
| `@pho-code/runtime` source | — | 475 ms |

Pi `dist` is 11 MiB / 201 JS files at 0.84.1 (256 JS files at 0.84.4). Those warm numbers match a hot disk cache. After a full Electron build churned the page cache, the same graph stalled the event loop for **9.3 s** ([lane timeout defect](./2026-08-28-defect-web-url-test-timeout.md)). That is the cold-start the owner feels.

Pi 0.84.3 reduced **CLI** startup by shipping `dist/bundle/cli.js` and lazy-loading jiti/Babel there, "keeping the public library and legacy module paths on the modular runtime." The library path this product imports is explicitly the slow path. highlight.js did shrink from `lib/index.js` to twenty eager languages, which is noise next to the loader.

## Pin upgrade

npm latest on 2026-08-30 is `@earendil-works/pi-coding-agent` `0.84.4` (with matching `pi-ai` / `pi-agent-core`). This slice pins that exact version. `engines.node` remains `>=22.19.0`. Default tools remain `read` / `bash` / `edit` / `write`; the new Windows `powershell` tool is not in `createCodingTools`.

Warm remeasure after 0.84.4:

| Import | Node | Bun |
| --- | --- | --- |
| `@earendil-works/pi-coding-agent` | 439 ms | 239 ms |
| `@pho-agent/runtime` | — | 248 ms |
| `@pho-code/runtime` | — | 436 ms |

The library loader still statically imports jiti, pi-tui, and `providers/all`. The pin is a reviewed SDK upgrade, not a load-time fix.

## Remaining handoff (not done here)

A later startup slice can cut the wait without absorbing V4's utility-process extraction:

1. Stop importing Pi's public barrel for `defineTool` / session factories — needs a supported library export Pi does not ship today, or a reviewed internal-path exception;
2. Stop externalizing the SDK and let Rollup tree-shake TUI/jiti, keeping native modules (`photon-node`, `ffi-rs`) external;
3. Narrow `@pho-code/runtime`'s dynamic-import graph so GitHub MCP / FFF / sandbox are not evaluated before they are needed.

Do not describe Electron renderer sandboxing or window-first ordering as a fix for this cost. Pi still runs in Electron main.
