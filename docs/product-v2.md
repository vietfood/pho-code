# Product definition: personal v2

## Status

Draft product boundary for owner calibration. Personal v1 is accepted and preserved under [`archive/v1`](./archive/v1/README.md). This document defines the intended outcome for v2; only capabilities promoted into [`implementation-plan-v2.md`](./implementation-plan-v2.md) are authorized implementation work.

## Outcome

Pho Code v2 should become a fast daily-driver coding agent: it can inspect and change a trusted local workspace with few interruptions, recover safely from mistakes, retrieve relevant local and web information efficiently, and explain the controls that constrain it.

The central product change is not unlimited autonomy. It is **legible autonomy**:

- ordinary, bounded development work proceeds without repeated approval;
- destructive, sensitive, external, costly, or publicly visible effects remain distinguishable and gated;
- deletion is recoverable by construction;
- every added capability is pinned, packaged, attributable, diagnosable, and covered on the real desktop surface;
- the owner can tell what happened, why it was allowed, and how to recover.

Pi remains the embedded agent engine. Pho Code continues to own the desktop contract, curated feature composition, privileged adapters, product policy, and state projection.

## Audience and assumptions

Personal v2 still targets the owner/developer rather than an adversarial multi-user deployment. It assumes:

- selected workspaces are trusted for ordinary coding activity;
- baked feature code has been source-reviewed by the owner;
- the owner expects the agent to read, edit, test, and build inside the selected workspace;
- macOS is the primary verified desktop and Linux compatibility remains required in design;
- the application is monitored rather than an unattended remote worker;
- remote accounts and external side effects require more explicit control than local workspace work.

These assumptions do not create a sandbox. Pi tools, extensions, skills, and MCP adapters run with the privileges of their host process unless a later milestone adds operating-system isolation.

## Product principles carried forward

- **Standalone capability bundle.** The app embeds its exact Pi runtime and every selected feature, dependency, asset, and notice.
- **Curated executable composition.** Global or project extension, skill, prompt, package, and MCP discovery remains disabled. Capabilities enter through the source-controlled feature manifest.
- **Typed settings.** Settings change named, documented behavior. They do not become a package manager, arbitrary JSON editor, executable-path form, or generic MCP manager.
- **Renderer as a view.** Remote access, filesystem operations, process execution, credentials, and future MCP clients stay behind the privileged application/runtime boundary.
- **Pi authority.** Pi continues to own model/provider behavior, agent sessions, JSONL history, context construction, compaction, and its agent loop.
- **Evidence over support claims.** A capability or platform is supported only on surfaces where its relevant unit, integration, desktop, and packaged checks have run.

## V2 capability model

Pho Code classifies operations by their effect, not only by executable or tool name.

| Effect class | Examples | Default product treatment |
| --- | --- | --- |
| Bounded workspace observation | Read files, list directories, search, `pwd`, `git status`, `git diff`, `git log` | Allow in **with great power comes great responsibility** |
| Bounded workspace mutation | Edit or create source files, apply patches | Allow in **with great power comes great responsibility** and make changes visible |
| Local validation | Typecheck, lint, unit tests, local builds | Allow reviewed command families inside the workspace |
| Dependency or environment mutation | Install packages, alter lockfiles, run migrations | Ask |
| External filesystem access | Read or write outside the selected workspace | Ask, with sensitive locations denied |
| Sensitive-data access | `.env`, SSH keys, cloud credentials, browser cookies | Deny by default |
| Recoverable removal | Move a validated path through the operating system Trash facility | Allow inside the workspace through a dedicated tool |
| Irrecoverable or history-destructive action | Permanent deletion, `git clean`, hard reset, destructive database operation | Deny by default |
| Remote observation | Fetch a public page or perform web search | Bounded by destination and data-egress policy |
| Remote mutation | Submit a form, upload a file, create an issue, send a message | Ask with the destination and effect shown |
| Publication or financial effect | Push, publish, deploy, release, purchase | Ask every time unless a later explicit policy says otherwise |
| Privileged execution | `sudo`, privilege escalation, host-security changes | Deny by default |

The product must not claim that a dialog, command parser, Electron renderer sandbox, or allow/deny table contains arbitrary extension code. Permission policy gates recognized operations; real containment requires an operating-system, container, VM, or remote execution boundary.

