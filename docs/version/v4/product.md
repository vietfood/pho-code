# Product definition: V4 Public Beta Foundation

## Status

Owner-approved V4 product boundary, promoted 2026-08-20. **Pending** as of 2026-08-20: the owner cannot enroll in the Apple Developer Program, so Developer ID signing, notarization, Gatekeeper-clean DMG, and Homebrew cask distribution cannot be verified. Remaining implementation is held. Public release is **not accepted**. Do not weaken the unsigned-fallback gate. Resume from [`implementation-plan.md`](./implementation-plan.md) when Developer ID authority exists. Hold record: [`logs/2026-08-20-hold-pending-apple-developer.md`](./logs/2026-08-20-hold-pending-apple-developer.md). Acceptance still requires every gate in the implementation plan and an immutable V4 review. Independent add-ons and a later numbered version may proceed without taking over this contract.

## Outcome

Pho Code V4 turns the accepted personal coding harness into a bounded public beta for trusted local development workspaces.

A beta user should be able to:

- download Pho Code from the owner's website or its fixed release host;
- verify the publisher through normal macOS Gatekeeper presentation;
- install and launch without a repository checkout, Pi CLI, global Pi packages, or first-launch compilation;
- sign in to a supported provider, open a trusted workspace, converse, edit, review, Undo, Stop, quit, and resume;
- keep the application window alive when the Pi runtime process crashes;
- understand the authority granted to Pi, baked features, agent tools, and remote services;
- inspect version/build/feature health and export a bounded redacted diagnostic record;
- receive a signed beta update and recover safely when download, install, startup, or application-data migration fails.

V4 is a release-quality increment around the existing product. It is not a feature-completeness race. Browser automation, session trees, richer document attachments, subagents, worktrees, LSP, and Linux packages are not required to prove that the current coding workflow is useful.

## Audience and supported surface

The initial audience is a small external beta cohort of developers who understand that:

- selected workspaces are trusted for ordinary coding work;
- the application is monitored, not an unattended remote worker;
- source-reviewed baked features run with the beta user's local authority;
- provider, GitHub, web, and update traffic reaches named remote services;
- beta releases may contain defects and users should keep normal repository backups and version control.

The selected first platform is **Apple Silicon macOS 14 or newer**. Intel macOS, Linux artifacts, Windows, Mac App Store distribution, mobile, and managed-enterprise deployment are not V4 support claims. Linux-compatible core boundaries remain required, but compatibility is not support.

## Release identity

V4 uses these defaults until Milestone 0 records final owner evidence:

| Identity | V4 selection |
| --- | --- |
| Public product name | `Pho Code`, subject to public-name/trademark clearance |
| Technical slug | `pho-code` |
| Bundle identifier | `dev.vietfood.phocode`, subject to final identity decision |
| Public version | `4.0.0-beta.N` |
| macOS build number | monotonic positive integer, independent of SemVer prerelease text |
| Release channel | `beta` only |
| Distribution | Developer ID direct download; not Mac App Store |
| Architectures | `arm64` only |

The current repository has no project distribution license/EULA and the archived identity review notes that `phocode.com` already has a `Phở Code` history. The owner must close name and license decisions before a public release candidate is built. A name or bundle-identifier change after distribution would create migration, Keychain, update, and support obligations; V4 therefore freezes them before implementation crosses the release gate.

## Product principles

### Preserve the standalone harness

The application continues to embed the exact Pi SDK and every executable baked feature. A public build never downloads feature code, discovers project/global Pi extensions, trusts ambient `.mcp.json`, or requires another Pi installation. The feature manifest remains source-controlled and immutable for one build.

### Keep conversation behavior stable

V4 does not redesign the agent loop or conversation surface. Existing session ownership, Plan/Agent, permission prompts, agent-tool sandbox, V3 change capture, Approve/Undo, Stop/Stop-all, provider accounts, skills, GitHub MCP, retrieval, web tools, and image attachments must retain their accepted semantics.

### Treat beta release engineering as product behavior

Signing, migration, update, diagnostics, crash recovery, and support disclosures are observable contracts. A passing source build is not a public artifact, and notarization is not evidence that the agent is safe for hostile repositories.

