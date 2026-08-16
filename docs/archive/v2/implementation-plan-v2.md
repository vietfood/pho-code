# Pho Code v2 implementation plan

## Status and use

This is the accepted and archived personal-v2 implementation plan. Personal v1 is preserved under [`archive/v1`](../v1/README.md).

Milestones 0 through 4 are accepted. Milestone 1 closure incorporated owner-monitored FFF use, DNS-bound web connections, pre-decode image limits, additive FFF/Pi search labels, and packaged native-FFF proof. Milestone 2 closure incorporated provider-owned OAuth through Pi `ModelRuntime`, a Provider accounts Settings surface, fake-provider Electron/packaged journeys, and owner-verified live `openai-codex` login. Milestone 3 closure incorporated independently owned session controllers, keyed catalog/cache, a per-chat live-run store, archive/restore, recoverable OS-Trash chat removal, desktop/packaged continuity journeys, and owner-verified real-provider background switching. A later correction keyed `prepareImage` and host-dialog resolve to the composite session, compared event/selection identity as `{workspaceId, sessionId}`, and refused assistant rewrite on a busy chat. Milestone 4 closure added owner-enabled external text-only skill sources, three Pho Code skills, and one PAT-authenticated read-only GitHub MCP capability on the permission system's real `mcp` surface. See the [Milestone 4 acceptance review](./reviews/milestone-4-code-review.md).

Implement milestones in order. Do not build later capabilities around mocked contracts when the preceding vertical slice has not validated the runtime, permission, packaging, and desktop behavior it depends on.

## Global acceptance rules

Every v2 milestone must:

- preserve `renderer -> protocol <- shell adapter -> application -> runtime -> Pi SDK`;
- treat installed Pi `0.84.1` typings and tests as the current API authority until an explicit upgrade milestone changes the pin;
- keep global/project executable resource discovery disabled and add executable features only through `HarnessFeatureManifest`; Milestone 4's fixed, explicitly trusted text-only skill sources are the sole instruction-resource exception, and they enter context only after `/` insert or a named load;
- pin, package, attribute, diagnose, abort, and dispose every selected third-party feature;
- keep secrets, filesystem handles, processes, Electron objects, and non-JSON values out of the renderer protocol;
- preserve unrelated user changes and keep all reference submodules read-only;
- use recoverable operating-system Trash behavior for every removal, including test cleanup;
- add the smallest checks that prove policy and lifecycle boundaries, followed by the milestone exit lanes;
- state unit, integration, desktop, packaged, owner-verified, and unverified evidence separately;
- update product, architecture, development, attribution, and current-state documents when their accepted claims change.

## Milestone 0: autonomy foundation

### Status

Accepted, including the independent-review corrections.

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

When a project permission override exists but is not remembered, Pho Code prompts with a confirmation dialog after adding or opening that workspace. **Not now** leaves a banner so the owner can trust later; Settings still offers **Trust this project's permission rules**, which reopens the same dialog. Confirming stores that narrow decision in Pho Code application metadata and re-applies it when reopening the remembered canonical workspace. It does not write Pi's shared `trust.json`, enable project extensions/skills, or generalize the decision to a parent directory. Native folder selection remains a process-lifetime approval until this action is chosen.

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

Accepted on 2026-08-13. The review blockers are closed: web requests connect only through the public addresses validated for that request and repeat validation on redirects; pasted IPC base64 is bounded and syntax-checked before decode; stale dependency/composer expectations are corrected; FFF remains additive and its owner-facing labels distinguish it from Pi `find`/`grep`; and the packaged app resolves FFF's native library through `app.asar.unpacked`. The owner confirmed FFF's usefulness through daily agent use and explicitly waived a synthetic numeric benchmark record.

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

#### Reviewed upstreams and selected dependencies

The selected upstreams and references are:

