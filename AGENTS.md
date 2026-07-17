# AGENTS.md

## Product orientation

Pho Code is a small independently owned Rust agent harness with a stable `pho` command adapter and a native GPUI adapter over the same runtime. [ADR 0003](docs/decisions/0003-deepseek-api-first-backend.md) owns the accepted backend/runtime product decision, [ADR 0004](docs/decisions/0004-native-workbench-phase-6.md) owns the expanded native workbench surface, and [ADR 0005](docs/decisions/0005-release-v1-and-defer-phase-6b.md) owns the V1 release/deferred Phase 6B boundary; [the documentation index](docs/README.md) routes all current design and delivery work. Do not restate those contracts in code comments or new plans when a link is sufficient.

V1 is macOS-only, one concrete DeepSeek API backend, one root agent, sequential tools, and one shared command/GPUI runtime. The ChatGPT OAuth attempt is frozen historical/developer-only work and never a runtime fallback. Compaction, subagents, a second supported real backend, custom provider endpoints, strong sandboxing, and portability remain V2 roadmap items.

## Read before changing code

Read in this order:

1. [Documentation index](docs/README.md) for authority, terminology, evidence policy, and current status.
2. [ADR 0003](docs/decisions/0003-deepseek-api-first-backend.md) for the accepted backend/runtime boundary and reversal conditions.
3. [ADR 0004](docs/decisions/0004-native-workbench-phase-6.md) and [ADR 0005](docs/decisions/0005-release-v1-and-defer-phase-6b.md) when the native workbench, V1 release, or Phase 6B scope is relevant.
4. [Native harness system](docs/architecture/native-harness-system.md) for components, dependencies, state, and event flow.
5. The component contract relevant to the task: [DeepSeek backend](docs/architecture/deepseek-api-backend.md), [tools](docs/architecture/tools.md), [sessions](docs/architecture/sessions.md), [GPUI workbench](docs/architecture/gpui-workbench.md), [native workbench lifecycle](docs/architecture/native-workbench-lifecycle.md), [workspace inspection](docs/architecture/workbench-workspaces.md), or [user terminal](docs/architecture/user-terminal.md).
6. The current phase under [the implementation roadmap](docs/implementation/README.md).
7. [Pi](docs/research/pi-source-study.md), [Codex](docs/research/codex-source-study.md), or the Phase 6 source studies only when upstream behavior or rationale matters.
8. `Cargo.toml` and relevant `src/**` files to verify what is actually implemented.

`refs/**` is read-only evidence, not application code or an extension point. Do not modify it or copy source without explicit authorization and license review.

## Documentation ownership

- ADRs own accepted decisions and are append-only in intent.
- Architecture owns current behavior and state contracts.
- `docs/implementation/**` owns order, work packages, evidence, and gates.
- `docs/qualification/**` owns dated live compatibility results.
- `docs/README.md` owns the map, glossary, evidence vocabulary, and current pointer.
- This file owns contributor workflow and repository commands.

When documents disagree, stop and repair the authority boundary rather than choosing the most convenient statement.

## Rust and module rules

- Keep command parsing/rendering and GPUI views separate from credential custody, provider transport, stream decoding, the loop, tools, and sessions.
- Keep provider DTOs private to the concrete backend, Keychain values private to the credential actor, and terminal/GPUI types out of headless modules.
- Use explicit domain types for workspace, session, turn, item, backend request, tool call, approval, artifact, and lifecycle state. Keep local and provider identities distinct.
- Handle runtime input without panic. Required transitions are exhaustive; unknown optional input is tolerated only when continuation remains unambiguous.
- Bound queues, frames, arguments, reads, output, artifacts, retries, timeouts, and concurrency.
- Add safe operation/identity/state context to errors without logging prompts, provider reasoning/replay content, absolute or personal host paths, file bodies, command output, environment values, credentials, account data, or headers. Validated workspace-relative paths may appear only in structured user-facing tool/session errors where the component contract requires them for recovery.
- Prefer direct code. Add traits, generics, macros, registries, or serialization layers only after a tested boundary justifies them.
- Comments explain ownership or safety rationale, not syntax.

## Presentation and runtime rules

The `pho` command adapter and GPUI views render projected state and dispatch the same typed intents. They do not wait on network, Keychain, files, journals, processes, or tools except through coordinator-owned application operations. A command must not implement a probe-only backend path, and GPUI must not spawn `pho`. Completed assistant phases and tool results are authoritative over deltas.

Do not bypass the linked component contracts. In particular: never auto-approve patch or shell; never execute incomplete tool arguments; never accept a DeepSeek API key through argv, environment, project files, or ordinary stdin; never accept prompt content as a positional argument; never import Pi/Codex credentials; never silently truncate context; never discard provider-required reasoning/call grouping; never replay an approval or uncertain effect after restart; never claim the approved shell is a sandbox.

Command mode obtains secrets and mutating approvals only from a controlling terminal. `pho chat --stdin` is an explicit prompt-input mode and does not turn stdin into an approval channel. Missing TTY, EOF, broken pipe, terminal loss, cancellation, or process restart never implies approval.

## Build and test workflow

The repository is currently one Rust package. Use only commands supported by the current manifest. Build with `cargo build`. The target user executable is `pho`; after Phase 1B adds that binary, launch commands with `cargo run --bin pho -- <command>`. Until the manifest contains it, do not claim the command surface exists or invent unsupported invocations.

For a focused change, run the narrowest relevant check first, then broaden:

```sh
cargo fmt -- --check
cargo check
cargo build
cargo test
cargo clippy --all-targets --all-features -- -D warnings
```

Run `cargo fmt` when formatting is part of the change. A dependency-fetch failure, unavailable or unfunded DeepSeek account/key, missing Keychain/controlling-terminal/native environment, or platform limitation is a verification gap, not a pass. Do not claim live compatibility, command behavior, crash durability, process cleanup, packaging, or native interaction without exercising it.

## Change discipline

Preserve unrelated user-owned changes and inspect current files before editing. Assume concurrent agents share the worktree: give delegated work explicit ownership, avoid overlapping writes, and review actual changes before integration.

Update documentation when behavior, ownership, compatibility, security, persisted data, or acceptance criteria change. For a decision reversal, add a superseding ADR rather than rewriting accepted rationale.

Commit subjects use `[{identification}] {imperative summary}`. Use the owning delivery phase for phase-scoped work, such as `[phase 1B] implement DeepSeek qualification`; otherwise use the narrowest stable identifier among `[bug]`, `[feat]`, `[security]`, `[refactor]`, `[test]`, `[docs]`, or `[chore]`. Keep the identification lowercase except for an established phase suffix, keep the summary concise, and do not combine unrelated changes under a broad label.

Before handoff, inspect status and changes, run relevant checks, and state exactly what ran and what could not run.

## Deletion protection

Never permanently delete files or directories unless the user first explicitly changes this policy. Detect the operating system and use its recoverable mechanism: `/usr/bin/trash <absolute-path>` on macOS without inserting `--`; `trash-put` or `gio trash` on Linux; a verified Recycle Bin method on Windows. Stop if no recoverable mechanism exists. First-party structured deletions must follow the same rule.

Do not silently rewrite a destructive command into a Trash command; block it and report the verified recoverable alternative. Treat hooks and command rules as guardrails, not an operating-system security boundary, and scope guardrail changes narrowly around managed policies. Back up any file that must be replaced. Check whether machine backups are configured when relevant, but do not enable or modify them without permission.
