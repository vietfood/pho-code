# Pho Code v2 implementation plan

## Status and use

This is the active post-v1 implementation plan. Personal v1 is complete and preserved under [`archive/v1`](./archive/v1/README.md).

Milestone 0 is implemented with its independent-review corrections applied and awaits owner acceptance. Milestone 1 Slices 1–4 are implemented for owner-harness testing.

Implement milestones in order. Do not build later capabilities around mocked contracts when the preceding vertical slice has not validated the runtime, permission, packaging, and desktop behavior it depends on.

## Global acceptance rules

Every v2 milestone must:

- preserve `renderer -> protocol <- shell adapter -> application -> runtime -> Pi SDK`;
- treat installed Pi `0.84.1` typings and tests as the current API authority until an explicit upgrade milestone changes the pin;
- keep global/project executable resource discovery disabled and add features only through `HarnessFeatureManifest`;
- pin, package, attribute, diagnose, abort, and dispose every selected third-party feature;
- keep secrets, filesystem handles, processes, Electron objects, and non-JSON values out of the renderer protocol;
- preserve unrelated user changes and keep all reference submodules read-only;
- use recoverable operating-system Trash behavior for every removal, including test cleanup;
- add the smallest checks that prove policy and lifecycle boundaries, followed by the milestone exit lanes;
- state unit, integration, desktop, packaged, owner-verified, and unverified evidence separately;
- update product, architecture, development, attribution, and current-state documents when their accepted claims change.

## Milestone 0: autonomy foundation

### Status

Implemented, including the independent-review corrections. Awaiting owner acceptance against the gate below.

The three owner-facing permission modes, recoverable Trash tool, and characterization tests are in the tree. Stable config keys remain `guarded`, `balanced`, and `developer`; Custom policies are preserved.

### Problem

Personal v1 proves the permission transport but its policy stored under `balanced` still sends every `bash` call to `ask`. That makes harmless operations such as `pwd`, `cd` as part of a compound command, `git status`, and common validation commands feel broken even though direct `read`, `find`, `grep`, and `ls` tools are allowed.

Relaxing the entire shell surface would fix the interruption but discard meaningful protection. Shell commands can destroy or disclose data without invoking `rm`: overwrite redirection, `truncate`, `git clean`, hard reset, database commands, uploads, package publication, privilege escalation, and scripts can all have material effects.

Milestone 0 therefore changes the policy from coarse tool-name gating to a reviewed daily-driver profile with narrow command families and a dedicated recovery path for removal.

### Outcome

With **with great power comes great responsibility** selected, the agent can perform ordinary work inside the chosen workspace without repeated approval:

- inspect files and repository state;
- navigate within compound shell commands;
- edit and create workspace files;
- run reviewed local validation command families;
- move workspace files or directories to the operating system Trash.

Sensitive, external, destructive, privileged, dependency-changing, and externally visible actions remain asked or denied according to an explicit policy. The owner sees enough context to understand every prompt and can inspect the permission review log.

### Non-goals

Milestone 0 does not:

- sandbox Pi, extensions, skills, shell processes, or baked feature code;
- infer arbitrary command effects perfectly;
- use a model as the final permission authority;
- add persistent broad approvals for arbitrary commands or domains;
- expose raw permission JSON or a general policy editor;
- implement web access, FFF, OAuth, MCP, skills, terminal UI, or multi-agent execution;
- delete sessions or other application data;
- rewrite an `rm` command automatically into a different command whose semantics may surprise the owner.

### Foundational decisions

#### Keep the pinned permission engine

Continue using `@gotgenes/pi-permission-system` `24.0.0` as the enforcement feature. Its installed version already provides parsed bash gating, path and external-directory composition, session approvals, sensitive-path matching, fail-closed handling for unparseable commands and wrappers, and review logging.

Before changing a preset, add focused characterization tests against the installed package for:

- simple allowed commands;
- pipelines and `&&`/`;` compound commands;
- redirection;
- `bash -c`, `env`, `xargs`, and `find -exec` indirection;
- symlinked sensitive or external paths;
- session approval precedence;
- last-matching-rule ordering.

If the pinned engine cannot express a required rule without an unsafe wildcard, keep that operation on `ask`. Do not compensate with brittle string matching in the renderer or application layer.

#### Present three owner-facing modes without changing stable keys

Settings presents exactly three managed modes plus preserved Custom policies:

