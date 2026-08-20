# Desktop shell decision: Electron for v1

## Decision

Use Electron for the personal v1. Keep the renderer and runtime contract shell-neutral so a future Tauri shell remains possible.

Status: shell decision and personal v1 are accepted. The Electron shell hosts the Pi `0.84.1` runtime behind the typed bridge. Milestones 1 through 4 added workspace/session/prompt, baked features, permission host UI, the revised conversation shell, and typed appearance/permission settings without changing the renderer sandbox, context isolation, or bounded quit controls. Milestone 5 packages that shell as an unsigned local macOS `.app` with app-owned feature resources and in-app API-key import. v2 Milestone 2 is accepted: provider-owned OAuth uses the same validated `http:`/`https:` system-browser path; the renderer never receives authorization URLs. v2 Milestone 3 is accepted: independently owned session controllers continue in the background; archive/restore and OS-Trash chat removal stay behind the typed bridge.

The current shell pins Electron `43.4.0` and `@earendil-works/pi-coding-agent` `0.84.1`. The original bootstrap milestone is accepted. See the archived [v1 Milestone 0 code review](../archive/v1/reviews/milestone-0-code-review.md). Accepted V3 change review uses the same typed-bridge seam; its immutable command, ledger, and recovery record lives under [`archive/v3`](../archive/v3/README.md).

## Drivers

The harness must support:

- the Node/TypeScript Pi SDK;
- baked TypeScript Pi extension features;
- baked Pi skills and package resources;
- model/provider libraries with Node dependencies;
- GitHub MCP stdio through the official MCP TypeScript client;
- future PTY integration as specified by the [terminal add-on](../features/terminal/README.md);
- a React renderer;
- macOS-first development and Linux compatibility.

Developer speed and runtime compatibility matter more in v1 than installer size or a Rust-native core.

## Options considered

### Electron

Electron embeds Chromium and Node.js. Its main process is a Node environment, while each browser window gets a renderer process. A preload script with `contextBridge` can expose a narrow typed API. Electron also provides a Node-based utility process if the Pi runtime later needs crash isolation without changing technology stacks.

Consequences for this project:

- direct Pi SDK imports work in the privileged JavaScript layer;
- baked Pi extensions run in their expected Node environment;
- GitHub MCP stdio uses the official MCP client over a packaged native binary;
- React and existing web component patterns fit directly;
- one TypeScript toolchain covers most v1 code;
- Electron and Chromium increase application size and memory use;
- native modules must be rebuilt for Electron's ABI;
- main/preload/renderer boundaries must be enforced deliberately.

### Tauri

Tauri uses a Rust core and the operating system WebView. It can produce a smaller application and offers explicit frontend-to-core capabilities.

Pi is still a Node SDK. A Tauri implementation would therefore need one of:

1. a bundled, long-lived Node sidecar running the Pi SDK;
2. a bundled Pi RPC subprocess; or
3. a substantial reimplementation in Rust, which is rejected.

Official Tauri guidance for Node sidecars requires packaging target-specific external binaries. Long-lived process communication needs an additional protocol beyond the simple short-lived example. The Rust/WebView capability model controls calls into Rust; it does not sandbox arbitrary Pi extension code running inside the Node sidecar.

Consequences:

- more packaging targets and runtime lifecycle code before the first prompt;
- Rust-to-Node-to-WebView communication and error handling;
- OS WebView variation between macOS and Linux;
- no removal of the Node runtime because Pi still requires it;
- a potentially attractive mature shell after the runtime protocol is proven.

## Why Electron wins now

Electron's larger bundle is a known cost. Tauri's sidecar, cross-language IPC, target-triple binaries, and curated-feature packaging are product risks for the first usable build. They do not buy isolation for Pi extensions by themselves.

Pi's own documentation recommends direct `AgentSession`/SDK use for Node and TypeScript applications; RPC is the alternative when process or language isolation is needed. Electron matches the direct path.

## Version constraint

The selected Electron version must embed a Node version satisfying the exact pinned Pi SDK's `engines.node` requirement. At the time of this decision, current Pi source declares Node `>=22.19.0`. Do not infer compatibility from the developer's system Node; verify Electron's embedded version during dependency selection and in a test.

Milestone 0 pins:

- Electron `43.4.0`, whose embedded Node is 24.x and therefore satisfies `>=22.19.0`;
- bun `1.3.14` as the workspace package manager and unit-test runner;
- intended Pi SDK `@earendil-works/pi-coding-agent` `0.84.1` for Milestone 1 (installed exactly; `engines.node` `>=22.19.0`).