## Planned milestones

### Milestone 0: autonomy foundation

Replace the noisy all-shell-command approval experience with three owner-facing permission modes, safe command-family treatment, a dedicated recoverable Trash tool, clearer approval context, and regression evidence that the convenience rules do not weaken sensitive-path or external-directory gates.

Milestone 0 is implemented in [`implementation-plan-v2.md`](./implementation-plan-v2.md). The independent-review corrections narrow execution-capable search commands, make project permission-rule trust explicit and persistent inside Pho Code, and make process cancellation wait for child termination. Owner acceptance remains the gate for starting Milestone 1 implementation.

### Milestone 1: retrieval and richer input

Add fast local repository retrieval, explicit file/folder references, bounded web research, Pi-native steering/follow-up, and image attachments. These form one information-ingress milestone but remain separately gated vertical slices because they have different trust, persistence, network, model-capability, and failure semantics.

The initial direction is:

- FFF begins behind a runtime-owned local-retrieval adapter. The agent tool slice uses `tools-only` semantics; Pho Code owns composer `@` suggestions because Pi editor autocomplete is not projected through this desktop host.
- Web access begins with a source-controlled `pho-web` adapter targeting exact `pi-web-access` `0.22.0` as its primary upstream, subject to artifact audit before lockfile admission, and `supi-web` only as a secondary extraction reference. The adapter exposes bounded public search and HTTP(S) text extraction; ambient credentials, automatic provider fallback, authenticated browser automation, cookie reuse, hosted extraction fallback, local paths, GitHub cloning, PDF/video handling, form submission, file upload, and arbitrary browsing remain outside the milestone.
- Steering and follow-up call Pi `0.84.1`'s native queues and expose their pending state rather than implementing another agent queue.
- The first attachment type is an image accepted by the selected model. Ordinary files and folders remain validated `@` references rather than opaque binary uploads.
- Every executable feature remains an immutable baked capability with typed settings and fail-closed packaged lookup.

The expanded design is approved. Implementation begins only after Milestone 0 is accepted.

## Deferred beyond Milestones 0 and 1

- OAuth/subscription provider login and logout;
- imported/baked skill bundles;
- specific MCP-backed account integrations;
- browser automation using an isolated browser profile;
- diff/file workbench and checkpoints;
- session archive, restore, Trash-based deletion, fork/tree, and compaction controls;
- arbitrary document/binary attachments and richer previews beyond the first image slice;
- integrated terminal;
- multi-agent orchestration and worktree automation;
- runtime process isolation, containers, VMs, or remote sandboxes;
- signing, notarization, update channels, public distribution, and production threat response;
- arbitrary user-managed extensions, skills, packages, or MCP servers.

Deferral means these capabilities do not shape Milestone 0 or 1 contracts prematurely. It does not reject them from the broader v2 roadmap.

## Success criteria for the first v2 slice

After Milestone 1 is accepted:

1. Ordinary repository inspection and common local validation no longer produce repeated permission dialogs under **with great power comes great responsibility**.
2. Sensitive paths, external paths, irreversible removal, privileged commands, and externally visible operations retain reviewed gates.
3. The agent removes files only through a recoverable operating-system Trash operation supplied by Pho Code.
4. The owner can understand why a gated operation was allowed, asked, or denied.
5. Local repository search is measurably useful on representative small and large workspaces and remains bounded to the active workspace.
6. Web research returns bounded, attributable results without giving the renderer arbitrary network access.
7. Every new feature works from packaged application resources without global Pi, FFF, extension, or package installation.
8. Abort and shutdown release search, fetch, index, and feature resources without corrupting Pi session state.
9. The v1 conversation, permission, credential, security, and packaged smoke paths remain green.

## Product decisions still requiring later calibration

- the exact FFF and web-access package versions after license, dependency, and packaged-runtime review;
- the initial web provider and whether zero-key fallback is acceptable;
- quantitative FFF benchmark fixtures and pass thresholds;
- whether the internal `developer` policy allows all workspace writes or retains approval for selected generated/configuration paths;
- which provider OAuth flow becomes the first post-retrieval milestone;
- which concrete skills and MCP-backed capabilities earn a place in the baked manifest.