- **baby (strict):** stable key `guarded`, using the reviewed ask-first policy;
- **okay, you got it:** stable key `balanced`, using the reviewed v1 policy;
- **with great power comes great responsibility:** stable key `developer`, using the reviewed daily-driver policy with `yoloMode: true`;
- **Custom:** any unmatched config, plus a pre-v3 `developer` file without YOLO, preserved until the owner deliberately chooses a managed mode.

Permission preset version 3 adds the common permanent-removal deny and this display migration. Existing files are detected without rewriting them. Selecting a mode explicitly writes its reviewed v3 template through the existing atomic adapter; selecting the third mode also explicitly enables `yoloMode`.

| Pre-v3 owner-facing name | Stable key | v3 owner-facing label | Migration behavior |
| --- | --- | --- | --- |
| Guarded | `guarded` | baby (strict) | Read unchanged; an explicit selection writes the v3 template |
| Balanced | `balanced` | okay, you got it | Read unchanged; an explicit selection writes the v3 template |
| Developer | `developer` | with great power comes great responsibility | Preserved as Custom until the owner explicitly selects the new YOLO-backed mode |
| YOLO | existing profile plus `yoloMode: true` | Custom unless the stable key is already `developer` | Preserved unchanged until the owner explicitly selects a v3 mode |

#### Treat the workspace as the ordinary mutation boundary

Selecting a canonical workspace authorizes normal source changes inside that workspace under the internal `developer` policy. It does not authorize:

- ambient executable feature discovery;
- reads or writes outside the workspace;
- sensitive files merely because they are located inside the workspace;
- permanent deletion or destructive history changes;
- remote publication or deployment;
- privilege escalation.

Path and external-directory gates continue to compose most-restrictive-wins with tool and bash decisions.

### Internal `developer` policy contract

The implementation must derive the exact ordered package configuration from tests against `24.0.0`. The following table is the product contract; when the package cannot prove an Allow classification, the fallback is Ask.

| Operation | Internal `developer` decision | Notes |
| --- | --- | --- |
| `read`, `find`, `grep`, `ls` in workspace | Allow | Sensitive-path rules still win |
| `write`, `edit` in workspace | Allow | Changes remain visible through normal tool activity and transcript |
| `pwd` and directory navigation within a parsed compound command | Allow | Navigation cannot loosen the canonical workspace boundary |
| `git status`, ordinary `git diff`, `git log`, `git show`, `git rev-parse`, read-only branch inspection | Allow | External diff/text-conversion options and state-mutating options must not match the read-only family |
| Pi `grep` and `find` tools | Allow | Their typed inputs remain separately path-gated |
| Shell `rg`, `grep`, and `find` | Ask | Broad option surfaces include execution or write-capable behavior (`rg --pre`, `find -exec`/`-delete`/`-fprint`); use typed search tools for routine work |
| Shell `ls`, `head`, `tail`, `wc`, `file`, and `sed -n` | Allow | Characterization tests must reject mutating variants and wrappers |
| Root typecheck, lint, unit-test, desktop-test, build, and explicitly reviewed package-script families | Allow | Only commands present in the selected workspace's package scripts qualify; package/install commands do not |
| Formatting commands scoped to workspace files | Ask initially | Promote later only after tool-specific behavior and overwrite semantics are characterized |
| Package install/update, lockfile mutation, migrations, code generation, arbitrary scripts | Ask | A later named rule may narrow a frequently used safe command |
| External-directory access | Ask | Sensitive external locations remain Deny |
| `.env`, `.env.*`, SSH keys, common cloud credential stores, browser credential/cookie stores | Deny | `.env.example` may remain readable |
| `sudo` and equivalent privilege escalation | Deny | No session approval may override it |
| Permanent filesystem removal and shredding | Deny | Includes direct executable paths and common aliases where expressible |
| `git clean`, hard reset, forced checkout/restore that discards work | Deny | Recovery is not reliable enough to classify as ordinary work |
| `git commit` | Ask | Creates durable repository history and may invoke hooks |
| `git push`, force push, publish, deploy, release | Ask every time | Do not offer a broad session approval suggestion |
| Network upload or remote mutation when future tools exist | Ask every time | Milestone 0 records the category but adds no network tool |

Allow rules must be narrow and ordered before or after catch-alls according to the pinned package's last-match semantics. Tests own the exact ordering. A command containing multiple parsed operations receives the most restrictive applicable result. An unparseable or hidden operation remains Ask or Deny according to the permission engine's fail-closed behavior.

### Recoverable removal

#### Product behavior

Add one application-owned Pi tool, provisionally named `move_to_trash`, as a source-controlled inline extension factory. The model description must say that permanent removal commands are unavailable and that this is the supported removal mechanism.