### Fail closed without erasing state

Unknown application schemas, invalid release resources, failed migrations, corrupt update metadata, child-process crashes, and missing signed artifacts must preserve the last known data and working build. They may disable affected operations and explain recovery; they must not silently replace state with defaults or rewrite Pi sessions speculatively.

## Trust and security model

V4 distinguishes four boundaries:

| Boundary | V4 claim |
| --- | --- |
| Renderer isolation | The React renderer remains sandboxed behind narrow typed IPC and cannot directly access filesystem, process, credential, or update authority. |
| Pi crash isolation | The complete `HarnessRuntime` moves to an Electron utility process so a crash or forced restart does not destroy the main window. |
| Agent-tool policy | The accepted permission feature and agent-tool sandbox continue to govern recognized agent `bash` and file-tool operations. |
| Hostile-code containment | **Not claimed.** Pi, baked TypeScript features, native libraries, MCP children, and allowed commands still act with the user's authority unless a separately verified OS boundary restricts them. |

Process extraction is a reliability boundary first. It must not be advertised as a sandbox. V4's public copy must say “trusted workspaces” and explain that renderer sandboxing, process separation, and the agent-tool sandbox solve different problems.

The utility process receives an intentional environment rather than the whole parent environment. Any retained provider environment variables must be individually documented and tested; in-app provider login remains the preferred credential path. Production builds reject all test-only runtime seams.

## Runtime recovery contract

- Electron main owns windows, menus, native pickers, appearance, external-link validation, update control, release diagnostics, and future owner PTY services.
- The utility process owns the complete Pi runtime graph, resident session controllers, baked TypeScript feature hosts, GitHub MCP lifecycle, retrieval, V3 capture, and provider services.
- A runtime generation has an explicit identity. Main ignores responses/events from a replaced generation.
- A child crash leaves the window and metadata UI alive, marks Pi unavailable, and preserves Pi JSONL, application metadata, V3 ledger, credentials, and workspace files.
- Restart is explicit after a crash or unresponsive-runtime diagnosis. V4 does not enter an automatic crash loop.
- A forced child restart may leave an in-flight V3 tool record indeterminate; the next generation runs the accepted ledger reconciliation before enabling recovery actions.
- Stop/Stop-all remain cooperative bounded cancellation. Killing the child is a separate recovery action and is never described as an ordinary Stop.

## Application data and migration contract

V4 freezes the public data ownership model:

- Pi JSONL, provider state, and compatible Pi operational files remain under app-owned `userData/pi-agent` unless the owner deliberately selects the documented shared-directory override.
- application metadata, sandbox settings, retrieval indexes, diagnostics, release state, and V3 ledger remain separate app-owned stores;
- OS-backed provider/GitHub secrets are never copied into diagnostics or migration backups;
- packaged resources are immutable and never contain mutable sessions, credentials, settings, or logs.

Unknown or corrupt metadata no longer means “start empty.” Loading returns an explicit healthy, migrated, unsupported, or corrupt result. Before a schema-changing migration, Pho Code preserves the original small app-owned configuration files in a bounded recovery record, writes the replacement atomically, and records completion. Pi JSONL and V3 blobs are not rewritten merely because the application version changed.

Rollback has a bounded meaning:

- a failed update leaves the installed working version usable;
- a failed first-run migration restores its pre-migration configuration record or leaves the app in recovery mode;
- earlier signed beta artifacts remain available for manual reinstall during the beta;
- arbitrary downgrade after a newer schema has been accepted is not promised unless that pair is explicitly verified.

## Distribution and update contract

The human download is a notarized, stapled DMG containing the signed application. A ZIP/update payload containing the same signed application plus a fixed HTTPS feed supports the beta update path. Every public artifact is tied to one source revision and includes:

- product version, numeric build number, channel, commit, build timestamp, Electron/Node/Pi pins, and target architecture;
- SHA-256 artifact hashes and a packaged resource manifest;
- complete notices for shipped runtime dependencies, bundled binaries, copied/adapted code, and distributable assets;
- an owner-selected project license/EULA;
- release notes and known limitations.

