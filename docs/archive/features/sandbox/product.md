# Product definition: agent-tool sandbox

## Status

Owner-approved add-on product boundary, 2026-08-16. This is **not** v3, **not** the integrated terminal, and **not** Phase F runtime extraction.

Personal v1–v3 remain accepted. The implementation contract is [`implementation-plan.md`](./implementation-plan.md). Status is **Accepted and archived** (workstream closed 2026-08-18). Review: [`logs/2026-08-17-acceptance-review.md`](./logs/2026-08-17-acceptance-review.md). Closure: [`logs/2026-08-18-workstream-closure.md`](./logs/2026-08-18-workstream-closure.md).

Earlier candidate research lives in [`research.md`](./research.md). This file is the product contract.

## Outcome

The owner can turn on an OS-enforced box for **agent `bash`** (and Pi `user_bash` / `!` if this host still exposes it) so ordinary workspace commands run without permission prompts, while filesystem and network limits still hold at the OS for that process tree.

The same Settings policy also gates in-process Pi `read` / `write` / `edit`, because those tools never enter Seatbelt. MCP, `pho-web`, Cursor SDK tools, baked extensions, and the owner terminal stay on their existing gates.

The conversation stays primary. This is containment for agent tools, not a hypervisor, not a public-distribution threat model, and not a sandbox for the Pi Node process.

## Audience and trust model

The add-on continues the personal, trusted-workspace assumptions of accepted v2:

- the owner selects and trusts the workspace for ordinary coding work;
- baked feature code still runs with the app process’s authority;
- macOS is the first verified platform; Linux stays a compatibility diagnostic until a later expansion;
- Windows is out of scope.

Honest disclosure is required in Settings where the feature is introduced:

- Renderer `sandbox: true` is a Chromium UI boundary. It does not box Pi or agent `bash`.
- Permission dialogs are not the OS box.
- Domain allowlists are not traffic inspection. Allowing `github.com` still allows push or exfil to any repo on that host.
- The owner PTY is not sandboxed.
- V3 Undo still covers tracked `write`/`edit` only. Sandboxed `bash` can mutate the workspace without a ledger entry.
- Process separation (Phase F) is not this feature. Window-first app launch (create the Electron window before Pi `ModelRuntime.create`) is also not this feature; it lives under [`urgent/window-first-pi-core`](../../../urgent/window-first-pi-core/README.md).

## Why this does not wait on process extraction

Phase F moves the Pi runtime into an Electron utility or child process. That is a different job: credentials, model HTTP, session JSONL, MCP stdio, and IPC would all need a new policy, and the current main-process runtime would have to keep working until that extraction is stable.

Agent `bash` is already a child process. `@anthropic-ai/sandbox-runtime` wraps children with `sandbox-exec` on macOS. That can ship or fail independently, the same way the terminal add-on does not wait on V3.

If a future owner later wants the **entire Pi process** under Seatbelt, that work stays Phase F and can reuse this engine. This add-on must not be blocked on it.

## How current harnesses split the problem

These are research inputs, not licenses to copy UI or JSON formats.

| Harness | What the OS box covers | File tools | Prompts inside the box |
| --- | --- | --- | --- |
| **Pi official example** | Agent **`bash` + `user_bash`** via `@anthropic-ai/sandbox-runtime` | Unchanged; still in-process Pi tools | None in the example; TUI `/sandbox` is status only |
| **Cursor** | Agent **terminal/shell** via Seatbelt (`sandbox-exec`) on macOS | Editor/file tools stay on a separate path; extra protections for delete and writes outside the workspace | Sandboxed shell can auto-run; commands that need full machine access still ask |
| **Claude Code** | **Bash tool** via the same Anthropic sandbox-runtime family | File tools remain a permission model (read-only by default, ask before many writes) | In-box bash skips prompts; out-of-box access notifies |
| **Codex CLI** | Tries to sandbox **shell and `apply_patch`** by routing filesystem work through a sandboxed helper | File edits are supposed to share the OS box | Higher completeness, higher cost; helper/PATH/Landlock regressions are common |