The tool accepts one path per call for the first slice. It:

1. requires an active canonical workspace;
2. resolves the requested path without trusting renderer input;
3. refuses the workspace root, filesystem root, home directory, application data root, Pi agent root, credentials, sessions, baked features, reference submodules, and any path whose ownership/boundary cannot be proved;
4. applies sensitive-path and external-directory permission policy before execution;
5. invokes the platform Trash facility with an argument array rather than a shell command;
6. returns the original path, platform method, and `recoverable: true`, without claiming an exact restored destination it cannot know;
7. reports cancellation or failure without falling back to permanent deletion.

Do not intercept or rewrite `rm`. It remains denied in every managed mode, and the agent chooses the explicit Trash tool.

#### Platform adapter

Define a runtime-owned interface such as:

```ts
interface RecoverableRemovalService {
  moveToTrash(input: {
    canonicalPath: string;
    workspacePath: string;
    signal: AbortSignal;
  }): Promise<{
    method: "macos-trash" | "linux-trash-put" | "linux-gio";
  }>;
}
```

The platform implementation must be injected through the composition root so runtime code does not import Electron.

- macOS invokes `/usr/bin/trash <absolute-path>` and does not add `--`, which that command treats as a filename.
- Linux prefers `trash-put <absolute-path>`, then `gio trash <absolute-path>`.
- If the required facility is missing, fail with installation/configuration guidance. Never fall back to `rm`, `unlink`, or recursive filesystem APIs.
- Windows remains unsupported unless product scope changes.

Process launch must use explicit executable and argument arrays, a minimal intentional environment, an abort path, a bounded wait, and normalized stderr. Abort or timeout sends `SIGTERM`, waits for actual child exit, and escalates to `SIGKILL` after a short grace period; it must not report settlement while the Trash process can still act. It must not log broad environment contents or sensitive paths beyond what the tool result deliberately displays.

#### Feature and packaging ownership

Register the Trash tool as a named `HarnessFeature` with an application version and expected extension/tool diagnostics. Package it from application-owned source rather than relying on another Pi installation. If the platform executable is absent, feature diagnostics distinguish `loaded` from `unavailable-on-platform`; the rest of chat remains usable.

### Permission explanation and UI

Keep the existing confirm/select/input host lifecycle. Improve the information sent to the existing dialog only through a typed, named projection supported by the permission adapter. At minimum a prompt should show:

- operation/tool name;
- normalized command or target summary;
- canonical workspace-relative target when available;
- external-directory or sensitive-path reason;
- matched effect category such as dependency change, external write, destructive history, or remote publication;
- whether Approve for session is available.

Do not expose raw environment variables, full credentials, authorization headers, or an unbounded tool payload. Do not add a generic renderer for arbitrary extension UI.

The Settings page shows only the three owner-facing labels above plus Custom preservation. The third mode requires confirmation and states that ask decisions are auto-approved, explicit denies remain, removal uses recoverable OS Trash, and this is not a sandbox. Private/shared agent-root disclosure, workspace-override disclosure, review-log control, and idle-only application remain intact.

When a project permission override exists but is not trusted, Settings offers the explicit action **Trust this project's permission rules**. Pho Code stores that narrow decision in its own application metadata and re-applies it when reopening the remembered canonical workspace. It does not write Pi's shared `trust.json`, enable project extensions/skills, or generalize the decision to a parent directory. Native folder selection remains a process-lifetime approval until this action is chosen.

The review log remains owned by the permission feature. Pho Code may add a bounded viewer or “open log location” action only if it can redact sensitive values and preserve the renderer boundary; otherwise Milestone 0 limits UI work to the existing log toggle and clearer live decisions.

### Protocol and ownership changes

Expected changes are narrow:

- retain `ManagedPermissionProfileId` keys `guarded`, `balanced`, and `developer`;
- version and validate the new preset in the runtime adapter;
- add typed diagnostic identity for the Trash feature;
- reuse the existing generic tool lifecycle projection for `move_to_trash`;
- add a named dialog-detail shape only if the pinned permission extension exposes enough structured decision context to populate it safely;
- keep platform command execution behind an injected runtime interface;
- keep settings commands explicit; do not introduce `setSetting(key, value)`.

Permission-dialog titles and messages pass through the same app-owned tool display mapping as transcript projection. The permission review log intentionally retains canonical internal tool names so audit entries correlate exactly with permission keys and Pi events.

### Implementation sequence