- `@ff-labs/pi-fff` `0.10.1`, currently published as an MIT Pi extension with `tools-and-ui`, `tools-only`, and `override` modes;
- [`pi-web-access`](https://pi.dev/packages/pi-web-access) `0.22.0`, selected as the primary web-search and fetch upstream because it already contains general search, attributable sources, SSRF and redirect controls, bounded retrieval, and cancellation-aware provider paths;
- [`@mrclrchtr/supi-web`](https://github.com/mrclrchtr/supi/tree/main/packages/supi-web), retained only as a secondary extraction reference for content negotiation, Markdown sibling discovery, Readability conversion, and context-window handling. It is not the Milestone 1 search provider or an approved runtime dependency.

FFF `0.10.1` is an accepted exact runtime dependency. Its packaged resolver receives the documented build-time ASAR-unpacked adaptation and fails closed if the pinned upstream source shape changes. `pi-web-access` and `supi-web` remain reviewed references rather than runtime dependencies; Pho Code owns the multi-engine search and content-extraction adapter. Selected dependencies and materially adapted surfaces are recorded in `docs/references-and-attribution.md` and third-party notices.

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

An accepted `@` suggestion is inserted inline as `@workspace/relative/path` (for example `read @src/composer.tsx`); paths that contain whitespace are quoted (`@"KL divergence.md"`). The composer mention menu stays open while the caret remains in that `@` token, including spaces in the query, until the owner confirms with Enter/Tab or dismisses with Escape. File and folder mentions stay in the prompt; they are not rendered as chips. Before admission, the runtime extracts `@` paths from the prompt, re-resolves each beneath the current canonical workspace, rejects stale/missing/outside/sensitive targets, and never trusts a renderer-supplied absolute path. A folder mention names the folder; it does not recursively inject its contents.

#### Storage and lifecycle

- Store indexes, frecency, and query history under Pho Code's mutable application data root, partitioned by a stable workspace identity.
- Never write index state into the packaged resources, repository, global Pi directory, or another FFF installation's default database.
- Respect repository ignore rules and FFF's root-scan protections; do not index the filesystem root.
- Rebind or dispose the index on workspace change, session replacement where required, shutdown, and feature reload.
- Project files remain local. Diagnostics disclose index state and storage location without exposing filenames from sensitive paths.

#### Owner usefulness gate

Use owned fixtures to prove workspace boundaries, result shape, fail-closed native initialization, and cancellation. Product usefulness is an owner acceptance decision based on representative real-workspace use; a synthetic numeric benchmark record is optional and is not a Milestone 1 gate. FFF tools remain additive and visibly named `FFF find`, `FFF grep`, and `FFF multi-grep`, while Pi's built-in `find` and `grep` remain available.

### Slice 2: bounded public web research

#### Status

Implemented for owner testing. Search fans out in parallel across keyless DuckDuckGo HTML/Lite, Bing, Brave, Mojeek, and Jina, then merges unique URLs. Fetch uses local Readability, public YouTube captions/metadata for watch URLs, and Jina Reader for thin JS pages. `pi-web-access` was audited at `0.22.0` and is **not** loaded.

#### Approved first surface

Expose only:

- `web_search`: public search with a bounded query count and normalized result/source records;
- `fetch_content`: public `http:`/`https:` GET content extraction for a user- or agent-supplied URL, including public YouTube captions and metadata for watch/shorts URLs.

Target exact `pi-web-access` `0.22.0` as the primary implementation upstream behind a source-controlled `pho-web` adapter, subject to the artifact audit above before it enters the lockfile. Reuse only the reviewed search, source-provenance, SSRF/DNS, redirect, timeout, abort, and streamed-size mechanisms needed by these two tools. The adapter owns the tool schemas, policy defaults, provider selection, diagnostics, and mutable storage; upstream Pi commands, configuration files, and unrelated tools are not part of the feature surface.

`supi-web` remains a secondary design and source reference for extracting readable Markdown. Do not add it as a second runtime web feature or use its Context7 tools as a substitute for general search. If its extraction code proves preferable during the audit, place the reviewed logic behind the same `pho-web` adapter and apply the full network policy below before enabling it.

The renderer's production `connect-src 'self'` policy remains unchanged. Requests originate in the privileged runtime adapter. Tool output is projected through the existing untrusted tool-result presentation plus a bounded source model containing title, final URL, provider, and optional publication date. Citations remain clickable only through the existing validated external-link path.

Exclude from the adapter and packaged feature: ambient Codex/OpenAI authentication, browser-cookie Gemini access, authenticated sessions, Exa MCP implicit routing, Firecrawl/Gemini hosted extraction, curator windows, Pi slash commands, form submission, uploads, arbitrary browsing, local paths, images, PDF conversion, local video files, Gemini visual YouTube understanding, GitHub cloning, and any command that writes fetched content or repositories outside Pho Code's bounded app-owned cache. Keyless HTML search engines and Jina Search/Reader are owned `pho-web` HTTP paths, documented on the tools. Public YouTube captions and metadata are in; cookie/API video vision is not.

#### Network and egress policy

The first implementation uses an owned parallel fan-out: DuckDuckGo HTML/Lite, Bing, Brave, Mojeek, and Jina Search, then a merged unique result list. Zero-key Exa MCP and reuse of Codex/OpenAI subscription credentials remain disabled because they create implicit remote dependencies and credential coupling. Jina is a documented keyless HTTP participant, not ambient provider auto-routing.

Apply these decisions:

| Effect | Default decision |
| --- | --- |
| Fetch a literal public HTTP(S) URL with no local content in the request | Allow under the internal `developer` policy; visible tool activity |
| Send a web-search query | Ask on first use per provider/session because the query itself is data egress; a bounded session approval may follow |
| Private, loopback, link-local, multicast, metadata-service, credentialed, or non-HTTP(S) destination | Deny |
| Redirect crossing to a disallowed destination | Deny before reading the body |
| Authorization header, browser cookie, workspace-file upload, form submission, or remote mutation | Unavailable in this milestone |

Validate the URL before connection and after every redirect. Resolve DNS and reject private/special ranges for every address family, defend against DNS rebinding, strip fragments and userinfo, bound redirects, and do not trust proxy variables by default. Apply connection and idle timeouts, an overall deadline, response-byte and extracted-text limits, content-type allowlists, decompression limits, concurrency limits, and one AbortSignal through provider, fetch, extraction, and result projection. Redact authorization-like values and never place raw response headers or unbounded page text into diagnostics.

Default planning bounds are eight results per query, one query per call, two concurrent remote tool requests, 15 seconds per request, three redirects, 5 MiB compressed response, and 100 KiB extracted text. Search may issue several provider GETs in parallel inside one tool call. The source audit may tighten these values; any increase requires evidence against context flooding, latency, and provider cost.

#### Failure behavior

Provider unavailable, rate-limited, timed out, blocked, malformed, or unsupported content produces a bounded tool failure naming the stage and retryability. Empty HTML from one search engine does not fail the call while another engine still returns public URLs; it does not switch to Exa MCP, Codex/OpenAI search, browser cookies, or browser automation. Abort and shutdown settle requests before the runtime reports disposal complete.

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
3. Implement Slice 1 runtime, manifest, storage, protocol, app-owned `@` UI, lifecycle checks, owner workflow, and packaged proof.
4. Implement a minimal web adapter with one provider and the approved two-tool surface; add network/egress policy and adversarial URL tests before UI polish.
5. Add typed Pi-native steering/follow-up commands and queue projection; validate event ordering and session replacement before shortcuts.
6. Add the image picker, clipboard paste, preparation, and admission path with capability checks and transcript reopen behavior.
7. Update feature diagnostics, settings explanations, source attribution, notices, security documentation, development commands, and current state after each accepted slice.
8. Run the complete milestone exit lanes and an owner-monitored real-provider workflow covering all four slices.

### Required verification

#### Unit verified

- canonical `@` token validation, folder/file distinction, stale/outside/sensitive rejection, result limits, pagination, and JSON safety;
- FFF storage path derivation, ignore behavior, cancellation, feature diagnostics, and fail-closed native initialization;
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

- representative real-workspace use confirms that FFF improves daily navigation;
- the selected real web provider returns useful attributable sources at acceptable latency/cost;
- a real vision-capable model receives an attached image, while a text-only model rejects it before admission;
- shortcuts and labels make steering versus follow-up predictable during a real tool-using run.

#### Not yet verified

- Linux native packaging and desktop integration until run on a Linux host;
- authenticated sites, private network fetches, browser automation, uploads, remote mutation, video, or arbitrary document ingestion;
- containment of malicious third-party extension code; source review and permission gates are not a sandbox.

### Acceptance gate

Milestone 1 acceptance evidence:

- all four slices passed their checkpoints and the earlier product lanes remain green;
- the owner confirmed FFF's value in the Pho Code harness; it remains bounded to the active workspace and distinct from Pi's built-in search tools;
- `@` references are canonical, explicit, and never interpreted as renderer-authorized absolute paths;
- web results are attributable and every request obeys destination, egress, size, timeout, cancellation, and provider policy;
- steer/follow-up behavior comes from Pi's native queues and is accurately represented in the UI;
- only supported images cross the model boundary, with explicit privacy disclosure and no absolute-path leakage;
- every capability works from packaged app-owned resources and fails independently without breaking local chat;
- closure checks passed: typecheck, lint, 240 unit/integration tests, 9 Electron journeys, production build, macOS package, and 1 packaged smoke.

## Milestone 2: accounts and subscription login

### Status

Accepted on 2026-08-13. The generic adapter, Settings **Provider accounts** UI, fake OAuth Electron/packaged journey, and real Pi `openai-codex` discovery are in the tree. The owner completed a live `openai-codex` login in the system browser and confirmed the resulting account works.

The installed Pi `0.84.1` API is the source of truth. Its `ModelRuntime` already exposes provider authentication methods, non-secret status, serialized credential writes, login, logout, OAuth refresh, `isUsingOAuth`, and `isUsingSubscription`. Pho Code adapts Pi's `AuthInteraction`; it does not implement provider token exchange, refresh, or a second credential store.

### Outcome

The owner can inspect the login methods supported by each baked Pi provider, sign in through a provider-owned OAuth flow, cancel or recover from an incomplete flow, log out, and immediately use the resulting models. Provider status is understandable without exposing credential material.

The first fully verified provider is Pi's built-in `openai-codex` provider, displayed as **OpenAI (ChatGPT Plus/Pro)**. The pinned implementation supports browser login and device-code login through one provider-owned selector. The desktop adapter is provider-neutral: later reviewed providers use the same typed prompt and notification contracts rather than adding renderer-specific OAuth implementations.

Pho Code treats Pi's `isSubscription` flag as an authentication classification, not a billing guarantee. A source-controlled provider disclosure may explain known product semantics, but the UI must not claim that every OAuth login consumes an included plan allowance or has the same cost behavior.

### Scope

- List providers with stable id/name, supported `api_key` and/or `oauth` methods, configured status, active stored method when known, Pi's subscription classification, and a source-controlled disclosure key.
- Preserve the existing API-key import path while presenting API key and OAuth as methods under one **Provider accounts** section.
- Start one OAuth flow at a time; project provider progress, select/text/secret/manual-code prompts, device codes, expiration, completion, cancellation, and normalized failure.
- Open validated authorization and verification pages in the system browser through an opaque privileged link handle.
- Log out a selected provider through `ModelRuntime.logout`, then synchronize provider status and the existing model picker.
- Abort an active flow on explicit cancel, app shutdown, or invalidated ownership; discard late prompt responses and late provider notifications.
- Disable credential mutation while an agent run is active, matching the existing API-key import behavior and avoiding mid-request credential replacement.

### Non-goals

- upgrading Pi, changing its provider OAuth implementations, copying provider client secrets, or implementing token exchange/refresh in Pho Code;
- returning access tokens, refresh tokens, full credential objects, authorization URLs, callback URLs, or `auth.json` contents to the renderer;
- embedded login webviews, Chrome profile/cookie reuse, browser automation, arbitrary redirect navigation, or renderer network access;
- arbitrary provider/plugin installation, extension-defined account UI, MCP OAuth, organization/account management, payments, usage-plan inference, or subscription purchasing;
- migrating Pi-compatible credentials into Keychain or a new encrypted store; broader at-rest credential hardening remains a distribution-track decision;
- proving every Pi OAuth provider in this milestone. Additional providers enter only after the generic adapter passes the OpenAI Codex slice.

### Boundary design

The dependency direction remains:

```text
renderer -> protocol <- Electron IPC -> application -> runtime auth coordinator -> Pi ModelRuntime
                                                    -> validated system browser
```

The runtime owns provider discovery, the one-flow state machine, the opaque URL registry, and calls `ModelRuntime.login(providerId, "oauth", interaction)` / `ModelRuntime.logout(providerId)`. The application validates command ownership, projects only JSON-safe redacted state, and refreshes the existing provider/model summaries after a successful mutation. Electron owns `shell.openExternal` and accepts only a runtime-issued opaque link handle whose retained target passes the existing `http:`/`https:` validation. React renders account and prompt state but never receives the retained target.

Authorization URLs may contain state or other transient values even when they do not contain final tokens. Treat them as privileged transient data: keep them in an in-memory flow registry, bind each handle to its flow, expire the handle when the flow ends, redact it from logs/errors, and never persist it in application metadata or Pi sessions.

Pi remains authoritative for credentials. Pho Code stores only non-secret UI state while the process is alive; reopening Settings reconstructs account summaries from `ModelRuntime`, not from duplicated account metadata.

### Representative decision: auth interaction state machine

At most one flow exists in the runtime:

```text
idle -> starting -> awaiting_prompt | awaiting_external | polling -> completed
                                                       \-> failed
                                                       \-> cancelled
```

Every state carries a random `flowId`, provider id, monotonically increasing revision, and public timestamps. Commands must include the current `flowId`; prompt responses also include `promptId`. Unknown, completed, replaced, or stale identifiers fail visibly and never reach Pi.

`AuthInteraction.prompt()` creates exactly one pending public prompt and returns a promise. Supported Pi prompt types map as follows:

| Pi prompt | Renderer projection | Response handling |
|---|---|---|
| `select` | Message plus bounded id/label/description options | Return only an id present in the current prompt |
| `text` | Message, optional placeholder, ordinary input | Trim/length-limit according to the prompt contract |
| `secret` | Message, optional placeholder, password input | Pass directly to the waiting promise; never echo, log, persist, or include in events |
| `manual_code` | Message, optional placeholder, code input | Treat as secret-like transient input and support Pi's per-prompt abort race |

If `AuthPrompt.signal` aborts because a browser callback won the race, the coordinator closes only that prompt and ignores a later renderer response. Cancelling the whole flow aborts the `AuthInteraction.signal`, rejects any pending prompt, invalidates every link handle, and waits for the Pi login promise to settle before returning to `idle`.

`AuthInteraction.notify()` maps provider events without leaking URLs:

- `info`: bounded text plus opaque handles for validated links;
- `auth_url`: an opaque handle, display hostname, and bounded instructions; the main process may auto-open it once after validation, while an **Open browser** retry uses the same handle;
- `device_code`: public user code, expiration/countdown metadata, and an opaque verification-link handle;
- `progress`: one bounded status line, replacing rather than accumulating unbounded provider output.

A successful Pi login produces no credential-bearing protocol value. The coordinator asks the runtime for fresh account summaries and available-model state, emits a completed snapshot, and clears transient prompt/link material. A failure emits a normalized redacted error with retryability; raw provider errors go only to the existing redacted diagnostics path.

### Protocol contract

Use named additive commands rather than a generic auth channel:

- `listProviderAccounts(): Promise<ProviderAccountSummary[]>`
- `startProviderLogin({ providerId, method }): Promise<ProviderAuthFlowSnapshot>`
- `respondProviderAuthPrompt({ flowId, promptId, value }): Promise<ProviderAuthFlowSnapshot>`
- `openProviderAuthLink({ flowId, linkId }): Promise<void>`
- `cancelProviderLogin({ flowId }): Promise<ProviderAuthFlowSnapshot>`
- `logoutProvider({ providerId }): Promise<ProviderAccountsResult>`

The existing API-key import command may remain during the first slice, but its provider list must be derived from the same account-summary service. Do not add `invokeAuth`, raw callback registration, a renderer-supplied URL, or a credential getter.

Provider summaries expose capabilities and status, not secrets. Flow snapshots expose only the current public state. Before crossing IPC, recursively assert JSON safety and reject values containing the submitted secret/manual-code response. Redaction tests must use canary values and inspect command results, event envelopes, errors, diagnostics, and serialized UI state.

This is an additive bridge change under the existing internal protocol convention; it does not rename the `pho-code:v1:*` namespace or product data roots.

### Settings interaction

Replace the narrow **Provider API keys** block with **Provider accounts** while keeping the rest of Settings unchanged except for a floating dialog with a compact section list. Settings presents **Appearance**, **Accounts**, and **Permissions** as separate panels so later sections can be added without a full-page overlay. Connected accounts are grouped above the remaining providers. Each compact row shows configured/not configured, available login methods, the active source/method when Pi can report it, and an honest subscription disclosure on request. Selecting OAuth starts the projected flow. The API-key secret field stays collapsed until the owner explicitly chooses Add key or Replace key, and it is never shown at the same time as Sign in. Logout requires an explicit provider-scoped confirmation because it removes a stored credential, but it does not route through agent command permissions. Reopening Settings during an active login opens the Accounts tab. Escape or the backdrop dismisses the dialog without cancelling an in-flight login.

The flow UI must support keyboard operation, focus the current prompt, preserve a displayed device code while polling, expose cancel, show expiry/failure, and return focus to the provider row on completion. Closing Settings does not silently cancel a running browser/device flow; the global flow remains observable when Settings is reopened. App shutdown does cancel it.

### First vertical slice

1. Add protocol account summaries, flow snapshots, commands, validation, and a deterministic fake-auth interaction used only by repository-owned checks.
2. Add a runtime account service over the real pinned `ModelRuntime` provider/auth APIs; retain the current API-key importer through that service.
3. Add the application coordinator, one-flow state machine, abort behavior, opaque URL registry, redaction, and model-summary synchronization.
4. Add narrow IPC/preload methods and system-browser opening by retained handle; never accept a renderer URL.
5. Replace the Settings credential block with the provider-account UI and projected prompt/device/progress states.
6. Exercise the complete fake flow in Electron and the packaged app, then perform one owner-monitored live `openai-codex` login. The owner completed that live login on 2026-08-13.
7. Add other Pi OAuth providers only after recording their actual pinned prompt/events and provider-specific disclosure. Do not claim them accepted from generic unit coverage alone.

### Required verification

Keep verification proportional to this personal milestone: cover the state machine and secret boundary thoroughly, then rely on one desktop/package journey and one owner-monitored live provider flow rather than duplicating every provider combination.

#### Unit verified

- provider/method projection uses the installed Pi provider definitions and never filters out OAuth-only providers;
- stale flow/prompt/link identifiers, invalid select ids, oversized inputs, concurrent starts, active-run mutation, cancellation, prompt abort races, and expiration fail predictably;
- canary access/refresh tokens, API keys, manual codes, and authorization URLs never appear in protocol results, events, diagnostics, or persisted metadata;
- URL handles accept only retained validated HTTP(S) targets and expire with the flow;
- logout and successful login rebuild non-secret account/model summaries.

#### Integration verified

- real Pi `0.84.1` provider discovery reports `openai-codex` OAuth and its subscription classification;
- a deterministic fake provider drives select, external URL, device-code/manual-code, progress, success, failure, cancellation, and per-prompt abort without network credentials;
- login/logout use Pi's credential store in an isolated temporary agent directory and never touch the owner's real auth file.

#### Desktop and packaged verified

- Settings completes the deterministic OAuth journey by keyboard and pointer, opens only the retained test URL through the guarded main-process path, updates the model picker, and logs out;
- cancelling or closing the app leaves no unresolved prompt or open callback/listener;
- the packaged app provides the same account surface without a Pi CLI installation or renderer network permission.

#### Owner verified

- a live `openai-codex` login completed in the system browser;
- the owner confirmed the resulting Codex account works in Pho Code.

#### Not yet verified

- other Pi OAuth providers, Linux browser integration, hostile local users/processes, Keychain-backed storage, public-distribution threat handling, and MCP OAuth;
- a separately reported live refresh-on-use or live logout of the owner's Codex credential (Pi owns refresh; fake-provider logout and model-list sync are desktop and packaged verified);
- any provider billing or allowance behavior beyond what the pinned provider API classifies and the owner verifies with their account.

### Acceptance gate

Milestone 2 is accepted. The generic adapter and OpenAI Codex vertical slice satisfy the checks above: no secret or authorization URL crosses to the renderer, cancellation releases all flow resources, account/model state synchronizes after login and logout, the packaged flow works without Pi CLI, and the owner accepted the live Codex login workflow.

## Milestone 3: session continuity and lifecycle

### Status

Accepted. The owner completed the real-provider background-switch, archive/restore, and Trash removal workflow on 2026-08-14, including live thinking surviving chat switches.

A later routing correction keyed image prepare and host-dialog resolve to the composite session, compared event and metadata identity as `{workspaceId, sessionId}` rather than session id alone, and applied the same idle-only busy guard to assistant rewrite. Larger remaining items (viewed-after-display, startup controller restore, generation/sequence recovery, removal-token revision binding) stay deferred.

The runtime keeps a bounded registry of independently owned Pi session controllers. Opening another session constructs another `AgentSessionRuntime` instead of calling `newSession` / `switchSession` on the already-live runtime. Application catalog/archive/restore, keyed command routing, recoverable OS-Trash chat removal, per-workspace FFF retrieval contexts, the renderer conversation cache, and a per-chat live-run store are wired. Sidebar rows use a right-click or keyboard actions menu; archived chats live in Settings grouped by project. Desktop and packaged continuity journeys passed.

#### Characterization notes (Pi `0.84.1`)

Pinned SDK evidence from `packages/runtime/test/pi-session-identity.test.ts`:

- `SessionManager.create(cwd)` / `list(cwd)` / `open(path)` identify a session by Pi id plus a single regular `.jsonl` artifact under the agent-dir session folder. One logical session is one file; do not Trash a directory or guess sibling names.
- Session ids are unique within a workspace listing, not a substitute for the composite `{ workspaceId, sessionId }` key.
- Two `AgentSessionRuntime` instances can share one `ModelRuntime` and one workspace, persist distinct transcripts, and dispose independently. Same-workspace create/open must therefore construct another runtime (`SessionManager.create` / `open`), not call `newSession` / `switchSession` on the already-live runtime.
- Disposing one runtime does not rewrite or remove the other's JSONL file. Reopening uses `SessionManager.open(info.path)` after the previous runtime has been disposed.

### Outcome

Chats become independently owned working contexts. Selecting another chat changes which context the renderer displays; it does not abort, replace, or dispose an unrelated session controller.

The owner can:

- start work in one chat, switch to another workspace or chat, and return while the first run continues;
- see which chats are working, waiting for attention, completed with unread output, or failed;
- stop, steer, follow up, change model/thinking state, or resolve a permission request against the chat that owns that operation;
- archive and restore a chat without changing its Pi transcript;
- remove a settled chat by moving its exact Pi session artifact to operating-system Trash, with no `rm` or permanent-deletion fallback in any permission mode;
- quit with bounded, honest cleanup of every live session.

This milestone improves continuity inside one running Pho Code process. It does not create a daemon: quitting the application stops active runs according to the shutdown policy, and a process crash cannot promise that an in-flight model request resumes.

### Product invariants

1. **Selection is not ownership.** `selectedSessionKey` identifies the conversation being shown. A session controller remains alive because it is running, has unresolved host UI, or is retained by the bounded registry—not because it is selected.
2. **Pi remains transcript authority.** Pi JSONL files and `SessionManager` remain authoritative for messages, branches, model restoration, and session identity. Pho Code does not copy transcripts into application metadata.
3. **Application metadata owns lifecycle annotations.** Archive time, last-viewed time, and bounded unread/outcome hints are Pho Code metadata. They do not alter Pi session files.
4. **Every transient value has one session owner.** Run state, queue state, prepared image bytes, extension UI requests, permission-session approvals, subscriptions, and event correlation belong to a session controller and never follow the selected tab implicitly.
5. **Removal is recoverable by construction.** Session removal uses the operating-system Trash service after exact target validation. It never calls `rm`, `unlink`, `rmdir`, recursive deletion APIs, or a shell fallback—even in YOLO mode or tests.
6. **Background does not mean unattended.** A session may continue while another chat is visible, but attention-requiring effects still wait for the owner and remain visibly associated with their originating chat.
7. **Failure is isolated.** A failed or corrupted session must not dispose another session, clear another draft, consume another dialog response, or prevent the session catalog from loading.

### Terminology and identity

Use these terms consistently:

- **session key:** the composite `{ workspaceId, sessionId }`; do not assume a Pi session id alone is globally unique across workspaces or imported data roots;
- **selected session:** the session currently projected into the conversation pane;
- **resident session:** a session with an instantiated controller in the registry;
- **background session:** a resident session that is not selected;
- **active run:** an admitted Pi prompt that has not settled, failed, or been cancelled;
- **attention:** an unresolved host interaction, including a permission confirm/select/input request;
- **archived session:** a Pi session hidden from the ordinary project list by application metadata;
- **removed session:** a session whose validated Pi artifact was successfully handed to OS Trash and is no longer in Pho Code's catalog.

Archive and remove are deliberately distinct. Archive is reversible inside Pho Code. Remove relies on the operating system's Trash UI for recovery and must not be labeled delete, erase, or permanent delete.

### Representative decision: application-owned session registry

Replace the single mutable session fields in `createPhoCodeRuntime` with an application-owned registry of session controllers:

```ts
interface SessionKey {
  workspaceId: string;
  sessionId: string;
}

interface SessionController {
  readonly key: SessionKey;
  readonly runtime: AgentSessionRuntime;
  getSnapshot(options?: { refreshCatalog?: boolean }): Promise<SessionSnapshot>;
  getActivity(): SessionActivitySummary;
  sendPrompt(input: SendPromptInput): Promise<PromptAdmission>;
  steer(input: SteerRunInput): Promise<QueueAdmission>;
  queueFollowUp(input: QueueFollowUpInput): Promise<QueueAdmission>;
  abort(input: AbortRunInput): Promise<void>;
  rewriteAssistantOutput(input: RewriteAssistantOutputInput): Promise<SessionSnapshot>;
  resolveHostDialog(input: ResolveHostDialogInput): Promise<void>;
  dispose(reason: "evicted" | "removed" | "shutdown"): Promise<void>;
}

interface SessionRegistry {
  open(key: SessionKey): Promise<SessionController>;
  create(workspaceId: string): Promise<SessionController>;
  select(key: SessionKey): Promise<SessionSnapshot>;
  get(key: SessionKey): SessionController | undefined;
  listActivity(): SessionActivitySummary[];
  disposeAll(): Promise<void>;
}
```

`SessionController` is the unit that owns Pi session subscriptions, `ActiveRun`, extension binding, one host-dialog queue, prepared-image records, and snapshot construction. Event callbacks close over that controller's immutable key; they never read a process-global `piRuntime?.session` to infer ownership.

Shared services remain shared only where the pinned SDK contract permits it:

- one `ModelRuntime` and provider-auth coordinator per application runtime;
- one feature manifest and immutable resource identity per build;
- one permission configuration source per active Pi agent directory, with session-owned extension bindings;
- one workspace retrieval context per canonical workspace when the FFF adapter supports sharing safely;
- one web client may be shared because calls carry their own abort ownership;
- one prepared-image store per session controller, or one store whose keys are unforgeably namespaced by session key.

Do not create one entire `ModelRuntime` or provider credential store per chat. Do not keep using one global `extensionHost`, `activeRun`, prepared-image store, retrieval binding, or session subscription.

#### Registry bounds and eviction

The first implementation supports at most four concurrent active runs and eight resident session controllers. These are source-owned product limits, not renderer settings. A command that would exceed the active-run limit fails before admission with a recoverable explanation. A ninth idle open evicts the least-recently-selected controller only after it has no active run, queued prompt, unresolved dialog, prepared attachment, or pending disposal.

Running or attention-requiring controllers are never evicted. If all resident controllers are protected, opening another session fails visibly instead of aborting or silently discarding one. Eviction disposes only the in-memory controller; it never archives, removes, truncates, or rewrites its Pi transcript. Reopening reconstructs it from Pi.

The implementation may lower these bounds only from measured desktop evidence recorded in this section; it must not introduce an arbitrary user-facing concurrency slider in Milestone 3.

### Workspace contexts

Canonical workspace validation remains in the privileged runtime/application boundary. Opening a session in another project creates or reuses that workspace's resource context without changing the cwd or permissions of existing controllers.

A workspace context owns resources that are safe and useful to share among its sessions: canonical identity, project-resource trust decision, FFF index, feature-resolution result, and catalog cache. Session settings, Pi messages, run state, host UI, and abort signals remain session-owned. A workspace context stays resident while any controller references it and disposes after its last controller is evicted or removed.

Native picker approval and project permission-rule trust retain their current meanings. Opening one session in a workspace does not grant another workspace access, and background execution does not weaken sensitive-path or external-directory gates.

### Protocol and state model

Keep named commands and JSON-safe values. Add only the session-lifecycle surface required by this milestone:

```ts
interface SessionActivitySummary {
  workspaceId: string;
  sessionId: string;
  phase: "idle" | "working" | "attention" | "completed" | "failed";
  selected: boolean;
  archived: boolean;
  unread: boolean;
  runId?: string;
  startedAt?: string;
  updatedAt: string;
}

interface ArchiveSessionInput extends SessionKey {}
interface RestoreSessionInput extends SessionKey {}
interface RemoveSessionInput extends SessionKey {
  confirmationToken: string;
}
```

Expected additive commands:

- `listSessionCatalog({ workspaceId, scope: "active" | "archived" | "all" })`;
- `getSessionSnapshot(SessionKey)` for authoritative recovery after selection or missed events;
- `archiveSession(ArchiveSessionInput)`;
- `restoreSession(RestoreSessionInput)`;
- `prepareRemoveSession(SessionKey)` returning bounded display data plus a short-lived opaque confirmation token;
- `removeSession(RemoveSessionInput)`;
- existing prompt, queue, abort, model, thinking, assistant-rewrite, attachment, and host-dialog commands updated to resolve a controller by composite session key.

Do not add a generic session mutation command, renderer-supplied session-file path, raw filesystem handle, arbitrary Trash target, or renderer-controlled runtime identifier. The removal confirmation token binds the exact canonical workspace, Pi session id, resolved artifact identity, and current metadata revision; it expires quickly and is single-use.

Runtime events retain global monotonic `sequence` ordering and always include the owning `sessionId`; multi-workspace session events also carry `workspaceId` in their typed payload or envelope revision. Incremental run and dialog events update only the matching session projection. Catalog/activity events may update sidebar summaries without loading a full transcript into every renderer state entry.

The renderer keeps a keyed cache of conversation projections and one selected key. A full snapshot replaces only its matching entry. A late background delta must never overwrite the selected conversation merely because it arrived last. If an event sequence gap is detected, request a full snapshot for the affected session rather than resetting every chat.

### Session activity and unread behavior

Activity precedence is:

```text
attention > working > failed > completed-unread > idle
```

Selection is an independent visual attribute, not an activity phase. A selected session may still be working or waiting for attention.

- **working:** an admitted run or Pi-native queued continuation is active;
- **attention:** a host request is unresolved; the run may also be technically active, but attention is the useful owner-facing state;
- **failed:** the most recent background run failed and the failure has not been viewed;
- **completed:** a background run settled after the session was last viewed;
- **idle:** no current run or unread terminal outcome.

Application metadata records `lastViewedAt` and a bounded terminal-outcome hint; transcript and detailed errors remain runtime/Pi data. Selecting a session marks it viewed only after its authoritative snapshot is successfully displayed. Merely expanding a project or listing sessions does not clear unread state.

The sidebar shows an accessible text/icon treatment for working, attention, completed, and failed states. Animation is optional and must respect reduced motion. A system notification may announce a background attention request or completion only through an existing typed notification path and only if notification policy permits; notification content must not include unbounded model output, sensitive paths, or tool payloads.

### Permission and host-dialog routing

Every session controller owns its extension host and pending dialog lifecycle. Host requests carry the composite session key and request id. A renderer response must match both; a request id from another session is invalid even if it happens to collide.

When a background session requests permission:

1. its activity becomes `attention`;
2. the sidebar and bounded notification identify the originating chat and operation category;
3. the request remains pending in that controller;
4. selecting the chat renders its dialog in the normal composer dock;
5. resolving it settles only that session's request and returns activity to working or terminal state.

Switching away does not auto-deny, auto-approve, cancel, or migrate the dialog. YOLO may rewrite `ask` decisions according to the accepted permission feature, but explicit denies and permanent-removal prohibitions still apply. “Approve for session” is scoped to the Pi/permission session that requested it, not every resident controller.

At most one host dialog is shown for the selected session. Other controllers may each retain one serialized queue under the existing extension-host contract. Bounded timeout/abort behavior remains active so an abandoned request cannot hang shutdown forever.

### Drafts, prepared images, queues, and controls

Process-lifetime composer drafts are keyed by session key in renderer state. Prepared image bytes remain privileged and are keyed to the same session controller. Switching chats preserves each draft and prepared-image preview during the process, but Milestone 3 does not persist unsent drafts or image bytes across app restart.

Sending, steering, follow-up, Stop, model changes, thinking changes, owner assistant-output rewrites, and image removal resolve the explicit composite key. They never default to whichever session became selected after the command began. Model/thinking and assistant-rewrite changes apply to one idle target controller. Rewrite overlays remain Pi custom entries owned by that session and must not appear in another controller. Global permission settings and provider credential mutations remain unavailable while any controller has an active run because those shared changes could alter another session mid-request.

Pi-native steering and follow-up queues remain session-owned. A background session may consume its queued work without becoming selected. Queue chips in the conversation pane show the selected session; sidebar activity summarizes background work without copying queue message text.

### Archive and restore

Archive is a metadata operation. It does not dispose a controller merely because the session becomes hidden, and it does not modify, rename, move, truncate, or rewrite the Pi JSONL artifact.

Application metadata advances to a new version with records conceptually shaped as:

```ts
interface SessionLifecycleRecord {
  workspaceId: string;
  sessionId: string;
  archivedAt?: string;
  lastViewedAt?: string;
  lastOutcome?: "completed" | "failed";
  lastOutcomeAt?: string;
}
```

Migration from the current metadata version initializes no archived records and preserves recent workspace order, appearance, permission trust, and selected session. Unknown or malformed lifecycle records are ignored individually; they do not reset unrelated metadata.

Archive behavior:

- available for idle, working, attention, completed, and failed sessions;
- immediately removes the row from the ordinary project list and adds it to Settings → Archived, grouped by project;
- keeps a working archived session resident and visible in Settings → Archived with its activity state;
- if the selected session is archived, selects the next ordinary session in the same workspace, then another recent workspace session, or creates/shows the workspace's empty-session state according to existing navigation behavior;
- does not mark unread output as viewed unless the archived chat was actually displayed;
- is idempotent for an already archived session.

Restore clears `archivedAt`, returns the session to its workspace list without changing Pi data, and preserves its last-viewed/outcome metadata. If the Pi session artifact no longer exists, restore fails as session-not-found and offers metadata cleanup; it never fabricates an empty transcript under the old id.

### Recoverable session removal

The owner-facing action is **Move chat to Trash**. Use “Remove” only as a compact menu label when the confirmation text clearly says the chat's Pi transcript is moved to operating-system Trash and recovery happens through the OS.

Removal is an application command, not an agent tool and not an extension permission decision. It always requires an explicit, session-specific confirmation; YOLO does not bypass it.

#### Eligibility

Refuse removal when the target controller has:

- an active or aborting run;
- queued steering/follow-up work;
- an unresolved host dialog;
- prepared image bytes or an attachment operation in flight;
- a session replacement/rebind or disposal already in progress;
- an artifact identity that cannot be resolved exactly from the pinned Pi `SessionManager` result.

The UI explains that the owner can wait or press Stop, then retry after the session settles. Stop and remove remain separate actions; confirmation never implicitly aborts a run.

#### Target validation

The privileged runtime resolves the target by canonical workspace plus Pi session id using `SessionManager.list(workspace)`. It must not accept a path from the renderer. Before invoking Trash, validate that:

1. the session is still listed and its id/path match the prepared confirmation record;
2. the canonical artifact is a regular Pi session artifact under the expected session directory for the active agent root;
3. neither the artifact nor its parent resolution escapes through a symlink;
4. the target is not the session root, agent root, application-data root, workspace, credentials, settings, logs, feature resources, or another session;
5. file identity and metadata revision still match the short-lived confirmation token;
6. an externally shared `PHO_CODE_AGENT_DIR` is disclosed in the confirmation because another Pi process may observe the removal.

If the pinned Pi version represents one logical session with more than one artifact, stop and add a version-specific enumerator plus atomic product semantics before implementation. Do not guess related filenames or Trash a directory broadly.

#### Execution order

1. Acquire a per-session lifecycle lock and recheck eligibility.
2. Invalidate the one-time confirmation token.
3. Flush Pi/session settings needed for a settled transcript.
4. Unsubscribe and dispose the target controller without touching other controllers.
5. Invoke the injected `RecoverableRemovalService` on the exact validated absolute artifact, using `/usr/bin/trash` on macOS or the accepted Linux `trash-put`/`gio trash` order.
6. Only after Trash reports success, remove lifecycle metadata, refresh the session catalog, and publish a removal event.
7. If Trash fails, keep archive/view metadata, report a recoverable error, and allow the controller to be reconstructed from Pi on the next open. Never fall back to permanent deletion.

The result reports the session id, original display title, platform method, and `recoverable: true`; it does not expose the absolute session path to the renderer or claim an exact restore destination. Recovery is performed through Finder/Trash or the Linux desktop Trash facility. Pho Code restore applies only to archived sessions, not trashed artifacts.

Tests use an injected fake for ordinary logic and the existing owned-fixture OS Trash boundary for platform proof. Test cleanup itself follows the repository deletion policy.

### Selection, navigation, and UI

Extend the existing project/session sidebar rather than adding a dashboard:

- each ordinary session row has a right-click actions menu with Archive chat and Move to Trash;
- Archived chats live in Settings, grouped by project, with Restore and Move to Trash;
- running and attention states stay visible in both ordinary and Archived lists;
- selecting a session uses an already resident snapshot immediately when safe, then reconciles with an authoritative snapshot without a full-app loading screen;
- switching preserves project order, sidebar expansion, per-session draft, scroll state where practical, and the conversation shell;
- keyboard users can open the actions menu, confirm/cancel removal, navigate Archived, and return focus to a predictable row;
- confirmation names the chat and workspace and distinguishes archive from OS Trash.

Do not add session drag reorder, pinning, bulk archive/remove, transcript export, rename, fork/tree, worktrees, or a changed-files dashboard in this milestone.

### Startup, crash recovery, and external changes

On startup, load application lifecycle metadata, enumerate Pi sessions for remembered workspaces lazily, and restore only the selected session controller. Other controllers become resident when opened or when work starts; a previous process's `working` state is never trusted because runs do not survive process exit.

If the prior process exited during a run, reconstruct the transcript from Pi and show an interrupted/idle outcome only when the pinned SDK exposes enough durable evidence. Do not synthesize assistant completion, replay a prompt, or automatically resume tool execution.

If a session artifact is moved or removed outside Pho Code, omit it from the catalog and prune only its orphaned lifecycle annotation on the next successful metadata save. Never recreate it automatically. If an artifact reappears later with the same valid Pi identity, treat it as an ordinary session; do not infer that OS Trash restored it successfully.

The first slice does not watch every session directory continuously. Refresh catalogs on workspace expansion, session lifecycle operations, relevant runtime settlement, and explicit window focus/bootstrap reconciliation, with debouncing to avoid repeated Pi scans.

### Shutdown

Application quit is distinct from session switching:

1. stop admitting new prompts and lifecycle mutations;
2. invalidate all removal confirmation tokens;
3. cancel provider auth according to the accepted Milestone 2 policy;
4. ask every active controller to abort concurrently;
5. wait with one bounded aggregate deadline while each controller settles its prompt and host-dialog promises;
6. flush shared settings and dispose all controllers, workspace contexts, retrieval/web services, and model services in ownership order;
7. record controllers that missed the deadline in redacted diagnostics, then allow the existing exact-process quit fallback.

Do not dispose controllers sequentially with a full timeout per session, which would multiply quit time. Do not use broad process-kill patterns, rewrite session files, or mark interrupted runs as successfully completed. Closing/quitting Pho Code ends background runs; keeping work alive after application exit requires a later daemon/worker milestone.

### Concurrency, races, and failure handling

- Serialize `open/create/archive/restore/remove` per session key; unrelated keys may proceed concurrently.
- Deduplicate concurrent opens of the same key into one controller-creation promise.
- Admit at most one active prompt per session and the global active-run bound across controllers.
- Bind event subscriptions and host UI before prompt admission; remove them before controller disposal.
- A selection change during an in-flight command does not retarget the command.
- A run settling while its session is archived updates Archived activity and metadata without restoring it.
- An archive racing with remove is resolved by the per-key lifecycle lock; remove wins only after a fresh eligibility and confirmation check.
- A stale event from a disposed controller is ignored by controller generation as well as session/run id.
- One controller's snapshot/build failure emits a scoped failure and leaves registry/catalog operations available.
- Shared permission/provider-setting mutations check all controllers, not only the selected one, for active work.

### Data and privacy boundaries

Application metadata may store composite session identity, archive/view timestamps, and bounded outcome labels. It must not store transcript text, prompts, model output, tool payloads, permission reasons, attachment bytes, OAuth material, absolute session-file paths, or raw errors.

Sidebar notifications use Pi/session titles and bounded workspace display names. When a title derives from a prompt preview, preserve the current truncation/sanitization rules. Archived sessions are not encrypted or hidden from the filesystem; archive is organization, not a privacy boundary.

### Non-goals

- continuing runs after Pho Code quits, crashes, logs out, or the machine sleeps beyond provider/runtime tolerance;
- remote workers, a background daemon, launch agent, web control plane, or unattended scheduling;
- multi-agent orchestration, worktrees, git branch automation, or task dependency graphs;
- session fork/tree navigation, compaction controls, Pi transcript mutation, transcript export/import, rename, pinning, tags, search, or bulk actions; the existing owner rewrite display overlay remains supported because it does not alter Pi messages;
- automatic OS-Trash restoration or a repository-local `.trash`;
- permanent deletion, secure erase, empty-Trash actions, `rm`, or a fallback deletion API;
- changing Pi JSONL format, parsing it as an application database, or copying transcripts into metadata;
- arbitrary concurrency/resource settings or a generic process manager;
- solving cross-process concurrent ownership of an explicitly shared Pi agent directory. The UI discloses this interoperability risk and removal fails closed when ownership cannot be established.

### Implementation sequence

1. Characterize pinned Pi `0.84.1` session identity, `SessionManager.list/open/create`, runtime disposal, JSONL artifact layout, and behavior when two independent runtimes share `ModelRuntime` and one workspace.
2. Add protocol composite keys, activity/catalog projections, archive/restore/remove commands, scoped event routing, and metadata-version migration.
3. Extract the current single-session fields into a tested `SessionController` without changing visible behavior.
4. Add the bounded registry, workspace contexts, deduplicated open/create, per-session subscriptions, and concurrent shutdown.
5. Change application and renderer state from one active snapshot to a keyed cache plus selected key; preserve the current soft-switch UI.
6. Route prompt, queue, abort, model/thinking, assistant rewrites, prepared images, and extension host dialogs by composite key; add background activity and attention UI.
7. Implement archive/restore metadata and Archived navigation, including active archived runs.
8. Implement opaque removal preparation, exact Pi artifact validation, per-session locking, controller disposal, and OS Trash execution with no permanent fallback.
9. Add focused deterministic multi-session and lifecycle checks, then one Electron journey that proves a background run survives switching and one Trash journey for a settled session.
10. Package macOS and repeat the representative background/archive/remove flow with isolated application and Pi data.
11. Inspect metadata migration, shutdown timing, stale-event behavior, removal diagnostics, accessibility, actual diff, and repository status before acceptance.

### Required verification

Keep verification proportional. The critical boundaries are independent run ownership, scoped dialogs/events, metadata-only archive, exact-artifact Trash, and aggregate shutdown. Do not build a large visual-regression suite or duplicate Pi's session parser tests.

#### Unit verified

- composite session-key equality/serialization and rejection of mismatched workspace/session commands;
- metadata migration, archive/restore idempotence, last-viewed/outcome behavior, orphan cleanup, and preservation of unrelated settings;
- activity precedence and unread clearing only after successful selection;
- keyed reducer routing: background events update only their owner and stale controller/run generations are ignored;
- registry open deduplication, active/resident limits, protected-controller eviction, and per-key lifecycle locks;
- removal confirmation expiry/single use, busy-state rejection, artifact identity/path validation, symlink/root/agent-data protection, and metadata update only after Trash success;
- aggregate shutdown bounds and isolated controller failures;
- JSON safety and absence of transcript, absolute session path, prepared bytes, dialog payloads, and secrets from lifecycle metadata/results.

#### Integration verified

- two real Pi `0.84.1` session runtimes in isolated data share the accepted `ModelRuntime`, run independently, persist distinct transcripts, and dispose without cross-session events;
- a deterministic prompt continues in session A while session B opens and completes work;
- Pi-native steer/follow-up, abort, model/thinking state, assistant rewrite overlays, and extension binding remain scoped after repeated selection changes;
- simultaneous permission requests retain separate request ownership and settle only from matching session responses;
- archive/restore changes only application metadata and leaves the Pi artifact byte-for-byte untouched;
- a settled owned fixture session moves through the injected/real Trash boundary, disappears from Pi listing, and never invokes a permanent fallback;
- a failed Trash call leaves the Pi artifact and lifecycle metadata recoverable;
- quitting with multiple active controllers aborts them under one bounded aggregate deadline and releases workspace/retrieval resources.

#### Desktop verified

- start a delayed deterministic run in chat A, switch to chat B, use chat B, and return to observe chat A's continued stream and final transcript;
- background working, attention, completed, and failed states appear on the correct sidebar rows and respect reduced motion;
- a permission request from chat A cannot appear as or be resolved for chat B;
- per-session drafts and prepared image previews survive switching during the process without leaking across chats;
- archive and restore work for idle and running chats, including navigation away from a selected archived chat;
- Move to Trash requires explicit confirmation, refuses a running chat, succeeds after Stop/settlement, and selects a valid fallback view;
- relaunch preserves archive state and selected ordinary session while reconstructing transcripts from Pi.

#### Packaged verified

- the unsigned macOS application runs concurrent deterministic sessions from isolated app-owned data without a Pi CLI/global feature dependency;
- archive/restore metadata persists across packaged relaunch;
- settled session removal uses `/usr/bin/trash`, never `rm`, and does not affect credentials, settings, another session, or the session directory root;
- quitting with multiple runs leaves no owned child/process resource behind and the next launch can list intact transcripts.

#### Owner verified

- a real-provider run continues usefully while the owner switches among at least two chats and two recent workspaces (accepted 2026-08-14);
- live thinking and streaming text continue when switching away from a background agent and returning;
- attention and completion indicators are understandable without opening every chat;
- archive/restore organization feels predictable;
- the removal confirmation and Finder Trash recovery path are acceptable for personal daily use.

#### Not yet verified

- Linux desktop/package and real Linux Trash until exercised on Linux;
- surviving app exit/crash, cross-device synchronization, cross-process shared-agent-root ownership, or unattended background execution;
- fork/tree navigation, compaction controls, worktrees, multi-agent orchestration, bulk session operations, or automatic Trash restoration;
- public-distribution behavior under hostile workspaces, local users, or malicious baked extensions.

### Acceptance gate

Milestone 3 is accepted. Switching sessions no longer replaces or interrupts unrelated live controllers; multiple bounded runs and host dialogs remain correctly session-scoped; sidebar activity and unread state reconcile from authoritative snapshots; archive/restore modifies only versioned application metadata; a running or ambiguous session cannot be removed; a settled exact Pi artifact is moved only through OS Trash with no permanent fallback; aggregate shutdown is bounded and honest; packaged macOS evidence passed; and the owner accepted the real-provider background-switch plus archive/restore/removal workflow, including live thinking surviving chat switches.

## Milestone 4: interoperable skills and GitHub MCP

### Status

Accepted on 2026-08-14. Slice 1 provides `SkillSourceRegistry`, three Pho Code `SKILL.md` files, typed source Settings, Refresh, and `/` insertion from enabled sources without baking skill paths into Pi. Slice 2 provides a pinned official `github/github-mcp-server` `v1.9.0`, MCP TypeScript client `1.30.0`, OS secret-store PAT authentication, and one fixed `mcp` dispatcher restricted to the reviewed `github:<read-tool>` allowlist.

The GitHub implementation is PAT-only. Settings vocabulary matches that: `patConfigured`, Add/Replace PAT, and Remove PAT (`importGitHubPat` / `removeGitHubPat`). There is no GitHub OAuth flow. The final correction made secret removal fail closed, cleared stale account identity on replacement, refreshed protected session bindings after settlement, and moved the fixed adapter onto the permission system's actual `mcp` surface.

The owner selected two capability families: interoperable reading of compatible Codex/Cursor/Claude/Pi user skills alongside a small Pho Code-authored bundle, and one Settings-controlled GitHub MCP integration with a persistent PAT.

This milestone deliberately combines skill interoperability with one concrete MCP integration. It does not create a marketplace, package installer, arbitrary skill-directory picker, generic MCP manager, or arbitrary server editor. External skill sources and the baked GitHub capability receive typed controls, provenance, and diagnostics; their executable implementations remain outside the renderer.

### Outcome

Pho Code can reuse the owner's compatible personal skills across coding harnesses without pretending that Pho Code authored them, while retaining a small source-owned baseline that can evolve when subagent workflows arrive. A Settings-controlled, read-only GitHub capability provides authenticated repository, issue, pull-request, review, check, and workflow context without opening mutation paths.

The initial Pho Code bundle is intentionally small:

| Feature id | Skill/capability | Intended outcome |
|---|---|---|
| `repository-investigation` | text-only skill | Trace behavior and dependencies, distinguish evidence from inference, and report file/line evidence before proposing changes |
| `bug-and-test-diagnosis` | text-only skill | Reproduce narrowly, separate root cause from collateral failures, and implement only the requested correction |
| `change-review-and-recovery` | text-only skill | Review the actual change, explain risk and recovery, and verify completion without performing irreversible cleanup |
| `github-read` | MCP-backed Pi tools | Read bounded GitHub repository, issue, pull-request, review, check, workflow, and Actions-log context; never mutate GitHub |

The three Pho Code skills contain Markdown instructions only. They ship no executable scripts, hooks, binaries, or imported assets. They may instruct the model to use already baked tools, whose normal permission and workspace boundaries still apply. Future subagent work may deepen or split them only through another owner-reviewed source change.

### External skill sources and provenance

The first interoperable source set is exact and user-level:

| Source id | Default root | UI provenance |
|---|---|---|
| `codex` | `~/.codex/skills` | Codex icon and **Codex** label |
| `cursor` | `~/.cursor/skills` | Cursor icon and **Cursor** label |
| `claude` | `~/.claude/skills` | Claude icon and **Claude** label |
| `pi` | the user's normal Pi skill root (`~/.pi/agent/skills`, resolved through the pinned Pi path convention) | Pi icon and **Pi** label |
| `pho-code` | packaged `Resources/features/.../skills` | Pho Code icon and **Built in** label |

Do not infer more roots from installed applications, shell configuration, workspace contents, environment variables, or recursive home-directory scans. Project-local `.codex`, `.cursor`, `.claude`, `.pi`, `.agents`, or similarly named directories remain ordinary workspace context and do not add skills. Supporting another harness requires a source-controlled adapter that names its root, format, icon, and compatibility rules.

External sources are disabled until the owner enables each source in Settings after seeing its resolved label, count, trust disclosure, and validation warnings. Enabling source A makes **all** skills from that source available in the `/` picker; it does not enable other sources and does not inject those skills into the model context. The owner inserts a skill later with `/`. A named `read_skill` tool may load Markdown only when the owner asks for that skill by name. Pho Code reads enabled roots directly at application start and on an explicit **Refresh skills** action; it does not copy them into the feature bundle, modify them, continuously watch them, or claim reproducibility across machines. Refresh updates the catalog used by `/` and by named load; it does not rebind session controllers or change a running session's instructions mid-turn.

Each source adapter declares a small set of bounded relative layouts rather than performing recursive discovery. The common layout is `<root>/<skill>/SKILL.md`; the Codex adapter may additionally admit documented system-skill nesting such as `<root>/.system/<skill>/SKILL.md`. Supporting installed-plugin caches or another nesting scheme requires an explicit adapter update and provenance label. Every admitted file must have compatible frontmatter and bounded UTF-8 Markdown. Reject symlink escapes, unrecognized nesting, oversized files, duplicate canonical paths, invalid frontmatter, and files outside the enabled source root. Referenced scripts, hooks, executables, binaries, and arbitrary assets are not loaded or executed. A skill that requires them is shown as **limited** or **incompatible**, with a reason, rather than partially pretending to work. Enabling a source that contains limited or incompatible skills, or inserting such a skill with `/`, shows a small confirmation popup. Confirming still does not run scripts or executables; limited skills may insert Markdown instructions only.

Each discovered skill receives a stable application identity `{ sourceId, skillName, canonicalSourceHash }`. The renderer receives the source id, display name, compatibility/status, and icon key—not executable paths or file contents. Composer `/` inserts a source-qualified token such as `/pho-code:repository-investigation`; the privileged runtime expands inserted tokens to Markdown on send. Source icons are bundled local assets with recorded license/trademark provenance: Codex uses the same owner-supplied bitmaps as the model provider mark, Cursor and Claude use Simple Icons path data, and Pho Code/Pi use monograms when a brand mark is not clearly reusable. When names collide, Pho Code's built-in skill wins, followed by an explicit deterministic source order; shadowed skills remain visible with their origin and conflict reason. Never silently merge two `SKILL.md` bodies or mislabel an external skill as built in.

Skills are instructions, not harmless themes. Enabling a source makes its skills available to insert; inserting one (or asking for it by name) lets its Markdown influence model behavior and tool selection. Existing permission, workspace, sensitive-path, and remote-effect policy still governs the tools it requests, but those gates do not sandbox or validate the instructions. Settings must say this plainly.

### Selected GitHub upstream

The implementation candidate is an exact reviewed release of the official [`github/github-mcp-server`](https://github.com/github/github-mcp-server) native server. Re-audit on 2026-08-14 admitted tag `v1.9.0` (released 2026-08-10; still the current latest). Recorded assets, SHA-256 checksums, MIT license, macOS/Linux architectures, `--read-only --lockdown-mode --toolsets context,repos,issues,pull_requests,actions`, `GITHUB_PERSONAL_ACCESS_TOKEN`, and MCP stdio live in `packages/runtime/src/github-mcp-artifact.ts`. The official MCP TypeScript client is pinned at `@modelcontextprotocol/sdk` `1.30.0` (`engines.node >=18`, compatible with Electron 43 / Node 24). GitHub authentication is an explicitly supplied fine-grained PAT retained through the OS secret store; OAuth is intentionally absent.

The official server supports read-only mode and fixed toolsets. Pho Code starts the packaged native binary over stdio with read-only mode, lockdown mode, and only the source-reviewed repository, issue, pull-request, and Actions/check toolsets needed by this milestone. Server-side filtering is defense in depth; after MCP initialization, Pho Code intersects discovered tools with a source-controlled individual allowlist and refuses readiness if a required read tool is missing or a forbidden/write tool would be projected.

Do not use Docker, Homebrew, a global binary, `go run`, runtime downloads, a remote GitHub MCP URL, or `npx`. Release builds fetch or vendor only the explicitly pinned platform assets during a reviewed development/build action, verify SHA-256 values from a source-controlled artifact manifest, and stage them under application resources. The installed app never downloads or updates its server at runtime.

### Scope

#### Slice 1: curated text-only skills

- Add one source-controlled skill package with exactly the three Pho Code-authored `SKILL.md` files above, resolved through `ResourceLocator` in development and application resources in production.
- Add a runtime-owned `SkillSourceRegistry` with fixed adapters for Codex, Cursor, Claude, Pi, and Pho Code. It canonicalizes roots, validates text-only compatibility, resolves conflicts, and produces bounded diagnostics.
- Add typed Settings controls for each external source, an explicit Refresh action, and a read-only skill inventory. The inventory groups or filters by source and always shows the origin icon/label, compatibility state, and shadowing reason.
- Keep Pho Code's built-in source always present. External sources may be enabled or disabled independently; individual-skill enable/disable is deferred unless owner use proves source-level controls too coarse.
- Do not feed skill paths into Pi's `additionalSkillPaths`. Enabling a source only adds that source's skills to the `/` catalog. The owner injects a skill later with `/`; the privileged runtime expands inserted tokens to Markdown on send. A `read_skill` tool may load named Markdown only when the owner asks. Keep all other global/project extension, prompt, theme, package, and MCP discovery disabled.
- When the owner enables a source or inserts a skill that is limited or incompatible (scripts, executables, assets, invalid Markdown), show a small confirmation popup. Confirming still does not execute those files.
- Changing an external skill on disk is an owner action outside Pho Code. Refresh rereads it but never edits, snapshots, installs, updates, or deletes it.
- Adding or updating a Pho Code-authored skill remains a reviewed repository change and application rebuild.

#### Slice 2: Settings-controlled read-only GitHub MCP

- Add a runtime-owned `McpRuntime` and one `github-read` instance. It owns lazy process startup, MCP initialization, tool discovery, request ids, bounded calls, cancellation, stderr handling, health, restart policy, and disposal.
- Use the official MCP TypeScript client for stdio behind this interface. Pin the exact SDK version after verifying its Node requirement and the protocol version spoken by the selected GitHub server.
- Add a typed **GitHub MCP** Settings row with enabled/disabled, configured/not configured credential state, Add/Replace PAT, Remove PAT, runtime status, and bounded failure details. The toggle controls server connection and whether reviewed GitHub tools are bound into session controllers; it does not install/remove code or accept another server definition.
- Default GitHub MCP to off. Enabling it starts the baked capability only after the owner sees its read-only account/data disclosure and supplies a PAT. Disabling it stops new calls, cancels or bounds existing calls, unbinds tools from idle controllers, closes the shared client/server when released, and retains the PAT until the owner explicitly removes it.
- Register one application-owned Pi tool named `mcp` with a fixed `server: "github"` schema and an enum containing only the reviewed GitHub read allowlist. Do not expose MCP resources, prompts, dynamic tool discovery, raw `tools/list`, arbitrary servers, or arbitrary operations to the model or renderer.
- Keep server inputs and outputs JSON-safe and bounded. Limit string size, arrays, pagination, response bytes, call duration, and concurrent calls. Truncated output says what was omitted and how to request another page.
- Treat repository files, issue bodies, comments, reviews, usernames, and server errors as untrusted remote content. Never interpret returned text as Pho Code instructions, never render raw HTML, and never execute commands found in results.
- Route every GitHub call through the permission feature's MCP classification. Read-only does not mean private account data is harmless: the first call asks with GitHub, repository/owner, tool name, and read-only effect; session approval may cover the same reviewed read capability. No permission mode can turn on write tools because they are absent from the adapter and server mode.
- Show `disabled`, `not_started`, `starting`, `needs_auth`, `ready`, `degraded`, `failed`, and `stopped` status in Settings and internal diagnostics without exposing raw stderr, tokens, environment, or server configuration.

### Representative decision: GitHub PAT authentication

GitHub MCP accepts only a PAT entered deliberately in Pho Code Settings. OAuth, GitHub Apps, device authorization, browser login, browser cookies, `gh auth`, ambient `GITHUB_TOKEN`/`GH_TOKEN`, shell profiles, Pi provider credentials, and credentials owned by another harness are outside this milestone. This keeps the integration small and makes its credential source unambiguous.

The UI recommends a fine-grained PAT with the minimum repository and organization read permissions required by the accepted allowlist. It must not rely on a token prefix to prove scope or type: GitHub controls the actual permissions, while Pho Code independently starts the server with `--read-only --lockdown-mode` and exposes only its source-controlled read allowlist. An over-scoped PAT therefore does not make write tools available, although Settings should still warn that the token itself may carry broader rights outside Pho Code.

PAT entry uses a dedicated secret field. The privileged process writes it to an operating-system-backed secret adapter; on macOS that adapter is Keychain-backed, and on Linux it requires a verified Secret Service/keyring implementation and fails closed when secure persistence is unavailable. The renderer receives only configured/not configured state and never receives the stored value after submission. Plaintext application metadata, `.env`, Pi `auth.json`, logs, diagnostics, and renderer storage are forbidden.

The runtime supplies the PAT as `GITHUB_PERSONAL_ACCESS_TOKEN` only in the exact packaged child process's minimal environment and redacts it from errors, stderr, tool data, and process diagnostics. The PAT persists across application and server restarts. Disabling GitHub MCP retains it; **Remove PAT** clears it and stops/rebinds the capability. An invalid, expired, or revoked token transitions to `needs_auth` without deleting unrelated provider credentials. GitHub Enterprise remains outside the first slice unless promoted separately.

### MCP boundary

The dependency direction remains:

```text
renderer -> protocol <- application -> runtime -> Pi tool adapter
                                      -> MCP client -> packaged GitHub server -> GitHub
```

The renderer receives only typed enabled/status/credential summaries, skill provenance/status, and ordinary sanitized Pi tool activity. It never receives skill file contents or canonical paths, the MCP client, transport, process handle, raw environment, stored PAT, complete stderr, arbitrary server definitions, or a generic invoke method.

Extend `HarnessFeature` with typed MCP identity metadata only when implementation needs diagnostics and lifecycle composition. The manifest contains fixed server id, version, packaged artifact id, transport, mode, and tool allowlist; it contains no renderer-editable command, args, environment, URL, headers, or secret values. The Settings enabled flag gates the already-baked feature's connection/tool exposure and does not mutate this identity.

The GitHub process is application-owned rather than session-owned so authenticated connection state is shared safely by Milestone 3's resident controllers. Pi tool bindings and permission approvals remain session-owned: every controller binds its own reviewed tool adapters while calling the shared service, and a call retains the originating composite session key for cancellation and activity routing. Evicting or removing one controller releases only its bindings and calls; it does not restart the shared server while another controller uses it. The runtime permits only one startup attempt at a time, bounds tool concurrency, and closes the MCP client after all session controllers release it and before terminating the child. If graceful shutdown misses its deadline, terminate the exact owned child process; never use broad `pkill` patterns.

### Resource and deletion policy

Pho Code-authored skill and GitHub binary staging must not clear the whole `Resources/features` tree and must never call `rm`/`rmSync`. Before adding another packaged feature tree, replace any remaining single-feature staging assumption with a fresh owned scratch tree. Validate the completed tree, move an existing generated destination to operating-system Trash when replacement is necessary, then rename the prepared tree into place. A failed stage retains recoverable artifacts and reports their paths. External skill roots are mutable user data and are never copied into application resources or third-party notices merely because Pho Code reads them.

Package structure:

```text
Resources/features/@pho-code/curated-coding-skills/skills/*/SKILL.md
Resources/features/github/github-mcp-server/<version>/<platform-arch>/github-mcp-server
Resources/THIRD_PARTY_NOTICES.txt
```

The artifact manifest records upstream URL, release tag/commit, platform/architecture, byte size, SHA-256, license, and expected executable name. Packaging fails closed on a missing/mismatched artifact. Development uses the same staged artifact under gitignored `apps/desktop/resources` via `bun run stage:github-mcp`; a global GitHub server is never a fallback. The installed app never downloads the binary at runtime.

### Permission classification

| Capability | Product classification | Default treatment |
|---|---|---|
| Load one of three Pho Code-authored skills | local context composition | allow after `/` insert or named load; shown as Built in |
| Enable an external skill source | catalog availability | explicit owner action in Settings; persists by source; does not inject context |
| Insert a skill with `/` or load it by name | local context composition from mutable user data | allow after source trust; always provenance-labeled; popup if limited/incompatible |
| Skill-directed local tools | classification of the called tool | unchanged from existing permission policy |
| Enable/disable packaged GitHub MCP | typed baked-capability behavior | explicit Settings action; disabling does not remove the PAT |
| Start packaged GitHub server | local application lifecycle | allow only while GitHub MCP is enabled |
| Persist, replace, or remove GitHub PAT | credential mutation | explicit Settings action; stored secret never returns to renderer state |
| GitHub repository/issue/PR/check/workflow read | authenticated remote observation / MCP | ask; session approval allowed for the reviewed read capability |
| GitHub write, reaction, comment, review, merge, branch, workflow, release, or upload | remote mutation/publication | unavailable; tool absent and server read-only |
| Arbitrary MCP server/tool | executable capability expansion | unavailable |

### Non-goals

- arbitrary skill-directory entry, recursive home/workspace discovery, copying/importing external skills, editing external skills, marketplace UI, arbitrary prompts, or executable skill scripts/assets;
- a generic MCP manager, `.mcp.json`, remote server entry, arbitrary stdio command, environment editor, dynamic tools, resources, prompts, sampling, or MCP Apps;
- GitHub mutations of any kind, unbounded artifact downloads, Projects, Discussions, Notifications, Gists, Copilot agent delegation, GitHub Enterprise, or organization administration;
- GitHub OAuth, GitHub App or device flows, Chrome sessions, `gh` credentials, ambient tokens, Pi model OAuth, another harness's MCP credentials, shell startup files, or user-global server installs;
- claiming permission dialogs sandbox the GitHub binary or prevent prompt injection in remote content;
- additional MCP servers, external source adapters, or Pho Code skills merely because the generic seam exists;
- per-skill toggles, skill editing, skill synchronization, executable skill assets, and subagent-specific skills in the first slice.

### Implementation sequence

1. Characterize the actual Codex, Cursor, Claude, and Pi user-skill layouts/formats on owned fixtures; finalize exact source adapters, compatibility rules, collision order, and bounded diagnostics. **Done:** common `<root>/<skill>/SKILL.md`, Codex extra `<root>/.system/<skill>/SKILL.md`, YAML `name`+`description`, collision `pho-code > codex > cursor > claude > pi`.
2. Add the three source-owned Pho Code skills, `SkillSourceRegistry`, typed source settings, provenance inventory, and explicit Refresh while keeping all unrelated ambient discovery disabled. **In source:** Settings Skills section, source toggles, inventory, and Refresh update the on-demand `/` catalog without evicting, reopening, or rebinding session controllers. A selected skill's Markdown enters context only when expanded on send.
3. Correct feature-resource staging so it never permanently deletes and can compose multiple package trees. **In source:** staging builds a scratch `features` tree (permission package + Pho Code skills), trashes the previous generated destination, and renames the prepared tree into place.
4. Audit and admit exact GitHub server and MCP client artifacts, record hashes/licenses/attribution, and prove the selected native binary runs on the development architecture. **In source:** `v1.9.0` pin, SHA-256 manifest, `@modelcontextprotocol/sdk` `1.30.0`. Packaging fails closed on hash mismatch; `package:mac` fetches the pinned archive into a gitignored cache when missing.
5. Validate explicit PAT entry plus the macOS Keychain-backed and Linux Secret Service credential adapters. **In source:** PAT-only authentication; secure persistence fails closed when unavailable. Disabling MCP retains the token until Remove PAT.
6. Implement `McpRuntime` with typed enable/disable, deterministic fake stdio coverage, strict initialization/tool filtering, bounded calls, abort, stderr/credential redaction, and exact-child cleanup. **In source:** `createGitHubMcpRuntime` uses the official stdio client; fake stdio tests cover allowlist refusal, secret canaries, truncation, disable-without-logout.
7. Register the reviewed GitHub reads through one fixed `mcp` dispatcher so the permission system evaluates qualified `github:<tool>` targets on its MCP surface; bind it independently in every enabled resident Milestone 3 session controller. **In source:** idle controllers reopen immediately, protected controllers refresh after their run settles, and the next prompt retries any failed refresh. Permission MCP remains `ask` in the managed presets.
8. Add the GitHub MCP Settings row with Add/Replace PAT, Remove PAT, status, and honest secure-storage/platform disclosure. Do not add server management controls. **In source:** Settings GitHub section, default off, disclosure before enable, collapsed PAT field.
9. Package the native binary and built-in skills, then run owner-monitored external-skill provenance and real GitHub repository/issue/PR/check investigations.

### Required verification

Keep verification proportional: skill loading, allowlist enforcement, process ownership, output limits, and mutation absence are the critical checks. Do not duplicate every GitHub endpoint combination.

#### Unit verified

- exactly three expected Pho Code skills resolve, load on demand, and carry no scripts/executable assets;
- each fixed external source remains disabled until trusted, resolves only direct compatible `SKILL.md` children, rejects escapes/oversize/invalid/auxiliary-executable requirements, and never mutates source files;
- provenance identity, deterministic collision/shadowing, source enable/disable, Refresh, and `/` expansion behavior are stable and JSON-safe;
- project skill and MCP settings cannot add resources, and no arbitrary source path can enter through protocol or metadata;
- artifact identity/hash/platform checks and multi-feature staging fail closed without permanent deletion;
- GitHub enabled/disabled transitions, persistent PAT add/replace/removal, secret canaries, expiration/revocation, and secure-storage-unavailable behavior fail closed;
- MCP state transitions, one-start behavior, request timeout/abort, bounded output, stderr redaction, tool allowlist/schema mismatch, and graceful/forced exact-child shutdown;
- every exposed GitHub tool is read-only and every known mutation tool is absent regardless of permission mode.

#### Integration verified

- the application registry discovers the three packaged Pho Code skills plus only validated skills from enabled fixed sources; `/` or named reading expands the selected Markdown on demand, while disabled, shadowed, and incompatible skills cannot enter the sent context;
- a deterministic fake stdio server proves initialize/list/call/cancel/disconnect without network or credentials;
- the pinned GitHub binary starts in read-only/lockdown/fixed-toolset mode, and its discovered tools intersect the accepted allowlist exactly;
- a fake persistent GitHub PAT survives runtime restart without crossing the renderer; Remove PAT clears it and disabling MCP retains it without starting the server;
- concurrent resident session controllers bind scoped Pi tools without duplicating or restarting the shared authenticated server process, and controller eviction releases only that controller's calls/bindings;

#### Desktop and packaged verified

- Settings shows skill-source toggles, provenance icons/labels, validation/conflict states, Refresh, and the single GitHub MCP toggle/account row without arbitrary path/server controls;
- a packaged app with no global Pi, MCP config, GitHub server, `go`, Docker, or `npx` loads all three built-in skills, reads only explicitly enabled fixture skill roots, and selects the correct native server artifact;
- deterministic GitHub tool activity renders as ordinary sanitized tool output, can be cancelled, and leaves no child process after quit.

#### Owner verified

- Codex, Cursor, Claude, and Pi skill provenance and source-level trust controls are understandable, and at least one compatible external skill works without being copied;
- each Pho Code skill improves one representative real repository task without fighting the owner's normal workflow;
- the GitHub PAT persists across app restarts, disabling/re-enabling MCP preserves it, and Remove PAT clears it;
- one real read-only workflow retrieves useful repository, issue, pull-request, check, workflow, or bounded Actions-log context;
- attempts or prompts to comment, create, edit, merge, push, publish, or trigger workflows have no available GitHub tool.

#### Not yet verified

- Linux native artifact/desktop integration until run on Linux;
- GitHub Enterprise, public distribution threat handling, malicious server binary containment, or comprehensive prompt-injection defenses;
- write tools, additional MCP capabilities/source adapters, per-skill controls, imported/copied skills, executable skill assets, or subagent-specific skills.

### Acceptance gate

Milestone 4 is accepted only when the three immutable Pho Code skills and compatible skills from explicitly enabled Codex/Cursor/Claude/Pi user roots load with truthful provenance and no arbitrary/project discovery; invalid, shadowed, or executable-dependent skills fail visibly; the Settings-controlled GitHub capability uses a pinned packaged server and exposes no mutation tool; a securely stored PAT persists across app restarts and survives MCP disable/enable until explicitly removed; cancellation and shutdown release the exact child process; remote content, skill metadata, credentials, and errors remain bounded/redacted; and the owner accepts representative external-skill, built-in-skill, and GitHub workflows.

## V2 closure and archival procedure

Milestones 0 through 4 are the complete accepted v2 plan. No Milestone 5 is required for v2 acceptance. This record was archived under `docs/archive/v2` after the Milestone 4 acceptance review recorded the actual evidence:

1. Move the accepted v2 product contract, implementation plan, milestone reviews, and durable verification evidence into `docs/archive/v2`, preserving links among them.
2. Add an archive index that records the accepted Pi, Electron, FFF, GitHub MCP, permission, and packaged-feature versions plus the verified macOS/Linux scope.
3. Update `current-state.md`, `development.md`, the root instruction record, and repository navigation to point at the archived v2 boundary and identify the next active plan.
4. Leave `current-state.md` and `development.md` live; do not archive operational commands or the current architecture entry points.
5. Promote no deferred advanced feature during archival. Future work starts from [`roadmap-vnext.md`](../../version/roadmap-vnext.md) as an independently reviewed phase.

V2.x maintenance may include UI polish, accessibility and performance improvements, defect fixes, and owner-reviewed additions or refinements to the Pho Code skill bundle that preserve this accepted architecture. New MCP servers, browser automation, terminal execution, multi-agent orchestration, or isolation changes require a future-release phase because they change capability, trust, or lifecycle boundaries.