Pho Code follows the **Pi team’s sandbox example** for the wrap, plus **Cursor / Claude Code** for Settings-owned policy and skipped in-box asks. It does not follow Codex’s file-edit helper.

The Pi example is the first-party integration pattern:

- public URL: [earendil-works/pi `examples/extensions/sandbox/index.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/sandbox/index.ts)
- API source of truth for this app: the same file in pinned Pi `0.84.1` (`packages/runtime/node_modules/@earendil-works/pi-coding-agent/examples/extensions/sandbox/index.ts`). If `main` and the pin diverge, the pin wins.

Take from it:

- `SandboxManager.initialize` / `wrapWithSandbox` / `reset`;
- replace built-in `bash` with `createBashTool(cwd, { operations })`;
- hook `user_bash` with the same `BashOperations`;
- `session_start` / `session_shutdown` lifecycle;
- macOS + Linux only.

Do not take from it:

- `~/.pi/agent/extensions/sandbox.json` or project `.pi/sandbox.json`;
- `--no-sandbox`, `/sandbox`, or TUI `notify` / `setStatus`;
- a baked network allowlist that is always active (our optional package-registry toggle may *start from* that example’s npm/PyPI/GitHub hosts, but Settings network default is deny);
- `process.cwd()` as the only workspace (Pho Code is per-session cwd);
- in-process `read`/`write`/`edit` intercept (that is our Milestone 3, not the example).

Pho Code later defaults **enable on** because workspace and temp read/write stay allowed in-policy. That is a Pho product choice, not the example’s always-on registry allowlist.

Codex’s helper is rejected: it fights V3, duplicates Pi fs tools, and is the expensive part of their sandbox.

## Selected product decisions

| Decision | Selection |
| --- | --- |
| Process extraction | **Do not wait.** This add-on is independently promotable. |
| Engine | Pin exact `@anthropic-ai/sandbox-runtime`. Do not depend on `pi-sandbox` or `@carderne/sandbox-runtime`. |
| Pi wrap pattern | Official Pi sandbox example (`createBashTool` operations + `user_bash`). Not `npm:pi-sandbox`. |
| Pho-owned layer | Inline factory / runtime adapter. Structured Settings and existing `select`/`confirm` only. Never `ctx.ui.custom`. |
| OS wrap | Agent `bash` and `user_bash`. Not the owner PTY. |
| File tools | Same Settings filesystem policy, enforced **in-process** before Pi `read`/`write`/`edit`. Not Seatbelt. |
| Permission asks | **No** for in-box sandboxed `bash` and in-policy `read`/`write`/`edit` while sandbox is on and healthy. Permanent-removal and privilege-escalation **denies** remain. Out-of-policy bash is OS `EPERM` (tool error with a sandbox reason, not a silent unsandbox retry). Out-of-policy file tools are denied with the same owner-action copy. MCP, `pho-web`, Cursor SDK, and owner PTY keep today’s permission behavior. |
| Network | **Settings only.** Typed mode + domain list. No runtime “allow this domain” prompt. No project `.pi/sandbox.json`. |
| Filesystem extras | Typed additional read/write paths in Settings, application-owned. Workspace write and documented temp are implicit when enabled. |
| Default | **On.** Missing settings file enables the OS box. Network remains deny. Idle-only apply, same as permission settings. Owner can turn it off. |
| Fail closed | If Settings says on and init fails, **do not run** agent `bash` until the owner turns it off or the dependency is fixed. Do not silently unsandbox. |
| Platform | macOS first. Linux: named `unavailable` / `degraded` diagnostic. Windows: out of scope. |
| `rg` | Bundle or adapter-inject. Do not require Homebrew on GUI `PATH`. |

## Non-goals

This add-on will not:

- extract the Pi runtime, wrap Electron main, or claim Phase F;
- bake `npm:pi-sandbox`, ambient Pi packages, or project sandbox JSON the agent can edit;
- expose generic key/value JSON, arbitrary Seatbelt profiles, proxy ports, or an `srt` CLI to the renderer;
- wrap GitHub MCP, `pho-web`, Cursor SDK, or the owner PTY;
- enable Apple Events, Docker sockets, unauthenticated SOCKS, `allowedDomains: ["*"]`, or Anthropic’s weaker nested/network modes as defaults;
- add a “retry without sandbox” control;
- sandbox Windows;
- replace V3 recovery or the permission-system feature;
- describe confirmation dialogs or renderer sandboxing as OS containment.

## Product invariants

1. **Conversation remains primary.** Sandbox is Settings + tool behavior, not a new dashboard.
2. **Two enforcement planes, one policy.** Settings is the only policy editor. OS enforces bash. Runtime intercepts `read`/`write`/`edit`.
3. **Permission-system stays.** Sandbox suppresses **asks** for in-policy agent bash and file tools. It does not delete denies, YOLO semantics for other tools, or project-permission trust.
4. **No second prompt stack.** Out-of-policy means deny or `EPERM`. The owner changes Settings.
5. **Workspace identity is host-owned.** Write-root is the canonical selected workspace. The renderer cannot supply extra paths except through typed Settings commands already validated in application/runtime.
6. **Session switch is not a policy leak.** Concurrent chats in different workspaces use that session’s cwd as the write-root. Session-only grants are not a product; Settings is durable.
7. **Fail closed without breaking chat.** Missing engine, `rg`, or `sandbox-exec` fails the sandbox feature and, if enabled, blocks agent `bash`. Other tools and conversation continue.
8. **Packaged resources are app-owned.** The unsigned macOS `.app` must load the pinned engine and `rg` without a Pi CLI and without `brew install ripgrep`.
9. **Honesty over completeness.** Copy must name what is boxed (agent bash) and what is only policy-gated (file tools) and what is not (PTY, MCP, Cursor, Pi process).

## Settings contract

New Settings section **Sandbox**, after Permissions. Named commands only (`updateSandboxSettings`), not `setSetting(key, value)`.

| Control | Type | Behavior |
| --- | --- | --- |
| Enable sandbox | boolean, default on | Idle-only apply. When on and healthy, wraps agent bash and applies file-tool policy. |
| Network mode | `deny` \| `allowlist` | `deny`: no agent-bash network. `allowlist`: only listed domains. |
| Allowed domains | bounded string list | Used only in `allowlist`. Exact hosts or a single leading `*.` label (`*.github.com`). Reject `"*"`, empty entries, and oversized lists. |
| Include package-registry defaults | boolean, default off | When on **and** mode is `allowlist`, union a baked, documented registry list. Start that list from the Pi official example’s defaults (npm, Yarn, PyPI, GitHub hosts) plus the same family Cursor publishes for package tools. The baked list is source-controlled, not owner-editable JSON. |
| Additional read paths | bounded path list | Extra readable roots. Canonicalized in privileged code. |
| Additional write paths | bounded path list | Extra writable roots (also readable). Workspace `.` and platform temp are implicit and not shown as raw JSON. |

Hard-coded when enabled (not Settings fields):

- deny read of `~/.ssh`, `~/.aws`, `~/.gnupg`, and Pho Code credential/agent roots;
- deny write of `.env`, `*.pem`, `*.key`, and sandbox-runtime mandatory denies (shell rc, `.git/hooks`, `.git/config`, `.mcp.json`, and the engine’s other always-blocked paths);
- no Apple Events, no all-unix-sockets, no unauthenticated SOCKS, no weaker isolation flags.

Status in the same section: `off` | `starting` | `healthy` | `failed` | `unavailable`, plus a short redacted reason (`rg-missing`, `sandbox-exec`, `unsupported-platform`, `init`). Never proxy ports, Seatbelt profiles, or command strings.

## Permission interaction

While sandbox is **off** or **unavailable**: today’s permission-system behavior is unchanged.

While sandbox is **on and healthy**:

| Tool | Ask? | Enforcement |
| --- | --- | --- |
| Agent `bash` / `user_bash` in box | No | OS Seatbelt + proxy |
| `rm` / other permanent-removal bash | No (deny) | Existing permission deny, before wrap |
| Privilege-escalation bash | No (deny) | Existing permission deny |
| `read` / `write` / `edit` in policy | No | In-process path policy, then Pi fs, then V3 capture on write/edit |
| `read` / `write` / `edit` out of policy | No (deny) | In-process deny |
| `move_to_trash` | Unchanged | Permission-system + OS Trash |
| `web_search` / `fetch_content` | Unchanged | Existing pho-web + permission |
| GitHub MCP / Cursor SDK | Unchanged | Not wrapped |
| Owner PTY keystrokes | Never gated | Not wrapped |

YOLO remains a permission-system setting for tools this add-on does not contain. Enabling sandbox is not YOLO.

If sandbox is **on and failed**: agent `bash` is refused with a named error. File tools keep permission-system behavior until sandbox is healthy or turned off (do not apply a half-initialized OS policy).

## User-visible contract

- Settings → Sandbox is the only owner control surface.
- A compact healthy/failed/off mark may appear in Settings and, if cheap, in the existing permission/status chrome. No lock glyph required in the transcript.
- Tool errors from OS or in-process file-tool deny show as ordinary tool failure text (untrusted). They name the sandbox reason and tell the agent to stop and ask the owner to turn sandbox off or add a path/domain in Settings → Sandbox. Do not offer “Run without sandbox.” After the owner changes Settings, they tell the agent to continue.
- About/Settings copy uses the honesty bullets above.
- Applying Settings waits until the session is idle, matching permission apply.

## Lifecycle

| Owner action | Sandbox manager |
| --- | --- |
| Launch, sandbox off | Do not initialize |
| Enable while idle | `initialize`; wrap subsequent bash; install file-tool intercept |
| Disable while idle | `reset`; restore permission asks; remove intercept |
| Switch chat / workspace | Keep process-level manager; next wrap uses that session cwd |
| Failed init | Stay `failed`; refuse bash; chat continues |
| Quit | `reset` under bounded shutdown |

Application restart restores Settings (including enabled). It does not restore a previous Seatbelt process; `initialize` runs again if still enabled.

## Data

| Data | Owner | Location | User consequence |
| --- | --- | --- | --- |
| Enabled flag, network mode, domain list, extra paths, registry-defaults flag | Sandbox settings adapter | Application data (not Pi JSONL, not project `.pi/`) | Durable owner policy |
| `SandboxManager` proxies / profiles | Runtime | Memory; dies on reset/quit | Local OS box for bash |
| V3 ledger | Unchanged | Unchanged | File-tool writes still captured; bash mutations still are not |
| Permission config | Unchanged | Agent dir as today | Denies still apply |

Diagnostics may report status, platform, redacted error class, domain count, and whether registry defaults are on. They must not ship proxy ports, allowlisted command traces, secrets, or Seatbelt profile text to the renderer.

## Relationship to other tracks

| Track | Relationship |
| --- | --- |
| Permission feature | Stays. Sandbox suppresses in-policy asks and keeps denies. |
| V3 change review | Independent. In-process write/edit still capture. Bash still not undoable. |
| Integrated terminal | Independent. Owner PTY is not wrapped and must stay disclosed as unsandboxed. |
| GitHub MCP / pho-web / Cursor SDK | Out of scope. |
| Phase F | Future process extraction may reuse this engine. Not a prerequisite. |
| Conversation UI | Settings section only. |

## References

- Implementation contract: [`implementation-plan.md`](./implementation-plan.md)
- Research: [`research.md`](./research.md)
- Closed-feature index: [`../README.md`](../README.md)
- Active add-ons: [`../../../features/README.md`](../../../features/README.md)
- Architecture: [`../../../architecture/overview.md`](../../../architecture/overview.md), [`../../../architecture/extension-model.md`](../../../architecture/extension-model.md)
- Terminal honesty: [`../../../features/terminal/product.md`](../../../features/terminal/product.md)
- Phase F: [`../../../version/roadmap-vnext.md`](../../../version/roadmap-vnext.md)
- Pi official sandbox example: [earendil-works/pi `examples/extensions/sandbox/index.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/sandbox/index.ts) (read against pinned `0.84.1`)
- [Cursor Run Modes / sandboxing](https://cursor.com/docs/agent/security/run-modes)
- [Claude Code sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing)
- [Anthropic sandbox-runtime](https://github.com/anthropic-experimental/sandbox-runtime)