1. Add characterization tests for the pinned permission package and document what can be expressed safely.
2. Finalize the exact ordered internal `developer` policy from those results.
3. Extend protocol and permission-settings migration/preset detection.
4. Implement and unit-test the platform-neutral recoverable-removal contract and canonical target validator.
5. Implement macOS and Linux Trash adapters with no permanent fallback.
6. Register/package the application-owned Trash feature and project diagnostics.
7. Update Settings and permission-dialog explanation within supported host APIs.
8. Add runtime integration coverage using owned temporary agent/workspace roots.
9. Add one Electron journey that selects **with great power comes great responsibility**, exercises an allowed safe shell operation, proves a dangerous operation remains blocked as specified, and moves an owned fixture to Trash.
10. Package macOS and prove the Trash feature exists without global Pi packages.
11. Inspect attribution, notices, actual diff, resource staging, and repository status.

### Required tests

#### Unit verified

- exact internal `developer` template and semantic profile detection;
- pre-v3 Guarded/Balanced compatibility and explicit third-mode opt-in;
- invalid/custom config preservation and atomic writes;
- sensitive-path, external-directory, command-family, wrapper, redirection, and compound-command characterization;
- canonical Trash target validation, including roots, symlinks, protected app/Pi paths, reference submodules, missing paths, and outside-workspace paths;
- platform selection and fail-closed missing-command behavior;
- JSON-safe protocol additions and error normalization.

#### Integration verified

- real pinned permission extension allows representative safe operations and asks/denies representative risky operations under the internal `developer` policy;
- session replacement/rebind preserves the applied profile;
- `move_to_trash` moves only an owned fixture through the injected real platform adapter and never invokes a permanent fallback;
- abort/dispose settles a pending permission or Trash operation;
- ambient Pi/project resources still cannot add executable features.

#### Desktop verified

- the three owner-facing modes can be selected and persist across relaunch;
- harmless repository inspection completes without a permission dialog;
- a gated operation displays a clear decision dialog and settles correctly;
- the Trash tool appears through normal tool activity and the original owned fixture no longer exists at its source path;
- baby (strict), okay, you got it, with great power comes great responsibility, and Custom remain legible.

#### Packaged verified

- the unsigned macOS app loads the permission and Trash features from app-owned resources;
- the representative third-mode and Trash journey works with isolated data and no Pi CLI/global feature dependency;
- third-party notices remain present and correct.

#### Not yet verified

- Linux desktop and real Linux Trash integration until exercised on a Linux host;
- protection against malicious baked extension code or arbitrary host processes;
- complete semantic classification of every possible shell script;
- public-distribution security or unattended operation.

### Exit checks

Run the complete root contract:

```bash
bun run typecheck
bun run lint
bun test
bun run test:desktop
bun run build
bun run package:mac
bun run test:packaged
```

Manual owner proof on macOS:

1. select **with great power comes great responsibility**;
2. ask the agent to inspect repository status and run the project's ordinary verification commands;
3. confirm those reviewed operations do not generate repetitive prompts;
4. ask it to remove an owned disposable fixture and confirm it uses Trash;
5. attempt one sensitive-path or irreversible operation and confirm the documented gate remains effective;
6. relaunch and verify the chosen profile and conversation remain healthy.

### Milestone 0 acceptance gate

Milestone 0 is accepted only when:

- daily read/edit/validation work is materially quieter under the third owner-facing mode;
- no broad wildcard bypasses sensitive-path or external-directory policy;
- permanent removal remains denied and the supported removal path is recoverable;
- v1 profiles/configuration are not silently reinterpreted;
- the real Electron and packaged surfaces prove the representative journey;
- limitations are stated without calling the permission layer a sandbox;
- an independent review inspects the exact policy order, target validation, process launch, and packaged feature resources.

## Milestone 1: retrieval and richer input

### Status

Slices 1–4 are implemented for owner testing but Milestone 1 is not accepted. The 2026-08-13 review found two boundary blockers: DNS validation is not bound to the address used by the subsequent fetch, leaving a DNS-rebinding time-of-check/time-of-use gap; and pasted base64 is decoded before its encoded length is bounded at the Electron IPC adapter. The full unit lane also has stale dependency-boundary expectations and a mismatched composer-selection fixture, while FFF benchmark, real-provider, packaged-native, and full desktop evidence remain outstanding. Preserve a green checkpoint after each correction.

### Outcome

The owner can point the agent at local files and folders, retrieve repository content quickly, perform bounded public web research with attributable sources, redirect or extend a live run, and attach supported images. The renderer remains a typed view: indexing, canonical paths, remote requests, image bytes, and Pi queue operations stay behind application/runtime contracts.