The running app reports embedded Node `24.18.1`, satisfying the recorded Pi engine floor. The version appears in the bootstrap state produced from `process.versions`, and the desktop smoke test asserts embedded-Node compatibility.

Bun does not replace Electron's embedded Node. The desktop app and Pi SDK execute on Electron's Node. Unit tests for JSON-safe protocol and application logic may run under bun; runtime integration tests that import Pi must run on a Node that satisfies the SDK engine, typically Electron's embedded Node.

Pin Electron and Pi exactly during bootstrap. Upgrades require:

- reviewing both changelogs;
- typecheck and runtime integration tests;
- Electron smoke tests;
- native-module rebuild checks when native dependencies exist.

## Required Electron configuration

Every application window must use:

```ts
{
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    preload: resolvedPreloadPath
  }
}
```

Also require:

- local renderer assets rather than remote pages;
- a restrictive CSP;
- default-deny Chromium permission handlers, with a narrow allow for `clipboard-sanitized-write` so transcript/code copy buttons can use `navigator.clipboard.writeText`;
- navigation and new-window interception;
- validated `http:`/`https:` external links opened through the OS;
- sender and payload validation for privileged IPC;
- no raw `ipcRenderer` exposure;
- no privileged behavior based only on renderer-provided paths.

These controls protect the renderer boundary. They are not a sandbox for Pi extensions running in the privileged runtime.

The source configures these preferences, a header-based CSP, exact renderer URL/origin comparison, and bounded runtime disposal. Security, navigation, permission, and shutdown behavior are covered by the desktop test lane. The application menu is owned by `apps/desktop/electron/application-menu.ts`: window Reload uses CommandOrControl+Shift+R so CommandOrControl+R can toggle the right sidebar in the renderer.

## Migration seam

The following must not depend on Electron:

- protocol types;
- application use cases;
- Pi runtime and event normalization;
- metadata interfaces;
- process and resource-location interfaces;
- React view components beyond a single bridge provider.

The portable contract uses JSON-safe commands and sequenced events. Electron implements it through preload and IPC. A future Tauri adapter may implement it through `invoke` plus events/channels while running `HarnessRuntime` as a Node sidecar or using Pi RPC.

Do not expose Electron objects or rely on Structured Clone-only values; doing so would make the nominally portable contract Electron-specific.

## When to revisit

Startup ordering and crash isolation of in-process Pi are **not** shell changes. Archived [`window-first-pi-core`](../archive/urgent/window-first-pi-core/README.md) owns the accepted same-process startup order: load metadata/IPC/window before dynamically importing and constructing Pi. Its desktop behavior is verified; packaged behavior and elapsed-time measurements were explicitly not verified at closure. Extracting the complete `HarnessRuntime` into another process is deferred to roadmap Phase F. Bounded Stop, Stop-all, and bounded teardown are already accepted under archived [`agent-stop`](../archive/urgent/agent-stop/README.md); neither they nor window-first ordering can survive a frozen main-process Pi.

Reconsider Tauri only after the first usable Electron build and when at least one of these is measured:

- Electron bundle size prevents the intended distribution;
- Electron idle memory is unacceptable for the personal workflow;
- a Rust-native subsystem provides material product value;
- the runtime is already process-isolated behind the versioned bridge;
- Linux Chromium distribution becomes harder than OS WebView compatibility;
- public-product hardening justifies a new shell and sidecar lifecycle.

Any revisit must prototype a real Pi session with the baked permission feature/dialogs, cancellation, any selected MCP stdio feature, immutable resource lookup, and packaged macOS/Linux binaries. A hello-world bundle comparison is insufficient.

## Primary sources

- [Electron introduction](https://www.electronjs.org/docs/latest)
- [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron utility process](https://www.electronjs.org/docs/latest/api/utility-process)
- [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron native modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [Electron ASAR limitations](https://www.electronjs.org/docs/latest/tutorial/asar-archives)
- [Tauri architecture](https://v2.tauri.app/concept/architecture/)
- [Tauri process model](https://v2.tauri.app/concept/process-model/)
- [Tauri sidecars](https://v2.tauri.app/develop/sidecar/)
- [Tauri Node sidecar guide](https://v2.tauri.app/learn/sidecar-nodejs/)
- [Tauri permissions](https://v2.tauri.app/security/permissions/)
- [Pi SDK](https://pi.dev/docs/latest/sdk)
- [Pi RPC mode](https://pi.dev/docs/latest/rpc)