Missing signing credentials, an unsigned nested binary, notarization failure, an unstapled ticket, a failed Gatekeeper assessment, a resource-hash mismatch, or production test hooks must fail the release build. There is no unsigned public fallback.

Updates are controlled from Electron main through a fixed allowlisted HTTPS feed. The renderer receives only bounded status and sends explicit check/install intent. An update never injects arbitrary HTML, changes feature composition at runtime, silently bypasses live work, or skips bounded shutdown. Installation occurs only after the owner accepts and all active sessions/dialogs are settled or explicitly stopped.

## Diagnostics, privacy, and support

V4 has **no telemetry and no automatic crash upload**. The application may retain a small local redacted event ring needed to explain startup, child-process, migration, resource, update, and shutdown failures. The limits and fields are source-owned and documented.

The owner can export one inspectable JSON diagnostic file. It may include:

- app/build/runtime versions and architecture;
- release channel and packaged-resource hashes/status;
- metadata/store schema versions and migration outcomes;
- runtime generation/crash status and redacted error codes;
- feature, sandbox, GitHub MCP, retrieval, update, and shutdown health;
- bounded local event records.

It must not include prompt or transcript content, source-file contents, prepared images, full tool inputs/outputs, API keys, OAuth tokens, GitHub PATs, authorization URLs, cookies, complete environment variables, Pi auth files, V3 snapshot blobs, or raw absolute workspace paths. Export is explicit, uses a native save dialog, and never uploads automatically.

## Website relationship

The owner will build the product website separately. V4 does not own its framework, source repository, visual design, analytics, hosting, deployment, or content workflow.

Before V4 release-candidate acceptance, the website/release system must provide fixed HTTPS locations for:

- product/download page;
- beta release notes and known limitations;
- privacy policy;
- security reporting/contact;
- signed artifact hosting or a stable redirect to the release host;
- the beta update feed and payloads, if the website origin owns updates.

Pho Code stores those locations as reviewed build constants. They are not generic Settings values and the renderer cannot redirect update traffic. The website is not automatically the update trust root: code signing, HTTPS, pinned feed origin, release provenance, and artifact verification remain required.

## Relationship to independent add-ons

The integrated terminal and context compaction remain independent add-ons with their own product, implementation, and acceptance evidence. They may ship in the V4 binary only if accepted before release freeze and included in signed packaged verification. V4 does not accept their implementation by packaging it.

Conversation/UI maintenance may continue independently when it preserves the release boundary. A public-beta defect that affects trust, data, startup, signing, update, or recovery becomes V4 work or an urgent prerequisite, not an excuse to add unrelated capability.

## Non-goals

V4 does not include:

- browser automation or attachment to the user's browser profile;
- session fork/tree/clone navigation;
- document/archive attachments beyond accepted images and workspace references;
- subagents, multi-agent orchestration, worktrees, branch automation, or remote workers;
- LSP, debugger, embedded editor, Git staging/commit automation, or broad shell/MCP mutation recovery;
- arbitrary plugins, executable skill sources, package management, generic MCP configuration, or ambient `.mcp.json`;
- Mac App Store distribution, Intel macOS, Linux/Windows installers, mobile, enterprise management, or unattended server mode;
- Tauri, Deno, Rust rewrite, container/VM isolation, or a claim of hostile-workspace safety;
- automatic telemetry, analytics, prompt collection, transcript upload, or remote crash reporting;
- implementation of the product website.

## V4 completion boundary

V4 is complete only when the selected source revision produces an Apple Silicon macOS 14+ `4.0.0-beta.N` artifact that is signed, hardened, notarized, stapled, Gatekeeper-verifiable, versioned, attributable, and installable from the public release path; the production artifact contains no enabled test seams and needs no Pi CLI or runtime downloads; Pi runs in a restartable utility process without taking down the window; existing chat, permissions, sandbox, V3 review/Undo, Stop, credentials, sessions, and baked features survive the process boundary; application-data migrations fail without silent reset; diagnostics are local/redacted/explicit; a signed update and its failure path are exercised; website handoff URLs are fixed; and an immutable acceptance review states exactly what was and was not verified.