Milestone 1 groups these capabilities because they all improve information entering an agent turn. It does not collapse their policies. Local indexing is a workspace filesystem capability, web research is remote data egress, steering changes an active run, and image attachment sends binary content to the selected model provider.

### Non-goals

Milestone 1 does not add:

- arbitrary project/global extension discovery or package installation;
- FFF override of Pi's built-in `find` and `grep` tools;
- a generic extension editor/autocomplete bridge;
- authenticated browsing, browser cookies, forms, uploads, browser automation, video analysis, or automatic GitHub cloning;
- arbitrary document or binary upload, directory expansion into prompt text, or provider file-storage APIs;
- remote mutation, account actions, MCP management, subscription login, or OAuth;
- a second agent loop, message queue, transcript store, or renderer network client.

### Foundational decisions

#### One runtime-owned information-ingress boundary

Introduce narrow runtime interfaces for local retrieval, web research, and image preparation. Third-party code may implement those interfaces or register named Pi tools, but it does not cross the renderer boundary. Protocol values contain bounded JSON-safe summaries, canonical workspace-relative references, source metadata, queue counts, and size/type metadata; they never contain filesystem handles, Node streams, provider clients, or executable configuration.

Every capability is a named source-controlled manifest feature with an exact dependency pin, expected resource count, diagnostics, abort/dispose behavior, packaged lookup, license attribution, and a failure state that does not break ordinary local chat.

#### Selected upstreams still require source and packaging audits

The selected upstreams and references are:

- `@ff-labs/pi-fff` `0.10.1`, currently published as an MIT Pi extension with `tools-and-ui`, `tools-only`, and `override` modes;
- [`pi-web-access`](https://pi.dev/packages/pi-web-access) `0.22.0`, selected as the primary web-search and fetch upstream because it already contains general search, attributable sources, SSRF and redirect controls, bounded retrieval, and cancellation-aware provider paths;
- [`@mrclrchtr/supi-web`](https://github.com/mrclrchtr/supi/tree/main/packages/supi-web), retained only as a secondary extraction reference for content negotiation, Markdown sibling discovery, Readability conversion, and context-window handling. It is not the Milestone 1 search provider or an approved runtime dependency.

The versions above are approved integration directions, not accepted dependency artifacts. Before editing the lockfile, inspect the exact tarballs or pinned source revisions, transitive/native dependencies, lifecycle hooks, data locations, configuration precedence, tool registration, network destinations, credential reads, telemetry, cancellation, cleanup, Pi `0.84.1` compatibility, Electron Node compatibility, and macOS/Linux packaging. Record every chosen revision and materially adapted surface in `docs/references-and-attribution.md` and third-party notices.

Do not load either web extension wholesale. `pi-web-access` exposes substantial behavior outside this milestone, while `supi-web` does not provide general web search and its current fetch boundary is not sufficient for the required private-network, redirect, and response-size policy. Build a small application-owned adapter from a pinned, reviewed upstream surface. Do not silently fork copied code; any material adaptation requires license and attribution records.

### Slice 1: local retrieval and `@` references

#### Capability contract

Provide a runtime-owned `LocalRetrievalRuntime` (name provisional) that owns one index per active canonical workspace and exposes bounded operations equivalent to:

```ts
interface LocalRetrievalRuntime {
  start(input: { workspacePath: string; dataDir: string; signal: AbortSignal }): Promise<void>;
  searchPaths(input: { query: string; kinds: Array<"file" | "folder">; limit: number; signal: AbortSignal }): Promise<PathSuggestion[]>;
  searchContent(input: { query: string; limit: number; cursor?: string; signal: AbortSignal }): Promise<ContentSearchPage>;
  getSnapshot(): LocalRetrievalSnapshot;
  dispose(): Promise<void>;
}
```

The exact interface follows the selected FFF API, but its observable behavior is fixed: workspace-only canonical results, deterministic limits, cancellation, no network, no shell subprocess supplied by the model, and no index/watch lifetime beyond its owning workspace runtime.

Start with `tools-only` semantics. Register additive FFF-backed tools such as `fffind`, `ffgrep`, and bounded multi-pattern search; keep Pi's built-in tools available. Do not use `override` until a later decision demonstrates semantic compatibility and a measurable benefit.

Pho Code owns composer autocomplete. The current extension host intentionally no-ops Pi editor methods including `addAutocompleteProvider`, so FFF's `tools-and-ui` editor integration cannot drive the React composer. Reuse the same runtime-owned index through a typed `searchWorkspaceReferences` command rather than enabling a general extension UI bridge or starting a second index.

An accepted `@` suggestion is inserted inline as `@workspace/relative/path` in the composer text (for example `read @src/composer.tsx`). File and folder mentions stay in the prompt; they are not rendered as chips. Before admission, the runtime extracts `@` paths from the prompt, re-resolves each beneath the current canonical workspace, rejects stale/missing/outside/sensitive targets, and never trusts a renderer-supplied absolute path. A folder mention names the folder; it does not recursively inject its contents.

#### Storage and lifecycle

- Store indexes, frecency, and query history under Pho Code's mutable application data root, partitioned by a stable workspace identity.
- Never write index state into the packaged resources, repository, global Pi directory, or another FFF installation's default database.
- Respect repository ignore rules and FFF's root-scan protections; do not index the filesystem root.
- Rebind or dispose the index on workspace change, session replacement where required, shutdown, and feature reload.
- Project files remain local. Diagnostics disclose index state and storage location without exposing filenames from sensitive paths.

#### Benchmark gate

Create owned fixtures representing a small repository and a large generated repository with known fuzzy-path, exact-symbol, ignored-file, changed-file, and paginated-content queries. Compare warm and cold latency, relevant-result rank, output size, memory, and cancellation against current Pi `find`/`grep`. Accept the slice only if FFF materially improves fuzzy-path ranking or warm retrieval latency without losing boundary correctness; record numeric results rather than claiming it is “faster” generically.

### Slice 2: bounded public web research

#### Status

Implemented for owner testing. The first provider is keyless DuckDuckGo. `pi-web-access` was audited at `0.22.0` and is **not** loaded.

#### Approved first surface

Expose only:

- `web_search`: public search with a bounded query count and normalized result/source records;
- `fetch_content`: public `http:`/`https:` GET content extraction for a user- or agent-supplied URL.

Target exact `pi-web-access` `0.22.0` as the primary implementation upstream behind a source-controlled `pho-web` adapter, subject to the artifact audit above before it enters the lockfile. Reuse only the reviewed search, source-provenance, SSRF/DNS, redirect, timeout, abort, and streamed-size mechanisms needed by these two tools. The adapter owns the tool schemas, policy defaults, provider selection, diagnostics, and mutable storage; upstream Pi commands, configuration files, and unrelated tools are not part of the feature surface.

`supi-web` remains a secondary design and source reference for extracting readable Markdown. Do not add it as a second runtime web feature or use its Context7 tools as a substitute for general search. If its extraction code proves preferable during the audit, place the reviewed logic behind the same `pho-web` adapter and apply the full network policy below before enabling it.

The renderer's production `connect-src 'self'` policy remains unchanged. Requests originate in the privileged runtime adapter. Tool output is projected through the existing untrusted tool-result presentation plus a bounded source model containing title, final URL, provider, and optional publication date. Citations remain clickable only through the existing validated external-link path.

Exclude from the adapter and packaged feature: ambient Codex/OpenAI authentication, browser-cookie Gemini access, authenticated sessions, automatic provider fallback, Exa MCP implicit routing, hosted extraction fallback, curator windows, Pi slash commands, form submission, uploads, arbitrary browsing, local paths, images, PDF conversion, local video, YouTube/video analysis, GitHub cloning, and any command that writes fetched content or repositories outside Pho Code's bounded app-owned cache.

#### Network and egress policy

The first implementation uses an explicitly selected provider. Zero-key Exa MCP and reuse of Codex/OpenAI subscription credentials are disabled until separately reviewed because they create implicit remote dependencies and credential coupling.

Apply these decisions:

| Effect | Default decision |
| --- | --- |
| Fetch a literal public HTTP(S) URL with no local content in the request | Allow under the internal `developer` policy; visible tool activity |
| Send a web-search query | Ask on first use per provider/session because the query itself is data egress; a bounded session approval may follow |
| Private, loopback, link-local, multicast, metadata-service, credentialed, or non-HTTP(S) destination | Deny |
| Redirect crossing to a disallowed destination | Deny before reading the body |
| Authorization header, browser cookie, workspace-file upload, form submission, or remote mutation | Unavailable in this milestone |

Validate the URL before connection and after every redirect. Resolve DNS and reject private/special ranges for every address family, defend against DNS rebinding, strip fragments and userinfo, bound redirects, and do not trust proxy variables by default. Apply connection and idle timeouts, an overall deadline, response-byte and extracted-text limits, content-type allowlists, decompression limits, concurrency limits, and one AbortSignal through provider, fetch, extraction, and result projection. Redact authorization-like values and never place raw response headers or unbounded page text into diagnostics.

Default planning bounds are five results per query, one query per call, two concurrent remote requests, 15 seconds per request, three redirects, 5 MiB compressed response, and 100 KiB extracted text. The source audit may tighten these values; any increase requires evidence against context flooding, latency, and provider cost.

#### Failure behavior

Provider unavailable, rate-limited, timed out, blocked, malformed, or unsupported content produces a bounded tool failure naming the stage and retryability. It does not silently switch to an unconfigured provider, browser cookies, or a browser automation fallback. Abort and shutdown settle requests before the runtime reports disposal complete.

### Slice 3: Pi-native steering and follow-up

#### Status

Implemented for owner testing. Enter still does not send during a live run; the composer exposes explicit **Steer current run** and **Add follow-up** actions.

Pi `0.84.1` is the queue authority. It already exposes `session.steer()`, `session.followUp()`, `getSteeringMessages()`, `getFollowUpMessages()`, and queue modes. Pho Code adds typed commands and projections; it does not recreate queue delivery.

Add separate protocol commands such as `steerRun` and `queueFollowUp`. They require the active session and active run IDs, validate prompt limits, call the corresponding Pi method, and return an acknowledgement with updated pending counts. A normal `sendPrompt` remains invalid during streaming unless a later explicit API unifies these commands.

Project queue state into the session snapshot:

- pending steering count and bounded previews;
- pending follow-up count and bounded previews;
- current `one-at-a-time`/`all` modes, initially read from Pi and not exposed as generic settings;
- delivery/removal reflected from Pi session events and getter state.

The composer labels the choices clearly: **Steer current run** changes the next model step after current tool execution; **Add follow-up** waits until the agent becomes idle. Use explicit buttons/shortcuts and accessible labels rather than overloading Enter invisibly. Queued messages remain visible and distinguishable from admitted transcript messages. Session replacement, abort, clear queue, failure, reload, and disposal must not leave ghost queue chips in the UI.

### Slice 4: image attachments

#### Status

Implemented for owner testing. The main process owns the native picker, clipboard paste ingestion, and Electron `nativeImage` resize; the runtime stores prepared Pi `ImageContent` by id. The renderer receives only basename, MIME, dimensions, byte length, and a `data:` preview URL. Composer paste intercepts clipboard images (and native screenshot clipboard contents) instead of inserting them as text or HTML, collapsing OS screenshot duplicates (files vs items, PNG vs TIFF). Clicking a prepared thumbnail opens the same lightbox used for markdown images.

The first attachment slice supports PNG, JPEG, GIF, and WebP images only, subject to the selected model's image capability. Pi `0.84.1` accepts `ImageContent` on prompt, steer, and follow-up operations; Pho Code supplies the typed desktop ingestion path.

The main process owns file selection and returns only bounded metadata to the renderer. The privileged adapter validates magic bytes and MIME agreement, reads with a byte limit, strips path information from the model-visible name unless explicitly referenced, optionally resizes through a reviewed packaged library, and creates Pi image content without persisting duplicate base64 in application metadata. The renderer displays a local object/preload-safe preview through a narrow contract, never a raw filesystem path or arbitrary `file:` URL.

Set an initial limit of five images and 10 MiB per source image before resize, with a 2,000-by-2,000 maximum prepared dimension unless the pinned Pi behavior requires a stricter bound. Reject unsupported, corrupt, oversized, stale, or model-incompatible images before prompt admission with a recoverable error. Show that sending an image transmits its content to the selected model provider.

Pi JSONL remains authoritative for admitted image content. Draft attachments are ephemeral and cleared only after confirmed admission; failed admission preserves the draft for retry. Reopened transcripts project a bounded image placeholder/preview without leaking the original absolute path. Steering and follow-up accept the same validated prepared-image records.

Ordinary files, documents, archives, audio, video, and folders are not binary attachments in this milestone. Files and folders use the validated `@` reference flow; future document ingestion requires its own parsing, size, privacy, and persistence design.

### Protocol and ownership changes

Expected named contracts are:

- local retrieval health plus bounded path/content search commands;
- structured composer reference tokens containing workspace-relative path and kind;
- web source records and bounded search/fetch settings owned by the named web feature;
- `steerRun` and `queueFollowUp` inputs/admissions plus pending-queue snapshot state;
- image-selection metadata and prepared attachment IDs scoped to the application/session lifetime;
- feature diagnostics for index, native library, provider, network, and attachment preparation states.

Do not add a generic `invokeTool`, `setSetting`, raw filesystem picker, remote URL fetch bridge, extension UI channel, or arbitrary attachment payload channel.

### Implementation sequence

1. Audit exact FFF and web package tarballs, dependencies, licenses, configuration, and packaged behavior; write dependency decision records before pinning.
2. Prove one FFF-native index can serve both additive agent tools and a runtime path-suggestion API. If not, select the underlying library and build application-owned adapters rather than duplicating indexes.
3. Implement Slice 1 runtime, manifest, storage, protocol, app-owned `@` UI, lifecycle tests, benchmark, desktop journey, and packaged proof.
4. Implement a minimal web adapter with one provider and the approved two-tool surface; add network/egress policy and adversarial URL tests before UI polish.
5. Add typed Pi-native steering/follow-up commands and queue projection; validate event ordering and session replacement before shortcuts.
6. Add the image picker, clipboard paste, preparation, and admission path with capability checks and transcript reopen behavior.
7. Update feature diagnostics, settings explanations, source attribution, notices, security documentation, development commands, and current state after each accepted slice.
8. Run the complete milestone exit lanes and an owner-monitored real-provider workflow covering all four slices.

### Required verification

#### Unit verified

- canonical `@` token validation, folder/file distinction, stale/outside/sensitive rejection, result limits, pagination, and JSON safety;
- FFF storage path derivation, ignore behavior, cancellation, feature diagnostics, and benchmark fixtures;
- URL parsing, special-range rejection for IPv4/IPv6, redirect revalidation, DNS rebinding behavior, response/decompression/text limits, MIME handling, timeout, abort, redaction, and citation normalization;
- steer/follow-up validation, stale run/session rejection, queue projection, reducer ordering, abort/clear/replacement behavior, and prompt length limits;
- image signature/MIME validation, count/size/dimension limits, model-capability rejection, draft retention, and transcript placeholder projection.

#### Integration verified

- real pinned FFF/native adapter indexes only an owned temporary workspace and releases resources on switch/dispose;
- additive FFF tools and composer suggestions use the same index and do not replace Pi built-ins;
- a controlled local HTTP/DNS fixture proves redirect, SSRF, limit, timeout, and abort behavior without contacting arbitrary internet hosts;
- real Pi `0.84.1` accepts, exposes, delivers, and clears steering/follow-up messages according to its queue state;
- real Pi message construction accepts supported images without returning absolute paths or secrets through protocol values.

#### Desktop verified

- keyboard and pointer users can type `@`, insert/remove file and folder mentions inline, and stale mentions fail visibly;
- web tool activity and citations render safely while the renderer remains unable to fetch remote URLs directly;
- steering and follow-up remain distinguishable in the composer and pending state across live tool activity;
- image selection, preview, retry after failed admission, send, and reopened transcript placeholder work in Electron;
- workspace/session switching clears or rebinds every slice without stale state.

#### Packaged verified

- the unsigned macOS app loads exact FFF/native and web feature resources without a global Pi, package, FFF, MCP, `rg`, or `fd` installation;
- native binaries/libraries match Electron's ABI and architecture;
- source attribution and third-party notices include every selected package and copied/adapted component;
- the packaged app completes one local retrieval, public web research, steering/follow-up, and image workflow with isolated app data.

#### Owner verified

- representative small and large real workspaces confirm that FFF ranking and latency improve daily navigation;
- the selected real web provider returns useful attributable sources at acceptable latency/cost;
- a real vision-capable model receives an attached image, while a text-only model rejects it before admission;
- shortcuts and labels make steering versus follow-up predictable during a real tool-using run.

#### Not yet verified

- Linux native packaging and desktop integration until run on a Linux host;
- authenticated sites, private network fetches, browser automation, uploads, remote mutation, video, or arbitrary document ingestion;
- containment of malicious third-party extension code; source review and permission gates are not a sandbox.

### Acceptance gate

Milestone 1 is accepted only when:

- all four slices pass their own checkpoint in order and the full earlier product lanes remain green;
- FFF provides recorded measurable value and remains bounded to the active workspace;
- `@` references are canonical, explicit, and never interpreted as renderer-authorized absolute paths;
- web results are attributable and every request obeys destination, egress, size, timeout, cancellation, and provider policy;
- steer/follow-up behavior comes from Pi's native queues and is accurately represented in the UI;
- only supported images cross the model boundary, with explicit privacy disclosure and no absolute-path leakage;
- every capability works from packaged app-owned resources and fails independently without breaking local chat.
